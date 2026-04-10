import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { getTenantContext, TenantDataSourceManager, TenantRoutingService, runWithTenantContext } from '@enkap/database';
import { MailerService } from '@enkap/mailer';
import { Shipment, CarrierCode, ShipmentStatus, PaymentType } from './entities/shipment.entity';
import { CreateShipmentDto, UpdateShipmentStatusDto } from './dto/create-shipment.dto';
import { ArasCargoClient } from './carriers/aras.client';
import { YurticiCargoClient } from './carriers/yurtici.client';
import { PttCargoClient } from './carriers/ptt.client';

/** Kargo listesi filtreleme seçenekleri */
interface ShipmentFilters {
  status?: ShipmentStatus;
  carrier?: CarrierCode;
}

/** Kargo durum sorgulama yanıtı (DB'ye dokunmadan) */
interface TrackingResult {
  status: ShipmentStatus;
  description: string;
  estimatedDelivery?: Date;
}

/**
 * Lojistik / Kargo Gönderisi Servisi.
 *
 * Aras, Yurtiçi ve PTT kargo firmalarına gönderi oluşturma,
 * takip ve etiket alma işlemlerini yönetir.
 *
 * Tenant izolasyonu: TenantDataSourceManager ile sağlanır.
 * E-posta bildirimi: MailerService üzerinden (fire-and-forget).
 * Otomatik durum güncelleme: 30 dakikada bir polling cron (tüm tenantlar).
 */
@Injectable()
export class ShipmentService {
  private readonly logger = new Logger(ShipmentService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly arasClient: ArasCargoClient,
    private readonly yurticiClient: YurticiCargoClient,
    private readonly pttClient: PttCargoClient,
    private readonly tenantRoutingService: TenantRoutingService,
    private readonly mailerService: MailerService,
  ) {}

  private async repo() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return { repo: ds.getRepository(Shipment), tenantId };
  }

  /**
   * Yeni kargo gönderisi oluşturur.
   *
   * 1. Tenant context'ten tenantId alınır.
   * 2. Seçilen kargo firmasının API'si çağrılır.
   * 3. Gönderi entity oluşturulup kaydedilir.
   * 4. recipient_email varsa "kargonuz oluşturuldu" e-postası gönderilir.
   */
  async createShipment(dto: CreateShipmentDto): Promise<Shipment> {
    const { repo, tenantId } = await this.repo();

    // Seçilen kargo firmasına göre API çağrısı yap
    const { trackingNumber, carrierId } = await this.callCarrierCreate(dto, tenantId);

    const shipment = repo.create({
      tenantId,
      orderReference: dto.orderReference,
      carrier: dto.carrier,
      trackingNumber,
      carrierShipmentId: carrierId,
      senderName: dto.senderName,
      senderAddress: dto.senderAddress,
      senderCity: dto.senderCity,
      senderPhone: dto.senderPhone,
      recipientName: dto.recipientName,
      recipientAddress: dto.recipientAddress,
      recipientCity: dto.recipientCity,
      recipientDistrict: dto.recipientDistrict ?? null,
      recipientPhone: dto.recipientPhone,
      recipientEmail: dto.recipientEmail ?? null,
      weightKg: dto.weightKg,
      desi: dto.desi ?? null,
      paymentType: dto.paymentType ?? PaymentType.SENDER,
      status: ShipmentStatus.CREATED,
    });

    const saved: Shipment = await repo.save(shipment);

    this.logger.log(
      `Kargo gönderisi oluşturuldu: ${saved.id} / ${saved.carrier} / ${saved.trackingNumber} (tenantId=${tenantId})`,
    );

    // Alıcıya e-posta bildirimi — akışı durdurma
    if (saved.recipientEmail) {
      this.mailerService
        .send({
          to: saved.recipientEmail,
          subject: 'Kargonuz Yola Çıktı',
          html: `<p>Sayın ${saved.recipientName},</p><p>Kargonuz <strong>${this.getCarrierName(saved.carrier)}</strong> ile yola çıktı. Takip numaranız: <strong>${saved.trackingNumber}</strong></p>`,
          text: `Sayın ${saved.recipientName}, kargonuz ${this.getCarrierName(saved.carrier)} ile yola çıktı. Takip numaranız: ${saved.trackingNumber}`,
        })
        .catch((err: unknown) => {
          this.logger.warn(
            `Kargo oluşturma e-postası gönderilemedi (shipmentId=${saved.id}): ${String(err)}`,
          );
        });
    }

    return saved;
  }

  /**
   * Belirli bir gönderinin durumunu kargo firmasından sorgular ve günceller.
   * DELIVERED durumuna geçişte delivered_at set edilir ve e-posta gönderilir.
   */
  async trackShipment(id: string): Promise<Shipment> {
    const { repo, tenantId } = await this.repo();

    const shipment = await repo.findOne({ where: { id, tenantId } });

    if (!shipment) {
      throw new NotFoundException(`Gönderi bulunamadı: ${id}`);
    }

    const trackingResult = await this.callCarrierTrack(
      shipment.carrier,
      shipment.trackingNumber ?? id,
    );

    const wasDelivered = shipment.status !== ShipmentStatus.DELIVERED;

    shipment.status = trackingResult.status;
    shipment.statusDescription = trackingResult.description;
    shipment.lastCheckedAt = new Date();

    if (trackingResult.estimatedDelivery) {
      shipment.estimatedDeliveryDate = trackingResult.estimatedDelivery;
    }

    // Teslim edildi — delivered_at ve e-posta bildirimi (idempotent: sadece ilk kez)
    if (trackingResult.status === ShipmentStatus.DELIVERED && wasDelivered && !shipment.deliveredAt) {
      shipment.deliveredAt = new Date();
      this.sendDeliveryNotification(shipment);
    }

    const updated = await repo.save(shipment);

    this.logger.log(
      `Gönderi durumu güncellendi: ${id} → ${trackingResult.status} (tenantId=${tenantId})`,
    );

    return updated;
  }

  /**
   * Takip numarası ile anlık durum sorgusu — DB'ye dokunmadan.
   * Açık endpoint için (müşteri self-servis takip).
   */
  async trackByTrackingNumber(
    trackingNumber: string,
    carrier: CarrierCode,
  ): Promise<{ status: ShipmentStatus; description: string }> {
    const result = await this.callCarrierTrack(carrier, trackingNumber);
    return { status: result.status, description: result.description };
  }

  /**
   * Tenant'ın gönderilerini listeler.
   * Opsiyonel filtre: durum ve kargo firması.
   */
  async listShipments(filters?: ShipmentFilters): Promise<Shipment[]> {
    const { repo, tenantId } = await this.repo();

    const where: FindOptionsWhere<Shipment> = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.carrier) where.carrier = filters.carrier;

    return repo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Belirli bir gönderinin detayını döner.
   * Cross-tenant erişim engeli: tenantId ile filtreleme.
   */
  async getShipment(id: string): Promise<Shipment> {
    const { repo, tenantId } = await this.repo();
    const shipment = await repo.findOne({ where: { id, tenantId } });
    if (!shipment) {
      throw new NotFoundException(`Gönderi bulunamadı: ${id}`);
    }
    return shipment;
  }

  /**
   * Kargo etiketi PDF'ini base64 string olarak döner.
   * Frontend PDF olarak render eder veya yazıcıya gönderir.
   */
  async getLabel(id: string): Promise<string> {
    const shipment = await this.getShipment(id);

    if (!shipment.trackingNumber) {
      throw new NotFoundException(`Gönderi için henüz takip numarası atanmamış: ${id}`);
    }

    switch (shipment.carrier) {
      case CarrierCode.ARAS:
        return this.arasClient.getLabel(shipment.trackingNumber);
      case CarrierCode.YURTICI:
        return this.yurticiClient.getLabel(shipment.trackingNumber);
      case CarrierCode.PTT:
        return this.pttClient.getLabel(shipment.trackingNumber);
      default: {
        const exhaustiveCheck: never = shipment.carrier;
        throw new Error(`Bilinmeyen kargo firması: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Kargo firmasından gelen webhook bildirimine göre durumu günceller.
   * carrier_shipment_id ile tüm aktif tenant'lar taranır.
   *
   * Not: Webhook kargo firmasından geldiği için başlangıçta tenant context yoktur.
   */
  async handleWebhook(dto: UpdateShipmentStatusDto, carrier: CarrierCode): Promise<void> {
    const tenantIds = await this.tenantRoutingService.findAllActiveIds();

    for (const tenantId of tenantIds) {
      await runWithTenantContext(
        { tenantId, userId: 'webhook', sessionId: 'webhook', userRoles: [], tier: 'starter' },
        async () => {
          const ds = await this.dsManager.getDataSource(tenantId);
          const repo = ds.getRepository(Shipment);

          const shipment = await repo.findOne({
            where: { carrierShipmentId: dto.carrierShipmentId, carrier },
          });

          if (!shipment) return;

          const wasDelivered = shipment.status !== ShipmentStatus.DELIVERED;

          shipment.status = dto.status;
          shipment.statusDescription = dto.description;
          shipment.lastCheckedAt = new Date();

          if (dto.status === ShipmentStatus.DELIVERED && wasDelivered && !shipment.deliveredAt) {
            shipment.deliveredAt = new Date(dto.timestamp);
            this.sendDeliveryNotification(shipment);
          }

          await repo.save(shipment);

          this.logger.log(
            `Webhook durum güncellemesi: ${shipment.id} → ${dto.status} (tenant=${tenantId}, carrier=${carrier})`,
          );
        },
      );
    }
  }

  /**
   * Aktif kargo gönderilerinin durumunu otomatik olarak günceller.
   * Her 30 dakikada bir çalışır.
   * Tüm aktif tenant'ların shipment'ları taranır.
   */
  @Cron('0 */30 * * * *')
  async pollShipmentStatuses(): Promise<void> {
    this.logger.log('Kargo durum polling başlıyor...');

    const tenantIds = await this.tenantRoutingService.findAllActiveIds();

    const activeStatuses = [
      ShipmentStatus.PENDING,
      ShipmentStatus.CREATED,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.OUT_FOR_DELIVERY,
    ];

    let totalPolled = 0;
    let totalFailed = 0;

    for (const tenantId of tenantIds) {
      await runWithTenantContext(
        { tenantId, userId: 'system', sessionId: 'cron', userRoles: [], tier: 'starter' },
        async () => {
          const ds = await this.dsManager.getDataSource(tenantId);
          const repo = ds.getRepository(Shipment);

          let activeShipments: Shipment[];
          try {
            activeShipments = await repo
              .createQueryBuilder('s')
              .where('s.status IN (:...statuses)', { statuses: activeStatuses })
              .andWhere('s.tracking_number IS NOT NULL')
              .getMany();
          } catch (err: unknown) {
            this.logger.error(`Polling: ${tenantId} gönderi listesi alınamadı: ${String(err)}`);
            return;
          }

          if (activeShipments.length === 0) return;

          const results = await Promise.allSettled(
            activeShipments.map((shipment) => this.pollSingleShipment(repo, shipment)),
          );

          totalPolled += results.filter((r) => r.status === 'fulfilled').length;
          totalFailed += results.filter((r) => r.status === 'rejected').length;
        },
      );
    }

    this.logger.log(`Polling tamamlandı: ${totalPolled} başarılı, ${totalFailed} hatalı`);
  }

  // ---- Private Yardımcı Metodlar ----

  /** Tek bir gönderinin durumunu günceller (cron polling için) */
  private async pollSingleShipment(repo: Repository<Shipment>, shipment: Shipment): Promise<void> {
    try {
      const result = await this.callCarrierTrack(
        shipment.carrier,
        shipment.trackingNumber!, // Çağrıdan önce NOT NULL kontrolü yapıldı
      );

      const wasDelivered = shipment.status !== ShipmentStatus.DELIVERED;
      const statusChanged = shipment.status !== result.status;

      shipment.status = result.status;
      shipment.statusDescription = result.description;
      shipment.lastCheckedAt = new Date();

      if (result.estimatedDelivery) {
        shipment.estimatedDeliveryDate = result.estimatedDelivery;
      }

      // Teslim edildi — idempotent: sadece ilk geçişte bildir
      if (result.status === ShipmentStatus.DELIVERED && wasDelivered && !shipment.deliveredAt) {
        shipment.deliveredAt = new Date();
        this.sendDeliveryNotification(shipment);
      }

      if (statusChanged) {
        await repo.save(shipment);
        this.logger.debug(
          `Polling: ${shipment.id} (${shipment.carrier}) → ${result.status}`,
        );
      }
    } catch (err: unknown) {
      this.logger.warn(
        `Polling: Gönderi sorgulanamadı (id=${shipment.id}, tracking=${shipment.trackingNumber}): ${String(err)}`,
      );
      throw err;
    }
  }

  /** Seçilen kargo firmasına göre gönderi oluşturma API'sini çağırır */
  private async callCarrierCreate(
    dto: CreateShipmentDto,
    tenantId: string,
  ): Promise<{ trackingNumber: string; carrierId: string }> {
    switch (dto.carrier) {
      case CarrierCode.ARAS:
        return this.arasClient.createShipment(dto, tenantId);
      case CarrierCode.YURTICI:
        return this.yurticiClient.createShipment(dto, tenantId);
      case CarrierCode.PTT:
        return this.pttClient.createShipment(dto, tenantId);
      default: {
        const exhaustiveCheck: never = dto.carrier;
        throw new Error(`Bilinmeyen kargo firması: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /** Seçilen kargo firmasına göre takip API'sini çağırır */
  private async callCarrierTrack(
    carrier: CarrierCode,
    trackingNumber: string,
  ): Promise<TrackingResult> {
    switch (carrier) {
      case CarrierCode.ARAS:
        return this.arasClient.trackShipment(trackingNumber);
      case CarrierCode.YURTICI:
        return this.yurticiClient.trackShipment(trackingNumber);
      case CarrierCode.PTT:
        return this.pttClient.trackShipment(trackingNumber);
      default: {
        const exhaustiveCheck: never = carrier;
        throw new Error(`Bilinmeyen kargo firması: ${String(exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Teslim e-postası gönderir — fire-and-forget.
   * deliveredAt set edildikten sonra çağrılır; idempotency kontrolü caller'da.
   */
  private sendDeliveryNotification(shipment: Shipment): void {
    if (!shipment.recipientEmail) return;

    this.mailerService
      .send({
        to: shipment.recipientEmail,
        subject: 'Kargonuz Teslim Edildi',
        html: `<p>Sayın ${shipment.recipientName},</p><p><strong>${this.getCarrierName(shipment.carrier)}</strong> kargonuz teslim edildi. Takip no: <strong>${shipment.trackingNumber}</strong></p>`,
        text: `Sayın ${shipment.recipientName}, ${this.getCarrierName(shipment.carrier)} kargonuz teslim edildi. Takip no: ${shipment.trackingNumber}`,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Teslim e-postası gönderilemedi (shipmentId=${shipment.id}): ${String(err)}`,
        );
      });
  }

  /** Kargo firması enum → Türkçe görünen ad */
  private getCarrierName(carrier: CarrierCode): string {
    const names: Record<CarrierCode, string> = {
      [CarrierCode.ARAS]: 'Aras Kargo',
      [CarrierCode.YURTICI]: 'Yurtiçi Kargo',
      [CarrierCode.PTT]: 'PTT Kargo',
    };
    return names[carrier];
  }
}

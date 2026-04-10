import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { MailerService } from '@enkap/mailer';
import { SalesOrder }     from './entities/sales-order.entity';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { Delivery }       from './entities/delivery.entity';
import type { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { WaybillEventsPublisher } from '../events/waybill-events.publisher';

/** SO numarası üreteci — format: SO-{YYYY}-{NNNN} */
async function generateSoNumber(dataSource: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await dataSource.query<[{ seq: string }]>(
    `SELECT LPAD(nextval('so_seq_${year}')::text, 4, '0') AS seq`,
  ).catch(async () => {
    await dataSource.query(`CREATE SEQUENCE IF NOT EXISTS so_seq_${year} START 1`);
    return dataSource.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('so_seq_${year}')::text, 4, '0') AS seq`,
    );
  });
  return `SO-${year}-${result[0].seq}`;
}

async function generateDeliveryNumber(dataSource: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await dataSource.query<[{ seq: string }]>(
    `SELECT LPAD(nextval('irs_seq_${year}')::text, 4, '0') AS seq`,
  ).catch(async () => {
    await dataSource.query(`CREATE SEQUENCE IF NOT EXISTS irs_seq_${year} START 1`);
    return dataSource.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('irs_seq_${year}')::text, 4, '0') AS seq`,
    );
  });
  return `IRS-${year}-${result[0].seq}`;
}

@Injectable()
export class SalesOrderService {
  private readonly logger = new Logger(SalesOrderService.name);

  constructor(
    private readonly dsManager:        TenantDataSourceManager,
    private readonly httpService:      HttpService,
    private readonly config:           ConfigService,
    private readonly mailer:           MailerService,
    private readonly waybillPublisher: WaybillEventsPublisher,
  ) {}

  /** Tenant DataSource + repository'leri döndür */
  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      orderRepo:    ds.getRepository(SalesOrder),
      lineRepo:     ds.getRepository(SalesOrderLine),
      deliveryRepo: ds.getRepository(Delivery),
      dataSource:   ds,
      tenantId,
    };
  }

  /** Yeni satış siparişi oluştur */
  async create(dto: CreateSalesOrderDto, createdBy: string): Promise<SalesOrder> {
    const { orderRepo, lineRepo, dataSource, tenantId } = await this.repos();

    if (!dto.lines?.length) {
      throw new BadRequestException('En az bir sipariş kalemi gereklidir.');
    }

    const soNumber = await generateSoNumber(dataSource);

    let kdv = 0;

    const lines = dto.lines.map(l => {
      const gross   = Math.round(l.quantity * l.unitPriceKurus);
      const disc    = Math.round(gross * (l.discountRate ?? 0) / 100);
      const net     = gross - disc;
      const lineKdv = Math.round(net * l.kdvRate / 100);
      kdv          += lineKdv;
      return lineRepo.create({
        tenantId,
        productId:      l.productId,
        productName:    l.productName,
        unitCode:       l.unitCode ?? 'ADET',
        quantity:       l.quantity,
        unitPriceKurus: l.unitPriceKurus,
        discountRate:   l.discountRate ?? 0,
        kdvRate:        l.kdvRate,
        lineTotalKurus: net,
      });
    });

    const total = lines.reduce((s, l) => s + Number(l.lineTotalKurus), 0);

    const order = orderRepo.create({
      tenantId,
      soNumber,
      customerId:      dto.customerId,
      status:          'draft',
      orderDate:       new Date(dto.orderDate),
      deliveryDate:    dto.promisedDeliveryDate ? new Date(dto.promisedDeliveryDate) : undefined,
      deliveryAddress: dto.deliveryAddress ? JSON.stringify(dto.deliveryAddress) : undefined,
      kdvKurus:        kdv,
      totalKurus:      total + kdv,
      notes:           dto.notes,
      createdBy,
      lines,
    });

    return orderRepo.save(order);
  }

  /** Sipariş listesi */
  async findAll(params?: {
    status?:     string;
    customerId?: string;
    limit?:      number;
    offset?:     number;
  }): Promise<{ data: SalesOrder[]; total: number }> {
    const { orderRepo, tenantId } = await this.repos();

    const qb = orderRepo.createQueryBuilder('so')
      .leftJoinAndSelect('so.lines', 'line')
      .where('so.tenant_id = :tenantId', { tenantId })
      .orderBy('so.created_at', 'DESC');

    if (params?.status)     qb.andWhere('so.status = :status',   { status: params.status });
    if (params?.customerId) qb.andWhere('so.customer_id = :cid', { cid: params.customerId });

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const [data, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { data, total };
  }

  /** Sipariş detayı */
  async findOne(id: string): Promise<SalesOrder> {
    const { orderRepo, tenantId } = await this.repos();
    const order = await orderRepo.findOne({
      where: { id, tenantId },
      relations: ['lines'],
    });
    if (!order) throw new NotFoundException(`Satış siparişi bulunamadı: ${id}`);
    return order;
  }

  /** Sipariş onaylama (draft → confirmed) */
  async confirm(id: string): Promise<SalesOrder> {
    const { orderRepo } = await this.repos();
    const order = await this.findOne(id);
    if (order.status !== 'draft') {
      throw new ConflictException(`Sipariş onaylanamaz: mevcut durum ${order.status}`);
    }
    order.status = 'confirmed';
    return orderRepo.save(order);
  }

  /** Hazırlanmaya başla (confirmed → processing) */
  async startPicking(id: string): Promise<SalesOrder> {
    const { orderRepo } = await this.repos();
    const order = await this.findOne(id);
    if (order.status !== 'confirmed') {
      throw new ConflictException(`Hazırlanamaz: mevcut durum ${order.status}`);
    }
    order.status = 'processing';
    return orderRepo.save(order);
  }

  /**
   * Sevkiyat kaydı oluştur
   *
   * 1. Delivery belgesi kaydet
   * 2. Her kalem için stock-service CIKIS hareketi gönder (HTTP)
   * 3. SO → shipped
   * 4. Müşteriye bildirim e-postası gönder (fire-and-forget)
   *
   * Compensating transaction: stock HTTP başarısız olursa Delivery silinir.
   */
  async createDelivery(
    orderId: string,
    items: Array<{
      productId:   string;
      productName: string;
      warehouseId: string;
      quantity:    number;
    }>,
    shipDate:     string,
    carrier?:     string,
    tracking?:    string,
    createdBy?:   string,
    authToken?:   string,
    vehicleId?:   string,
    driverId?:    string,
    origin?:      string,
    destination?: string,
  ): Promise<Delivery> {
    const { deliveryRepo, dataSource, tenantId } = await this.repos();
    const order = await this.findOne(orderId);

    if (!['processing', 'shipped', 'confirmed'].includes(order.status)) {
      throw new ConflictException(`Sevkiyat oluşturulamaz: sipariş durumu ${order.status}`);
    }

    const deliveryNumber = await generateDeliveryNumber(dataSource);

    // 1. Delivery kaydet
    const delivery = await deliveryRepo.save(
      deliveryRepo.create({
        tenantId,
        salesOrderId:   orderId,
        deliveryNumber,
        status:         'pending',
        deliveryDate:   new Date(shipDate),
        items:          items.map(i => ({ ...i })),
        carrier,
        trackingNumber: tracking,
        vehicleId,
        driverId,
        stockSynced:    false,
        createdBy:      createdBy ?? 'system',
      }),
    );

    // 2. Stock-service CIKIS hareketi
    const stockUrl = this.config.get('STOCK_SERVICE_URL', 'http://localhost:3004');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = authToken;

    let syncError: string | undefined;
    const syncedItems = [...delivery.items];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const res = await firstValueFrom(
          this.httpService.post<{ id: string }>(
            `${stockUrl}/api/v1/movements`,
            {
              productId:     item.productId,
              warehouseId:   item.warehouseId,
              type:          'CIKIS',
              quantity:      item.quantity,
              referenceType: 'sales_order',
              referenceId:   order.soNumber,
              notes:         `Sevkiyat: ${deliveryNumber}`,
            },
            { headers },
          ),
        );
        syncedItems[i].movementId = res.data.id;
      } catch (err: unknown) {
        syncError = `Ürün ${item.productId}: ${String(err)}`;
        this.logger.error(`[${tenantId}] Stok CIKIS hatası ${deliveryNumber}: ${syncError}`);
        break;
      }
    }

    if (syncError) {
      await deliveryRepo.delete(delivery.id);
      throw new BadRequestException(`Stok çıkışı kaydedilemedi: ${syncError}`);
    }

    // Delivery güncelle
    delivery.items       = syncedItems;
    delivery.stockSynced = true;
    delivery.status      = 'dispatched';
    await deliveryRepo.save(delivery);

    // 3. SO → shipped
    const { orderRepo } = await this.repos();
    order.status = 'shipped';
    await orderRepo.save(order);

    // 4. Fleet-service sefer oluştur (kendi aracıyla sevk — fire-and-forget)
    if (vehicleId && driverId) {
      const fleetUrl = this.config.get('FLEET_SERVICE_URL', 'http://localhost:3017');
      const fleetHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) fleetHeaders['Authorization'] = authToken;

      firstValueFrom(
        this.httpService.post(
          `${fleetUrl}/api/v1/trips`,
          {
            vehicleId,
            driverId,
            deliveryId:       delivery.id,
            salesOrderId:     orderId,
            origin:           origin      ?? '',
            destination:      destination ?? '',
            plannedDeparture: new Date(shipDate).toISOString(),
          },
          { headers: fleetHeaders },
        ),
      ).then(res => {
        const tripId = (res.data as { id: string }).id;
        delivery.tripId = tripId;
        return deliveryRepo.save(delivery);
      }).catch((err: unknown) =>
        this.logger.warn(`[${tenantId}] Fleet sefer oluşturulamadı (${deliveryNumber}): ${String(err)}`),
      );
    }

    // 5. Müşteri bildirim e-postası (fire-and-forget) — müşteri e-postası CRM'den alınabilir
    this.logger.log(`[${tenantId}] Sevkiyat tamamlandı: ${deliveryNumber} (SO: ${order.soNumber})`);

    // waybill-service'e event gönder — SATIS irsaliyesi otomatik oluşturulsun
    this.waybillPublisher.publishDeliveryCreated({
      tenantId,
      deliveryId:     delivery.id,
      deliveryNumber,
      salesOrderId:   orderId,
      soNumber:       order.soNumber,
      shipDate:       shipDate,
      customerName:   '',
      carrierName:    carrier,
      trackingNumber: tracking,
      vehiclePlate:   undefined,
      driverName:     undefined,
      items: items.map(i => ({
        productId:   i.productId,
        productName: i.productName,
        sku:         undefined,
        unitCode:    'ADET',
        quantity:    i.quantity,
        warehouseId: i.warehouseId,
      })),
    });

    return delivery;
  }

  /** Sipariş iptal et */
  async cancel(id: string): Promise<SalesOrder> {
    const { orderRepo } = await this.repos();
    const order = await this.findOne(id);
    if (['delivered', 'cancelled'].includes(order.status)) {
      throw new ConflictException(`Sipariş iptal edilemez: mevcut durum ${order.status}`);
    }
    order.status = 'cancelled';
    return orderRepo.save(order);
  }

  /** Siparişe ait sevkiyat listesi */
  async getDeliveries(orderId: string): Promise<Delivery[]> {
    const { deliveryRepo, tenantId } = await this.repos();
    await this.findOne(orderId); // erişim kontrolü
    return deliveryRepo.find({
      where: { salesOrderId: orderId, tenantId },
      order: { createdAt: 'DESC' },
    });
  }
}

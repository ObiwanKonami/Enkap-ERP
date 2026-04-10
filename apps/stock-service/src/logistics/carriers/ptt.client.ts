import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ShipmentStatus } from '../entities/shipment.entity';
import type { CreateShipmentDto } from '../dto/create-shipment.dto';

/** PTT Kargo API yanıtı — gönderi oluşturma */
interface PttCreateResponse {
  success: boolean;
  barcode: string;       // Kargo takip barkodu
  shipmentId: string;    // PTT iç gönderi ID'si
  error?: string;
}

/** PTT Kargo API yanıtı — durum sorgulama */
interface PttTrackResponse {
  success: boolean;
  status: string;        // PTT kendi durum kodu
  statusDescription: string;
  estimatedDeliveryDate?: string; // ISO tarih
  error?: string;
}

/** PTT kargo durum kodu → Enkap ShipmentStatus dönüşüm tablosu */
const PTT_STATUS_MAP: Record<string, ShipmentStatus> = {
  KABUL: ShipmentStatus.CREATED,
  DAGITIMDA: ShipmentStatus.IN_TRANSIT,
  DAGITIMA_CIKTI: ShipmentStatus.OUT_FOR_DELIVERY,
  TESLIM_EDILDI: ShipmentStatus.DELIVERED,
  TESLIM_EDILEMEDI: ShipmentStatus.FAILED,
  IADE: ShipmentStatus.RETURNED,
};

/**
 * PTT Kargo API istemcisi.
 *
 * Kimlik doğrulama: API Key (X-API-Key header)
 * Base URL: PTT_API_URL env değişkeni
 *
 * Env yoksa stub modda çalışır — gerçek API çağrısı yapılmaz.
 * Belge: https://eticaret.ptt.gov.tr/api-docs
 */
@Injectable()
export class PttCargoClient {
  private readonly logger = new Logger(PttCargoClient.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Yeni gönderi oluşturur.
   * PTT Kargo REST API'sine bağlanır.
   * Env yoksa stub mod: gerçek istek gönderilmez.
   */
  async createShipment(
    dto: CreateShipmentDto,
    tenantId: string,
  ): Promise<{ trackingNumber: string; carrierId: string }> {
    const apiUrl = process.env['PTT_API_URL'];

    if (!apiUrl) {
      this.logger.warn(
        `PTT_API_URL tanımlı değil — stub mod aktif (tenantId=${tenantId}, ref=${dto.orderReference})`,
      );
      return {
        trackingNumber: `PTT-STUB-${Date.now()}`,
        carrierId: 'stub-001',
      };
    }

    const payload = {
      referenceNo: `${tenantId.slice(0, 8)}-${dto.orderReference}`,
      sender: {
        name: dto.senderName,
        address: dto.senderAddress,
        city: dto.senderCity,
        phone: dto.senderPhone,
      },
      receiver: {
        name: dto.recipientName,
        address: dto.recipientAddress,
        city: dto.recipientCity,
        district: dto.recipientDistrict ?? '',
        phone: dto.recipientPhone,
      },
      weight: dto.weightKg,
      desi: dto.desi ?? 0,
      // PTT: 'GONDEREN' veya 'ALICI' ödeme tipi
      paymentType: dto.paymentType === 'recipient' ? 'ALICI' : 'GONDEREN',
    };

    const response = await firstValueFrom(
      this.httpService.post<PttCreateResponse>(`${apiUrl}/v1/shipments`, payload, {
        headers: this.buildHeaders(),
        timeout: 30_000,
      }),
    );

    if (!response.data.success) {
      throw new Error(
        `PTT Kargo gönderi oluşturma başarısız: ${response.data.error ?? 'Bilinmeyen hata'}`,
      );
    }

    this.logger.log(
      `PTT Kargo gönderisi oluşturuldu: ${response.data.barcode} (tenantId=${tenantId})`,
    );

    return {
      trackingNumber: response.data.barcode,
      carrierId: response.data.shipmentId,
    };
  }

  /**
   * Verilen takip numarasının güncel durumunu sorgular.
   */
  async trackShipment(
    trackingNumber: string,
  ): Promise<{ status: ShipmentStatus; description: string; estimatedDelivery?: Date }> {
    const apiUrl = process.env['PTT_API_URL'];

    if (!apiUrl) {
      this.logger.warn(`PTT_API_URL tanımlı değil — stub mod aktif (tracking=${trackingNumber})`);
      return {
        status: ShipmentStatus.IN_TRANSIT,
        description: 'Stub: Kargoda',
      };
    }

    const response = await firstValueFrom(
      this.httpService.get<PttTrackResponse>(
        `${apiUrl}/v1/shipments/${trackingNumber}/status`,
        {
          headers: this.buildHeaders(),
          timeout: 15_000,
        },
      ),
    );

    if (!response.data.success) {
      throw new Error(`PTT Kargo durum sorgusu başarısız: ${response.data.error ?? 'Bilinmeyen hata'}`);
    }

    const status = PTT_STATUS_MAP[response.data.status] ?? ShipmentStatus.IN_TRANSIT;

    return {
      status,
      description: response.data.statusDescription,
      estimatedDelivery: response.data.estimatedDeliveryDate
        ? new Date(response.data.estimatedDeliveryDate)
        : undefined,
    };
  }

  /**
   * Kargo etiketini base64 PDF olarak döner.
   */
  async getLabel(trackingNumber: string): Promise<string> {
    const apiUrl = process.env['PTT_API_URL'];

    if (!apiUrl) {
      this.logger.warn(`PTT_API_URL tanımlı değil — stub etiket döndürülüyor (tracking=${trackingNumber})`);
      return 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL1hPYmplY3QvU3VidHlwZS9JbWFnZT4+CmVuZG9iago=';
    }

    const response = await firstValueFrom(
      this.httpService.get<{ labelBase64: string }>(
        `${apiUrl}/v1/shipments/${trackingNumber}/label`,
        {
          headers: this.buildHeaders(),
          timeout: 20_000,
        },
      ),
    );

    return response.data.labelBase64;
  }

  /** PTT API Key header'larını oluşturur */
  private buildHeaders(): Record<string, string> {
    return {
      'X-API-Key': process.env['PTT_API_KEY'] ?? '',
      'Content-Type': 'application/json',
    };
  }
}

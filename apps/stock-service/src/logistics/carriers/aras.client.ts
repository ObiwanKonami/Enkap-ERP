import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ShipmentStatus } from '../entities/shipment.entity';
import type { CreateShipmentDto } from '../dto/create-shipment.dto';

/** Aras Kargo API yanıtı — gönderi oluşturma */
interface ArasCreateResponse {
  result: boolean;
  intlKey: string;       // Aras iç gönderi ID'si
  barcodeNumber: string; // Kargo takip numarası
  errorMessage?: string;
}

/** Aras Kargo API yanıtı — durum sorgulama */
interface ArasTrackResponse {
  result: boolean;
  status: string;        // Aras kendi durum kodu ('IN_TRANSIT', 'DELIVERED' vb.)
  description: string;
  estimatedDelivery?: string; // ISO tarih
}

/** Aras kargo durum kodu → Enkap ShipmentStatus dönüşüm tablosu */
const ARAS_STATUS_MAP: Record<string, ShipmentStatus> = {
  CREATED: ShipmentStatus.CREATED,
  IN_TRANSIT: ShipmentStatus.IN_TRANSIT,
  OUT_FOR_DELIVERY: ShipmentStatus.OUT_FOR_DELIVERY,
  DELIVERED: ShipmentStatus.DELIVERED,
  DELIVERY_FAILED: ShipmentStatus.FAILED,
  RETURNED: ShipmentStatus.RETURNED,
};

/**
 * Aras Kargo API istemcisi.
 *
 * Kimlik doğrulama: Basic Auth (username:password)
 * Base URL: ARAS_API_URL env değişkeni
 *
 * Env yoksa stub modda çalışır — gerçek API çağrısı yapılmaz.
 * Belge: https://www.araskargo.com.tr/kurumsal/entegrasyon
 */
@Injectable()
export class ArasCargoClient {
  private readonly logger = new Logger(ArasCargoClient.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Yeni gönderi oluşturur.
   * Aras Kargo REST/SOAP API'sine bağlanır.
   * Env yoksa stub mod: gerçek istek gönderilmez.
   */
  async createShipment(
    dto: CreateShipmentDto,
    tenantId: string,
  ): Promise<{ trackingNumber: string; carrierId: string }> {
    const apiUrl = process.env['ARAS_API_URL'];

    // Stub mod: env tanımlı değilse geliştirme/test ortamı için sahte yanıt
    if (!apiUrl) {
      this.logger.warn(
        `ARAS_API_URL tanımlı değil — stub mod aktif (tenantId=${tenantId}, ref=${dto.orderReference})`,
      );
      return {
        trackingNumber: `ARAS-STUB-${Date.now()}`,
        carrierId: 'stub-001',
      };
    }

    const authHeader = this.buildAuthHeader();

    const payload = {
      IntlKey: `${tenantId}-${dto.orderReference}-${Date.now()}`,
      SenderName: dto.senderName,
      SenderAddress: dto.senderAddress,
      SenderCity: dto.senderCity,
      SenderPhone: dto.senderPhone,
      ReceiverName: dto.recipientName,
      ReceiverAddress: dto.recipientAddress,
      ReceiverCity: dto.recipientCity,
      ReceiverDistrict: dto.recipientDistrict ?? '',
      ReceiverPhone: dto.recipientPhone,
      WeightKg: dto.weightKg,
      Desi: dto.desi ?? 0,
      PaymentType: dto.paymentType === 'recipient' ? 'R' : 'S',
      CustomerCode: process.env['ARAS_CUSTOMER_CODE'] ?? '',
    };

    const response = await firstValueFrom(
      this.httpService.post<ArasCreateResponse>(`${apiUrl}/shipments`, payload, {
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        timeout: 30_000,
      }),
    );

    if (!response.data.result) {
      throw new Error(
        `Aras Kargo gönderi oluşturma başarısız: ${response.data.errorMessage ?? 'Bilinmeyen hata'}`,
      );
    }

    this.logger.log(
      `Aras Kargo gönderisi oluşturuldu: ${response.data.barcodeNumber} (tenantId=${tenantId})`,
    );

    return {
      trackingNumber: response.data.barcodeNumber,
      carrierId: response.data.intlKey,
    };
  }

  /**
   * Verilen takip numarasının güncel durumunu sorgular.
   * Durum kodu Enkap ShipmentStatus enum'una dönüştürülür.
   */
  async trackShipment(
    trackingNumber: string,
  ): Promise<{ status: ShipmentStatus; description: string; estimatedDelivery?: Date }> {
    const apiUrl = process.env['ARAS_API_URL'];

    if (!apiUrl) {
      this.logger.warn(`ARAS_API_URL tanımlı değil — stub mod aktif (tracking=${trackingNumber})`);
      return {
        status: ShipmentStatus.IN_TRANSIT,
        description: 'Stub: Kargoda',
      };
    }

    const response = await firstValueFrom(
      this.httpService.get<ArasTrackResponse>(`${apiUrl}/shipments/${trackingNumber}/status`, {
        headers: { Authorization: this.buildAuthHeader() },
        timeout: 15_000,
      }),
    );

    const status = ARAS_STATUS_MAP[response.data.status] ?? ShipmentStatus.IN_TRANSIT;

    return {
      status,
      description: response.data.description,
      estimatedDelivery: response.data.estimatedDelivery
        ? new Date(response.data.estimatedDelivery)
        : undefined,
    };
  }

  /**
   * Kargo etiketini base64 PDF olarak döner.
   * Frontend PDF olarak render eder veya yazıcıya gönderir.
   */
  async getLabel(trackingNumber: string): Promise<string> {
    const apiUrl = process.env['ARAS_API_URL'];

    if (!apiUrl) {
      this.logger.warn(`ARAS_API_URL tanımlı değil — stub etiket döndürülüyor (tracking=${trackingNumber})`);
      // Stub: 1x1 piksel beyaz PDF base64
      return 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL1hPYmplY3QvU3VidHlwZS9JbWFnZT4+CmVuZG9iago=';
    }

    const response = await firstValueFrom(
      this.httpService.get<{ label: string }>(`${apiUrl}/shipments/${trackingNumber}/label`, {
        headers: { Authorization: this.buildAuthHeader() },
        timeout: 20_000,
      }),
    );

    return response.data.label;
  }

  /** Basic Auth header'ı oluşturur */
  private buildAuthHeader(): string {
    const username = process.env['ARAS_USERNAME'] ?? '';
    const password = process.env['ARAS_PASSWORD'] ?? '';
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${token}`;
  }
}

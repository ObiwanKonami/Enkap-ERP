import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ShipmentStatus } from '../entities/shipment.entity';
import type { CreateShipmentDto } from '../dto/create-shipment.dto';

/** Yurtiçi Kargo API yanıtı — gönderi oluşturma */
interface YurticiCreateResponse {
  outFlag: number;       // 0: başarılı, 1: hata
  cargoKey: string;      // Yurtiçi iç gönderi anahtarı
  cargoTrackingNumber: string;
  errorMessage?: string;
}

/** Yurtiçi Kargo API yanıtı — durum sorgulama */
interface YurticiTrackResponse {
  outFlag: number;
  statusCode: string;    // Yurtiçi kendi durum kodu
  description: string;
  lastTransactionDate?: string;
}

/** Yurtiçi kargo durum kodu → Enkap ShipmentStatus dönüşüm tablosu */
const YURTICI_STATUS_MAP: Record<string, ShipmentStatus> = {
  '1': ShipmentStatus.CREATED,
  '2': ShipmentStatus.IN_TRANSIT,
  '3': ShipmentStatus.OUT_FOR_DELIVERY,
  '4': ShipmentStatus.DELIVERED,
  '5': ShipmentStatus.FAILED,
  '6': ShipmentStatus.RETURNED,
};

/**
 * Yurtiçi Kargo API istemcisi.
 *
 * Kimlik doğrulama: Form-based login → session token
 * Base URL: YURTICI_API_URL env değişkeni
 *
 * Env yoksa stub modda çalışır — gerçek API çağrısı yapılmaz.
 * Belge: https://yurticikargo.com/tr/online-islemler/entegrasyon-servisleri
 */
@Injectable()
export class YurticiCargoClient {
  private readonly logger = new Logger(YurticiCargoClient.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Yeni gönderi oluşturur.
   * Yurtiçi Kargo REST API'sine bağlanır.
   * Env yoksa stub mod: gerçek istek gönderilmez.
   */
  async createShipment(
    dto: CreateShipmentDto,
    tenantId: string,
  ): Promise<{ trackingNumber: string; carrierId: string }> {
    const apiUrl = process.env['YURTICI_API_URL'];

    if (!apiUrl) {
      this.logger.warn(
        `YURTICI_API_URL tanımlı değil — stub mod aktif (tenantId=${tenantId}, ref=${dto.orderReference})`,
      );
      return {
        trackingNumber: `YURTICI-STUB-${Date.now()}`,
        carrierId: 'stub-001',
      };
    }

    const authHeader = await this.getAuthHeader();

    const payload = {
      userName: process.env['YURTICI_USER_NAME'] ?? '',
      password: process.env['YURTICI_PASSWORD'] ?? '',
      shipmentInfo: {
        senderName: dto.senderName,
        senderAddress: dto.senderAddress,
        senderCity: dto.senderCity,
        senderPhone: dto.senderPhone,
        receiverName: dto.recipientName,
        receiverAddress: dto.recipientAddress,
        receiverCity: dto.recipientCity,
        receiverDistrict: dto.recipientDistrict ?? '',
        receiverPhone: dto.recipientPhone,
        kg: dto.weightKg,
        desi: dto.desi ?? 0,
        isCOD: dto.paymentType === 'recipient' ? 1 : 0,
        merchantInvoiceNumber: `${tenantId.slice(0, 8)}-${dto.orderReference}`,
      },
    };

    const response = await firstValueFrom(
      this.httpService.post<YurticiCreateResponse>(`${apiUrl}/CreateShipment`, payload, {
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        timeout: 30_000,
      }),
    );

    if (response.data.outFlag !== 0) {
      throw new Error(
        `Yurtiçi Kargo gönderi oluşturma başarısız: ${response.data.errorMessage ?? 'Bilinmeyen hata'}`,
      );
    }

    this.logger.log(
      `Yurtiçi Kargo gönderisi oluşturuldu: ${response.data.cargoTrackingNumber} (tenantId=${tenantId})`,
    );

    return {
      trackingNumber: response.data.cargoTrackingNumber,
      carrierId: response.data.cargoKey,
    };
  }

  /**
   * Verilen takip numarasının güncel durumunu sorgular.
   */
  async trackShipment(
    trackingNumber: string,
  ): Promise<{ status: ShipmentStatus; description: string; estimatedDelivery?: Date }> {
    const apiUrl = process.env['YURTICI_API_URL'];

    if (!apiUrl) {
      this.logger.warn(`YURTICI_API_URL tanımlı değil — stub mod aktif (tracking=${trackingNumber})`);
      return {
        status: ShipmentStatus.IN_TRANSIT,
        description: 'Stub: Kargoda',
      };
    }

    const authHeader = await this.getAuthHeader();

    const response = await firstValueFrom(
      this.httpService.post<YurticiTrackResponse>(
        `${apiUrl}/QueryShipment`,
        {
          userName: process.env['YURTICI_USER_NAME'] ?? '',
          password: process.env['YURTICI_PASSWORD'] ?? '',
          cargoTrackingNumber: trackingNumber,
        },
        {
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          timeout: 15_000,
        },
      ),
    );

    const status = YURTICI_STATUS_MAP[response.data.statusCode] ?? ShipmentStatus.IN_TRANSIT;

    return {
      status,
      description: response.data.description,
      // Yurtiçi tahmini teslim tarihi döndürmez — lastTransactionDate yeterli
      estimatedDelivery: response.data.lastTransactionDate
        ? new Date(response.data.lastTransactionDate)
        : undefined,
    };
  }

  /**
   * Kargo etiketini base64 PDF olarak döner.
   */
  async getLabel(trackingNumber: string): Promise<string> {
    const apiUrl = process.env['YURTICI_API_URL'];

    if (!apiUrl) {
      this.logger.warn(`YURTICI_API_URL tanımlı değil — stub etiket döndürülüyor (tracking=${trackingNumber})`);
      return 'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL1hPYmplY3QvU3VidHlwZS9JbWFnZT4+CmVuZG9iago=';
    }

    const authHeader = await this.getAuthHeader();

    const response = await firstValueFrom(
      this.httpService.post<{ labelContent: string }>(
        `${apiUrl}/GetShipmentLabel`,
        {
          userName: process.env['YURTICI_USER_NAME'] ?? '',
          password: process.env['YURTICI_PASSWORD'] ?? '',
          cargoTrackingNumber: trackingNumber,
        },
        {
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          timeout: 20_000,
        },
      ),
    );

    return response.data.labelContent;
  }

  /**
   * Yurtiçi Basic Auth header'ı oluşturur.
   * Yurtiçi bazı endpoint'lerde body'deki user/pass ikilisini kullanır,
   * bazılarında Authorization header'ı kabul eder.
   */
  private async getAuthHeader(): Promise<string> {
    const username = process.env['YURTICI_USER_NAME'] ?? '';
    const password = process.env['YURTICI_PASSWORD'] ?? '';
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    return `Basic ${token}`;
  }
}

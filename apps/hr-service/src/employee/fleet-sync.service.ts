import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface HrDriverSyncDto {
  tenantId:       string;
  employeeId:     string;
  firstName:      string;
  lastName:       string;
  phone?:         string;
  licenseClass:   string;
  licenseNumber?: string;
  licenseExpires?: string;
}

/**
 * HR ↔ Fleet senkronizasyon servisi
 *
 * Sürücü ehliyeti olan çalışanların fleet-service'teki driver kaydını
 * otomatik oluşturur, günceller ve pasife alır.
 * Tüm çağrılar fire-and-forget — fleet-service'in geçici kapalı olması
 * HR akışını durdurmaz.
 */
@Injectable()
export class FleetSyncService {
  private readonly logger = new Logger(FleetSyncService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl() {
    return this.config.get('FLEET_SERVICE_URL', 'http://localhost:3017');
  }

  private get apiKey() {
    return this.config.get('FLEET_API_KEY', '');
  }

  private headers() {
    return { 'x-api-key': this.apiKey };
  }

  /** Çalışan oluşturuldu → driver upsert */
  syncCreate(dto: HrDriverSyncDto): void {
    firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/api/v1/hr-sync/drivers`,
        dto,
        { headers: this.headers() },
      ),
    ).catch((err: unknown) =>
      this.logger.warn(
        `[${dto.tenantId}] Fleet sürücü oluşturma hatası (${dto.employeeId}): ${(err as Error).message}`,
      ),
    );
  }

  /** Çalışan güncellendi → driver upsert (mevcut kaydı günceller veya oluşturur) */
  syncUpdate(dto: HrDriverSyncDto): void {
    firstValueFrom(
      this.httpService.patch(
        `${this.baseUrl}/api/v1/hr-sync/drivers`,
        dto,
        { headers: this.headers() },
      ),
    ).catch((err: unknown) =>
      this.logger.warn(
        `[${dto.tenantId}] Fleet sürücü güncelleme hatası (${dto.employeeId}): ${(err as Error).message}`,
      ),
    );
  }

  /** Çalışan işten çıkarıldı → driver PASIF */
  syncTerminate(tenantId: string, employeeId: string): void {
    firstValueFrom(
      this.httpService.patch(
        `${this.baseUrl}/api/v1/hr-sync/drivers/terminate`,
        { tenantId, employeeId },
        { headers: this.headers() },
      ),
    ).catch((err: unknown) =>
      this.logger.warn(
        `[${tenantId}] Fleet sürücü pasife alma hatası (${employeeId}): ${(err as Error).message}`,
      ),
    );
  }
}

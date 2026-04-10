import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Platform genelinde geçerli ayarları control plane DB'den okur/yazar.
 * Tenant izolasyonu yoktur — platform admin tarafından yönetilir.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly cp: DataSource,
  ) {}

  /**
   * Belirtilen anahtara ait ayarı döndürür.
   * Bulunamazsa veya hata olursa fallback değeri döner.
   */
  async get<T>(key: string, fallback: T): Promise<T> {
    const rows = await this.cp
      .query<Array<{ value: unknown }>>(
        `SELECT value FROM platform_settings WHERE key = $1`,
        [key],
      )
      .catch((err: Error) => {
        this.logger.warn(`platform_settings okuma hatası (key=${key}): ${err.message}`);
        return [];
      });

    return rows[0] ? (rows[0].value as T) : fallback;
  }

  /**
   * Belirtilen anahtara ait ayarı günceller veya ekler.
   * JSONB olarak saklanır.
   */
  async set(key: string, value: unknown): Promise<void> {
    await this.cp.query(
      `INSERT INTO platform_settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    );

    this.logger.log(`Platform ayarı güncellendi: ${key}`);
  }
}

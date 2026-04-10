import { Injectable } from '@nestjs/common';
import { TenantDataSourceManager } from '@enkap/database';

export interface DeviceTokenRow {
  id: string;
  userId: string;
  deviceId: string;
  fcmToken: string;
  platform: 'ios' | 'android';
  appVersion: string | null;
  lastSeenAt: Date;
}

/**
 * Cihaz Token Veri Erişim Katmanı.
 *
 * device_tokens tablosu tenant şemasındadır — her sorgu için
 * TenantDataSourceManager üzerinden doğru DataSource alınır.
 */
@Injectable()
export class DeviceTokenRepository {
  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /** Kullanıcının aktif cihaz tokenlarını döndürür. */
  async getTokensByUser(
    tenantId: string,
    userId: string,
  ): Promise<DeviceTokenRow[]> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const rows = await ds.query<DeviceTokenRow[]>(
      `SELECT id, user_id AS "userId", device_id AS "deviceId",
              fcm_token AS "fcmToken", platform,
              app_version AS "appVersion", last_seen_at AS "lastSeenAt"
       FROM device_tokens
       WHERE tenant_id = $1 AND user_id = $2 AND is_active = true`,
      [tenantId, userId],
    );
    return rows;
  }

  /** Tenant'ın tüm aktif cihaz tokenlarını döndürür (broadcast için). */
  async getTokensByTenant(tenantId: string): Promise<DeviceTokenRow[]> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const rows = await ds.query<DeviceTokenRow[]>(
      `SELECT id, user_id AS "userId", device_id AS "deviceId",
              fcm_token AS "fcmToken", platform,
              app_version AS "appVersion", last_seen_at AS "lastSeenAt"
       FROM device_tokens
       WHERE tenant_id = $1 AND is_active = true`,
      [tenantId],
    );
    return rows;
  }

  /**
   * Token kaydet veya güncelle (UPSERT).
   * Aynı (tenant_id, user_id, device_id) → fcm_token + last_seen_at güncellenir.
   */
  async upsert(params: {
    tenantId: string;
    userId: string;
    deviceId: string;
    fcmToken: string;
    platform: 'ios' | 'android';
    appVersion?: string;
  }): Promise<void> {
    const ds = await this.dsManager.getDataSource(params.tenantId);
    await ds.query(
      `INSERT INTO device_tokens
         (tenant_id, user_id, device_id, fcm_token, platform, app_version, last_seen_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), true)
       ON CONFLICT (tenant_id, user_id, device_id)
       DO UPDATE SET
         fcm_token    = EXCLUDED.fcm_token,
         app_version  = EXCLUDED.app_version,
         last_seen_at = NOW(),
         is_active    = true`,
      [
        params.tenantId,
        params.userId,
        params.deviceId,
        params.fcmToken,
        params.platform,
        params.appVersion ?? null,
      ],
    );
  }

  /** FCM geçersiz token dönüşünde tokenları pasif yap. */
  async deactivateByFcmTokens(fcmTokens: string[]): Promise<void> {
    if (fcmTokens.length === 0) return;

    // Hangi tenant'a ait olduğunu bilmiyoruz — tüm şemalarda arama yapamayız.
    // Bu tokenlerin hangi tenant şemasında olduğunu bulmak için önce kontrol uçağına bak.
    // TODO: Daha verimli çözüm — fcm_token'ı control_plane'de de tut (denormalize).
    // Şimdilik: her tokeni tek tek arayamayız, sadece aynı DS içinde çalışabiliriz.
    // Bu metot sendToTokens() tarafından çağrılır — DS bilgisi orada mevcut.
    // Geçici çözüm: token'ı FCM'den döndüğünde tenant bilgisi de olacak (Faz 3 refactor).
    //
    // Şu an için: sadece logla, bir sonraki cron cleanup yapacak.
    // Cron: device_tokens WHERE last_seen_at < NOW() - '90 days' → deactivate
    void fcmTokens; // kullanılmıyor (lint sessizlet)
  }

  /** Cihaz çıkışında tokenı pasif yap. */
  async deactivateByDevice(params: {
    tenantId: string;
    userId: string;
    deviceId: string;
  }): Promise<void> {
    const ds = await this.dsManager.getDataSource(params.tenantId);
    await ds.query(
      `UPDATE device_tokens
       SET is_active = false
       WHERE tenant_id = $1 AND user_id = $2 AND device_id = $3`,
      [params.tenantId, params.userId, params.deviceId],
    );
  }
}

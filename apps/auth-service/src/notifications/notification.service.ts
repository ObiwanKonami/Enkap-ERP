import { Injectable, Logger } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { DeviceTokenRepository } from './device-token.repository';
import type { PushNotificationPayload } from './notification-templates';

/**
 * Bildirim Orkestratör Servisi.
 *
 * Kullanım (diğer servisler internal endpoint üzerinden çağırır):
 *   POST /internal/notifications/send
 *   { tenantId, userId?, payload }
 *
 * userId verilirse → o kullanıcının tüm cihazlarına gönderir.
 * userId verilmezse → tenant'ın tüm aktif kullanıcılarına gönderir (broadcast).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly fcm: FcmService,
    private readonly tokenRepo: DeviceTokenRepository,
  ) {}

  /**
   * Belirli bir kullanıcının tüm cihazlarına bildirim gönderir.
   */
  async sendToUser(
    tenantId: string,
    userId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    const tokens = await this.tokenRepo.getTokensByUser(tenantId, userId);

    if (tokens.length === 0) {
      this.logger.debug(`Kayıtlı cihaz yok: userId=${userId}`);
      return;
    }

    const { invalidTokens } = await this.fcm.sendToTokens(
      tokens.map((t) => t.fcmToken),
      payload,
    );

    // Geçersiz tokenleri temizle
    if (invalidTokens.length > 0) {
      await this.tokenRepo.deactivateByFcmTokens(invalidTokens);
      this.logger.debug(`${invalidTokens.length} geçersiz token devre dışı bırakıldı`);
    }

    this.logger.log(
      `Bildirim gönderildi: userId=${userId}, cihaz=${tokens.length}`,
    );
  }

  /**
   * Tenant'ın tüm aktif kullanıcılarına broadcast bildirim gönderir.
   * Toplu admin uyarıları için kullanılır (ör: sistem bakımı, kritik stok).
   */
  async sendToTenant(
    tenantId: string,
    payload: PushNotificationPayload,
  ): Promise<void> {
    const tokens = await this.tokenRepo.getTokensByTenant(tenantId);

    if (tokens.length === 0) {
      this.logger.debug(`Kayıtlı cihaz yok: tenantId=${tenantId}`);
      return;
    }

    const { invalidTokens } = await this.fcm.sendToTokens(
      tokens.map((t) => t.fcmToken),
      payload,
    );

    if (invalidTokens.length > 0) {
      await this.tokenRepo.deactivateByFcmTokens(invalidTokens);
    }

    this.logger.log(
      `Tenant broadcast: tenantId=${tenantId}, cihaz=${tokens.length}`,
    );
  }

  /**
   * Cihaz tokenını kaydet veya güncelle.
   * Aynı device_id varsa → token güncellenir (upsert).
   */
  async registerToken(params: {
    tenantId: string;
    userId: string;
    deviceId: string;
    fcmToken: string;
    platform: 'ios' | 'android';
    appVersion?: string;
  }): Promise<void> {
    await this.tokenRepo.upsert(params);
    this.logger.debug(
      `Token kaydedildi: userId=${params.userId}, platform=${params.platform}`,
    );
  }

  /**
   * Çıkış yapıldığında cihaz tokenını pasif yap.
   */
  async unregisterToken(params: {
    tenantId: string;
    userId: string;
    deviceId: string;
  }): Promise<void> {
    await this.tokenRepo.deactivateByDevice(params);
    this.logger.debug(`Token devre dışı: deviceId=${params.deviceId}`);
  }
}

import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import type { PushNotificationPayload } from './notification-templates';

// ─── DTO'lar ──────────────────────────────────────────────────────────────────

class RegisterTokenDto {
  /** Tenant UUID'si */
  tenantId!: string;
  /** Kullanıcı UUID'si */
  userId!: string;
  /** Cihaz benzersiz kimliği */
  deviceId!: string;
  /** Firebase Cloud Messaging token */
  fcmToken!: string;
  /** Mobil platform */
  platform!: 'ios' | 'android';
  /** Uygulama versiyonu (opsiyonel) */
  appVersion?: string;
}

class UnregisterTokenDto {
  /** Tenant UUID'si */
  tenantId!: string;
  /** Kullanıcı UUID'si */
  userId!: string;
  /** Cihaz benzersiz kimliği */
  deviceId!: string;
}

class SendNotificationDto {
  /** Tenant UUID'si */
  tenantId!: string;
  /** Belirli kullanıcı UUID'si — verilmezse tenant'a broadcast */
  userId?: string;
  /** Bildirim içeriği */
  payload!: PushNotificationPayload;
}

/**
 * Bildirim API Denetleyicisi.
 *
 * /notifications/* — Mobil istemcinin token kayıt/çıkış endpoint'leri
 *   (TenantGuard korumalı — kullanıcı JWT'si gerekli)
 *
 * /internal/notifications/* — Diğer servislerin bildirim tetikleme endpoint'i
 *   (Kubernetes NetworkPolicy + mTLS ile korunur — harici erişim yok)
 */
@ApiTags('fcm')
@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * POST /notifications/register-token
   * Mobil uygulama açıldığında/FCM token yenilendiğinde çağrılır.
   */
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'FCM token kaydet', description: 'Mobil uygulama açıldığında veya FCM token yenilendiğinde cihaz token\'ını kaydeder.' })
  @ApiBody({ type: RegisterTokenDto })
  @ApiResponse({ status: 204, description: 'Token başarıyla kaydedildi.' })
  @ApiResponse({ status: 400, description: 'Zorunlu alanlar eksik veya platform geçersiz.' })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @Post('notifications/register-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async registerToken(@Body() dto: RegisterTokenDto): Promise<void> {
    if (!dto.tenantId || !dto.userId || !dto.deviceId || !dto.fcmToken) {
      throw new BadRequestException(
        'tenantId, userId, deviceId ve fcmToken zorunludur.',
      );
    }

    if (!['ios', 'android'].includes(dto.platform)) {
      throw new BadRequestException('platform "ios" veya "android" olmalıdır.');
    }

    await this.notificationService.registerToken(dto);
  }

  /**
   * DELETE /notifications/register-token
   * Kullanıcı çıkış yaptığında çağrılır — token devre dışı bırakılır.
   */
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'FCM token sil', description: 'Kullanıcı çıkış yaptığında cihaz token\'ını devre dışı bırakır.' })
  @ApiBody({ type: UnregisterTokenDto })
  @ApiResponse({ status: 204, description: 'Token başarıyla silindi.' })
  @ApiResponse({ status: 400, description: 'Zorunlu alanlar eksik.' })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @Delete('notifications/register-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregisterToken(@Body() dto: UnregisterTokenDto): Promise<void> {
    if (!dto.tenantId || !dto.userId || !dto.deviceId) {
      throw new BadRequestException(
        'tenantId, userId ve deviceId zorunludur.',
      );
    }

    await this.notificationService.unregisterToken(dto);
  }

  /**
   * POST /internal/notifications/send
   * Diğer mikroservisler (stock-service, financial-service vb.) bu endpoint'i çağırır.
   *
   * Örnek (stock-service'den kritik stok uyarısı):
   *   await fetch('http://auth-service:3001/internal/notifications/send', {
   *     method: 'POST',
   *     body: JSON.stringify({
   *       tenantId: ctx.tenantId,
   *       payload: kritikStokUyarisi({ urunAdi: 'A4 Kağıt', mevcutMiktar: 5, birim: 'paket' }),
   *     }),
   *   });
   */
  @ApiOperation({ summary: '[Internal] Bildirim gönder', description: 'Diğer mikroservisler tarafından kullanılan dahili endpoint. Kubernetes NetworkPolicy + mTLS ile korunur — harici erişim yoktur.' })
  @ApiBody({ type: SendNotificationDto })
  @ApiResponse({ status: 202, description: 'Bildirim kuyruğa alındı (fire-and-forget).' })
  @ApiResponse({ status: 400, description: 'Zorunlu alanlar eksik.' })
  @Post('internal/notifications/send')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendNotification(
    @Body() dto: SendNotificationDto,
  ): Promise<{ status: string }> {
    if (!dto.tenantId || !dto.payload) {
      throw new BadRequestException('tenantId ve payload zorunludur.');
    }

    if (dto.userId) {
      // Fire-and-forget — yanıtı bekletme (bildirim gönderimi yavaş olabilir)
      void this.notificationService.sendToUser(
        dto.tenantId,
        dto.userId,
        dto.payload,
      );
    } else {
      void this.notificationService.sendToTenant(dto.tenantId, dto.payload);
    }

    return { status: 'accepted' };
  }
}

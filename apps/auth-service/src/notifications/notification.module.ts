import { Module } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { NotificationService } from './notification.service';
import { DeviceTokenRepository } from './device-token.repository';
import { NotificationController } from './notification.controller';

/**
 * Bildirim Modülü.
 *
 * Bağımlılıklar:
 * - TenantModule (@Global) — TenantDataSourceManager inject için
 * - firebase-admin — FcmService'in OnModuleInit'inde başlatılır
 *
 * Export: NotificationService — AuthModule bu servisi inject edebilir
 * (ör: başarılı giriş sonrası arka plan sync tetiklemek için).
 */
@Module({
  controllers: [NotificationController],
  providers: [
    FcmService,
    NotificationService,
    DeviceTokenRepository,
  ],
  exports: [NotificationService],
})
export class NotificationModule {}

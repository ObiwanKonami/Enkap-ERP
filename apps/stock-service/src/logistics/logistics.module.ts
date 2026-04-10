import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MailerModule } from '@enkap/mailer';
import { TenantModule } from '@enkap/database';
import { ShipmentService } from './shipment.service';
import { ShipmentController } from './shipment.controller';
import { ArasCargoClient } from './carriers/aras.client';
import { YurticiCargoClient } from './carriers/yurtici.client';
import { PttCargoClient } from './carriers/ptt.client';

/**
 * Lojistik / Kargo Modülü.
 *
 * Aras, Yurtiçi ve PTT kargo firmalarıyla entegrasyon sağlar.
 * Gönderi oluşturma, takip, etiket alma ve webhook işlemlerini yönetir.
 *
 * Cron job (@Cron) için ScheduleModule.forRoot() AppModule'de tanımlı —
 * burada tekrar import edilmez.
 */
@Module({
  imports: [
    // Kargo API çağrıları için HTTP istemcisi
    HttpModule.register({ timeout: 30_000, maxRedirects: 3 }),
    // Teslim ve gönderim e-posta bildirimleri
    MailerModule,
    // TenantDataSourceManager ve TenantRoutingService erişimi
    TenantModule,
  ],
  providers: [
    ShipmentService,
    ArasCargoClient,
    YurticiCargoClient,
    PttCargoClient,
  ],
  controllers: [ShipmentController],
  exports: [ShipmentService],
})
export class LogisticsModule {}

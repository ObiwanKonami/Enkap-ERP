import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantModule } from '@enkap/database';
import { ReportingModule } from '@enkap/reporting';
import { MailerModule } from '@enkap/mailer';

import { ReportDefinition } from './entities/report-definition.entity';
import { Dashboard } from './entities/dashboard.entity';
import { Widget } from './entities/widget.entity';
import { BIService } from './bi.service';
import { BIController } from './bi.controller';

/**
 * BI (Business Intelligence) / Özel Raporlama Modülü — Sprint 6B.
 *
 * Bağımlılıklar:
 *  - TypeOrmModule: control_plane DataSource üzerinde 3 entity
 *  - TenantModule: TenantDataSourceManager → tenant şemasına izole SQL çalıştırma
 *  - ReportingModule: ExcelBuilderService → zamanlanmış rapor Excel çıktısı
 *  - MailerModule: MailerService → zamanlanmış rapor e-posta gönderimi
 *
 * Tablolar CP010 control plane migration'ı tarafından oluşturulur.
 * BISchemaInitializer kaldırıldı — uygulama kodu DDL çalıştırmaz.
 */
@Module({
  imports: [
    // control_plane DataSource üzerinde 3 BI entity kaydı
    TypeOrmModule.forFeature(
      [ReportDefinition, Dashboard, Widget],
      'control_plane',
    ),

    // Tenant izolasyonlu DataSource yönetimi — rapor çalıştırma için gerekli
    TenantModule,

    // PDF ve Excel üretimi — zamanlanmış raporlar için
    ReportingModule,

    // E-posta gönderimi — zamanlanmış rapor teslimatı için
    MailerModule,
  ],
  controllers: [BIController],
  providers:   [BIService],
  exports:     [BIService],
})
export class BIModule {}

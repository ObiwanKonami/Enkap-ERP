import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantModule, TenantRoutingService } from '@enkap/database';
import { GibController } from './gib.controller';
import { UblBuilderService } from './ubl-builder.service';
import { GibSubmissionService } from './gib-submission.service';
import { MtomSoapService } from './mtom-soap.service';
import { GibEnvelopeService } from './gib-envelope.service';
import { GibPollingService } from './gib-polling.service';
import { GibAuditService } from './gib-audit.service';
import { ApplicationResponseService } from './application-response.service';
import { ArchiveReportingService } from './archive-reporting.service';
import { ArchiveReportBuilderService } from './archive-report-builder.service';
import { GibInboxService } from './gib-inbox.service';
import { GibInboxProcessorService } from './gib-inbox-processor.service';
import { PoMatchService } from '../invoice/po-match.service';
import { GibEnvelope } from './entities/gib-envelope.entity';
import { ApplicationResponse } from './entities/application-response.entity';

/**
 * GİB EF-VAP Modülü
 *
 * Kapsam:
 *  - EF-VAP MTOM SOAP iletişimi (MtomSoapService)
 *  - Zarf yaşam döngüsü yönetimi (GibEnvelopeService)
 *  - Fatura gönderme iş akışı (GibSubmissionService)
 *  - GİB durum polling'i (GibPollingService)
 *  - Kabul/Red (ApplicationResponse) servisi (ApplicationResponseService)
 *  - ÖEBSD SIS.5 uyumlu denetim izi (GibAuditService → control_plane DB)
 *  - UBL-TR 2.1 XML üreticisi — sektörel uzantılar dahil (UblBuilderService)
 *  - e-Arşiv günlük raporlama (ArchiveReportingService → 23:59 cron)
 *  - eArsivRaporu UBL XML builder (ArchiveReportBuilderService)
 *  - GİB SOAP Listener — gelen zarf alımı (GibInboxService, PUSH mimarisi)
 *  - Gelen zarf işlemcisi (GibInboxProcessorService — 5 dk cron)
 */
@Module({
  imports: [
    TenantModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([GibEnvelope, ApplicationResponse]),
  ],
  controllers: [GibController],
  providers: [
    UblBuilderService,
    MtomSoapService,
    GibEnvelopeService,
    GibSubmissionService,
    GibPollingService,
    GibAuditService,
    ApplicationResponseService,
    ArchiveReportBuilderService,
    ArchiveReportingService,
    GibInboxService,
    GibInboxProcessorService,
    PoMatchService,
    TenantRoutingService,
  ],
  exports: [
    UblBuilderService,
    GibSubmissionService,
    GibEnvelopeService,
    GibPollingService,
    GibAuditService,
    ArchiveReportingService,
  ],
})
export class GibModule {}

import { Module } from '@nestjs/common';
import { UaeVatEngine } from './vat/uae-vat.engine';
import { TrnValidator } from './vat/trn-validator';
import { PeppolBuilderService } from './einvoice/peppol-builder.service';
import { FtaSubmissionService } from './einvoice/fta-submission.service';
import { UaeController } from './uae.controller';

/**
 * UAE FTA VAT Uyum Modülü (Sprint 7B).
 *
 * İçerir:
 *  - UaeVatEngine: %5 standart, %0 sıfır, muaf oran hesaplama
 *  - TrnValidator: UAE FTA TRN (15 hane) doğrulama ve formatlama
 *  - PeppolBuilderService: Peppol BIS 3.0 UBL 2.1 XML üretimi
 *  - FtaSubmissionService: FTA portal OAuth2 entegrasyonu (stub mod destekli)
 *
 * Para birimi: AED (Dirhem) — en küçük birim fils (1 AED = 100 fils)
 * VAT standardı: UAE Federal Decree-Law No. 8 of 2017
 */
@Module({
  providers: [
    UaeVatEngine,
    TrnValidator,
    PeppolBuilderService,
    FtaSubmissionService,
  ],
  controllers: [UaeController],
  exports: [UaeVatEngine, PeppolBuilderService],
})
export class UaeModule {}

import { Module } from '@nestjs/common';
import { ZatcaBuilderService } from './zatca/zatca-builder.service';
import { ZatcaSubmissionService } from './zatca/zatca-submission.service';
import { CsidService } from './zatca/csid.service';
import { ZakatCalculator } from './zakat/zakat.calculator';
import { KsaController } from './ksa.controller';

/**
 * KSA ZATCA Uyum Modülü (Sprint 7C).
 *
 * İçerir:
 *  - ZatcaBuilderService: ZATCA Phase 2 UBL 2.1 XML üretimi + QR (TLV Base64)
 *  - ZatcaSubmissionService: ZATCA API reporting/clearance (stub mod destekli)
 *  - CsidService: CSID onboarding — CSR üretimi + stub compliance/production akışı
 *  - ZakatCalculator: %2.5 İslami servet vergisi hesaplama
 *
 * Para birimi: SAR (Suudi Riyal) — en küçük birim halalah (1 SAR = 100 halalah)
 * VAT standardı: KSA VAT Law — %15 standart oran (2020'den itibaren)
 * ZATCA: Zakat, Tax and Customs Authority — Suudi Arabistan vergi idaresi
 */
@Module({
  providers: [
    ZatcaBuilderService,
    ZatcaSubmissionService,
    CsidService,
    ZakatCalculator,
  ],
  controllers: [KsaController],
  exports: [ZatcaBuilderService, ZakatCalculator],
})
export class KsaModule {}

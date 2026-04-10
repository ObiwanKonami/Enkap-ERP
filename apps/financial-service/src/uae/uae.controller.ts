import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { UaeVatEngine } from './vat/uae-vat.engine';
import type { UaeVatRate, UaeVatResult, UaeVatTransaction, UaeVatSummary } from './vat/uae-vat.engine';
import { TrnValidator } from './vat/trn-validator';
import { PeppolBuilderService } from './einvoice/peppol-builder.service';
import type { UaeInvoiceData } from './einvoice/peppol-builder.service';
import { FtaSubmissionService } from './einvoice/fta-submission.service';
import type { FtaSubmissionResult, FtaStatusResult } from './einvoice/fta-submission.service';

/**
 * UAE FTA VAT uyum uç noktaları (Sprint 7B).
 *
 * Desteklenen işlemler:
 *  - VAT hesaplama (%5, %0, muaf)
 *  - Dönem beyan özeti
 *  - Peppol BIS 3.0 e-fatura üretimi
 *  - FTA'ya gönderim ve durum sorgulama
 *  - TRN doğrulama
 */
@ApiTags('uae')
@ApiBearerAuth('JWT')
@Controller('uae')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class UaeController {
  constructor(
    private readonly vatEngine:       UaeVatEngine,
    private readonly trnValidator:    TrnValidator,
    private readonly peppolBuilder:   PeppolBuilderService,
    private readonly ftaSubmission:   FtaSubmissionService,
  ) {}

  // ── VAT Hesaplama ─────────────────────────────────────────────────────────

  /**
   * Matrah üzerinden UAE VAT hesaplar.
   */
  @ApiOperation({
    summary: 'UAE VAT hesapla',
    description: 'Verilen AED tutarı ve oran için VAT hesaplar (%5, %0, exempt)',
  })
  @ApiResponse({ status: 200, description: 'Hesaplama başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('vat/calculate')
  @HttpCode(HttpStatus.OK)
  calculateVat(
    @Body() body: { amount: string; rate: UaeVatRate },
  ): UaeVatResult {
    const amount = BigInt(body.amount);
    return this.vatEngine.calculate(amount, body.rate);
  }

  /**
   * Dönem VAT beyan özeti.
   */
  @ApiOperation({
    summary: 'UAE VAT dönem özeti',
    description: 'İşlem listesinden FTA VAT Return için dönem özeti üretir',
  })
  @ApiResponse({ status: 200, description: 'Özet başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('vat/period-summary')
  @HttpCode(HttpStatus.OK)
  periodSummary(
    @Body() body: { transactions: Array<{ netAmountAed: string; vatAmountAed: string; rate: UaeVatRate; isOutput: boolean }> },
  ): UaeVatSummary {
    const transactions: UaeVatTransaction[] = body.transactions.map((t) => ({
      netAmountAed: BigInt(t.netAmountAed),
      vatAmountAed: BigInt(t.vatAmountAed),
      rate: t.rate,
      isOutput: t.isOutput,
    }));

    return this.vatEngine.calculatePeriodSummary(transactions);
  }

  // ── e-Fatura ─────────────────────────────────────────────────────────────

  /**
   * Peppol BIS 3.0 UBL 2.1 XML üretir.
   */
  @ApiOperation({
    summary: 'Peppol XML üret',
    description: 'UAE FTA uyumlu Peppol BIS 3.0 e-fatura XML\'i üretir',
  })
  @ApiResponse({ status: 200, description: 'XML başarıyla üretildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('einvoice/build')
  @HttpCode(HttpStatus.OK)
  buildPeppolXml(
    @Body() invoice: UaeInvoiceData,
  ): { xml: string } {
    const xml = this.peppolBuilder.buildInvoiceXml(invoice);
    return { xml };
  }

  /**
   * FTA'ya fatura gönderir.
   */
  @ApiOperation({
    summary: 'FTA\'ya gönder',
    description: "Peppol BIS 3.0 XML'i UAE FTA portalına gönderir",
  })
  @ApiResponse({ status: 200, description: 'Gönderim başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('einvoice/submit')
  @HttpCode(HttpStatus.OK)
  async submitToFta(
    @Body() body: { invoice: UaeInvoiceData },
  ): Promise<FtaSubmissionResult> {
    const xml = this.peppolBuilder.buildInvoiceXml(body.invoice);
    return this.ftaSubmission.submitInvoice(xml, body.invoice.id);
  }

  /**
   * FTA gönderim durumunu sorgular.
   */
  @ApiOperation({
    summary: 'FTA gönderim durumu',
    description: 'FTA submission ID ile gönderim durumunu sorgular',
  })
  @ApiParam({ name: 'submissionId', description: 'FTA gönderim kimliği' })
  @ApiResponse({ status: 200, description: 'Durum sorgusu başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('einvoice/:submissionId/status')
  checkFtaStatus(
    @Param('submissionId') submissionId: string,
  ): Promise<FtaStatusResult> {
    return this.ftaSubmission.checkStatus(submissionId);
  }

  // ── TRN Doğrulama ────────────────────────────────────────────────────────

  /**
   * UAE Tax Registration Number (TRN) doğrular.
   */
  @ApiOperation({
    summary: 'TRN doğrula',
    description: 'UAE FTA Tax Registration Number (15 haneli) doğrulaması yapar',
  })
  @ApiResponse({ status: 200, description: 'Doğrulama tamamlandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('trn/validate')
  @HttpCode(HttpStatus.OK)
  validateTrn(
    @Body() body: { trn: string },
  ): { valid: boolean; formatted?: string; message?: string } {
    const valid = this.trnValidator.validate(body.trn);

    if (valid) {
      return {
        valid: true,
        formatted: this.trnValidator.format(body.trn),
      };
    }

    return {
      valid: false,
      message: 'Geçersiz TRN. UAE FTA standardı: 15 haneli sayısal değer.',
    };
  }
}

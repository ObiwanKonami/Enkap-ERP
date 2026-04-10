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
import { ZatcaBuilderService } from './zatca/zatca-builder.service';
import type { ZatcaInvoiceData, ZatcaResponse } from './zatca/zatca-builder.service';
import { ZatcaSubmissionService } from './zatca/zatca-submission.service';
import { CsidService } from './zatca/csid.service';
import type { SellerInfo } from './zatca/csid.service';
import { ZakatCalculator } from './zakat/zakat.calculator';
import type { ZakatFinancialData, ZakatResult } from './zakat/zakat.calculator';

/**
 * KSA ZATCA e-Fatura ve Zakat uyum uç noktaları (Sprint 7C).
 *
 * Desteklenen işlemler:
 *  - ZATCA UBL 2.1 fatura XML üretimi
 *  - SHA-256 invoice hash hesaplama
 *  - B2C reporting (ZATCA'ya bildir)
 *  - B2B clearance (ZATCA onayı + damga)
 *  - TLV Base64 QR kodu üretimi
 *  - Zakat hesaplama (%2.5 servet vergisi)
 *  - CSID onboarding (CSR üretimi)
 */
@ApiTags('ksa')
@ApiBearerAuth('JWT')
@Controller('ksa')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class KsaController {
  constructor(
    private readonly zatcaBuilder:     ZatcaBuilderService,
    private readonly zatcaSubmission:  ZatcaSubmissionService,
    private readonly csidService:      CsidService,
    private readonly zakatCalculator:  ZakatCalculator,
  ) {}

  // ── ZATCA XML ──────────────────────────────────────────────────────────────

  /**
   * ZATCA uyumlu UBL 2.1 fatura XML'i üretir.
   */
  @ApiOperation({
    summary: 'ZATCA XML üret',
    description: 'KSA ZATCA Phase 2 uyumlu UBL 2.1 e-fatura XML üretir (QR + PIH dahil)',
  })
  @ApiResponse({ status: 200, description: 'XML başarıyla üretildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zatca/build')
  @HttpCode(HttpStatus.OK)
  buildZatcaXml(
    @Body() invoice: ZatcaInvoiceData,
  ): { xml: string } {
    const xml = this.zatcaBuilder.buildInvoiceXml(invoice);
    return { xml };
  }

  /**
   * Fatura XML'inin SHA-256 hash'ini hesaplar.
   */
  @ApiOperation({
    summary: 'Fatura hash hesapla',
    description: 'ZATCA zincirleme için fatura XML SHA-256 hash (Base64) hesaplar',
  })
  @ApiResponse({ status: 200, description: 'Hash hesaplandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zatca/hash')
  @HttpCode(HttpStatus.OK)
  computeHash(
    @Body() body: { xml: string },
  ): { hash: string } {
    const hash = this.zatcaSubmission.computeInvoiceHash(body.xml);
    return { hash };
  }

  /**
   * B2C faturasını ZATCA'ya bildirir (Reporting Mode).
   */
  @ApiOperation({
    summary: 'ZATCA B2C Reporting',
    description: 'B2C faturasını ZATCA portala bildirir (clearance gerektirmez)',
  })
  @ApiResponse({ status: 200, description: 'Raporlama başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zatca/report')
  @HttpCode(HttpStatus.OK)
  reportInvoice(
    @Body() body: { invoice: ZatcaInvoiceData },
  ): Promise<ZatcaResponse> {
    const xml  = this.zatcaBuilder.buildInvoiceXml(body.invoice);
    const hash = this.zatcaSubmission.computeInvoiceHash(xml);
    return this.zatcaSubmission.reportInvoice(xml, hash);
  }

  /**
   * B2B faturasını ZATCA'ya gönderir ve onay alır (Clearance Mode).
   */
  @ApiOperation({
    summary: 'ZATCA B2B Clearance',
    description: 'B2B faturasını ZATCA onayından geçirir ve damgalı XML alır',
  })
  @ApiResponse({ status: 200, description: 'Onay başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zatca/clear')
  @HttpCode(HttpStatus.OK)
  clearInvoice(
    @Body() body: { invoice: ZatcaInvoiceData },
  ): Promise<ZatcaResponse> {
    const xml  = this.zatcaBuilder.buildInvoiceXml(body.invoice);
    const hash = this.zatcaSubmission.computeInvoiceHash(xml);
    return this.zatcaSubmission.clearInvoice(xml, hash);
  }

  /**
   * ZATCA QR kodu üretir (TLV Base64).
   */
  @ApiOperation({
    summary: 'ZATCA QR kod üret',
    description: 'Fatura verilerinden TLV Binary → Base64 ZATCA QR kodu üretir',
  })
  @ApiResponse({ status: 200, description: 'QR kodu üretildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zatca/qr')
  @HttpCode(HttpStatus.OK)
  generateQrCode(
    @Body() invoice: ZatcaInvoiceData,
  ): { qrCode: string } {
    const qrCode = this.zatcaBuilder.generateQrCode(invoice);
    return { qrCode };
  }

  // ── Zakat ─────────────────────────────────────────────────────────────────

  /**
   * Yıllık zakat hesaplar.
   */
  @ApiOperation({
    summary: 'Zakat hesapla',
    description: 'Finansal verilerden %2.5 zakat matrahı ve ödenecek zakat tutarını hesaplar',
  })
  @ApiResponse({ status: 200, description: 'Hesaplama başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zakat/calculate')
  @HttpCode(HttpStatus.OK)
  calculateZakat(
    @Body() body: {
      equity: string;
      netProfit: string;
      longTermDebt: string;
      fixedAssets: string;
      nisapSar?: string;
    },
  ): ZakatResult {
    const data: ZakatFinancialData = {
      equity:       BigInt(body.equity),
      netProfit:    BigInt(body.netProfit),
      longTermDebt: BigInt(body.longTermDebt),
      fixedAssets:  BigInt(body.fixedAssets),
      // 2025 nisap: ~23,000 SAR = 2,300,000 halalah
      nisapSar:     body.nisapSar ? BigInt(body.nisapSar) : 2_300_000n,
    };

    return this.zakatCalculator.calculate(data);
  }

  // ── CSID Onboarding ───────────────────────────────────────────────────────

  /**
   * ZATCA CSR üretir (onboarding adım 1).
   */
  @ApiOperation({
    summary: 'ZATCA CSR üret',
    description: 'ZATCA CSID onboardingi için RSA-2048 CSR üretir',
  })
  @ApiResponse({ status: 200, description: 'CSR üretildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('zatca/csid/csr')
  @HttpCode(HttpStatus.OK)
  generateCsr(
    @Body() sellerInfo: SellerInfo,
  ): { csr: string } {
    const csr = this.csidService.generateCsr(sellerInfo);
    return { csr };
  }

  /**
   * ZATCA gönderim durumu (submission ID ile).
   * Not: ZATCA synchronous API kullandığından durum kontrolü
   * genellikle gönderim yanıtında alınır. Bu endpoint ZATCA
   * async entegrasyon için reserved'dır.
   */
  @ApiOperation({
    summary: 'ZATCA gönderim durumu',
    description: 'ZATCA submission ID ile gönderim durumunu sorgular',
  })
  @ApiParam({ name: 'submissionId', description: 'ZATCA gönderim kimliği' })
  @ApiResponse({ status: 200, description: 'Durum sorgusu başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('zatca/:submissionId')
  getStatus(
    @Param('submissionId') submissionId: string,
  ): { submissionId: string; message: string } {
    // TODO: ZATCA async durum sorgu API'si — senkron API'de yanıt anında döner
    return {
      submissionId,
      message: 'ZATCA API senkron çalışır — gönderim yanıtında durum alınır.',
    };
  }
}

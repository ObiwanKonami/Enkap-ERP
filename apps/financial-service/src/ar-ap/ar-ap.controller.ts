import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { AgingService, type AgingSummary, type AgingReportRow } from './aging.service';
import {
  PaymentPlanService,
  type CreatePlanDto,
  type MarkPaidDto,
} from './payment-plan.service';
import { ReconciliationService, type ReconciliationStatement } from './reconciliation.service';
import { ReconciliationPdfBuilder }                             from './reconciliation-pdf.builder';
import { PaymentPlan }        from './entities/payment-plan.entity';
import { PaymentInstallment } from './entities/payment-installment.entity';

/**
 * Cari Hesap (AR/AP) REST uç noktaları.
 *
 * Alacak (AR): direction=OUT, müşterilere kesen satış faturaları
 * Borç (AP):   direction=IN,  tedarikçilerden gelen alış faturaları
 */
@ApiTags('ar-ap')
@ApiBearerAuth('JWT')
@Controller('ar-ap')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class ArApController {
  constructor(
    private readonly agingService:       AgingService,
    private readonly planService:        PaymentPlanService,
    private readonly reconcilService:    ReconciliationService,
  ) {}

  // ── Cari Hesap Mutabakat Belgesi ─────────────────────────────────────────

  /**
   * Cari hesap mutabakat verisi (JSON).
   * Müşteri veya tedarikçi ID'si verilebilir; tablo otomatik tespit edilir.
   */
  @ApiOperation({ summary: 'Cari hesap mutabakat verisi', description: 'Müşteri veya tedarikçi ID\'sine göre cari hesap mutabakat ekstresini JSON olarak getirir' })
  @ApiParam({ name: 'contactId', description: 'Müşteri veya tedarikçi UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Cari hesap bulunamadı' })
  @Get('reconciliation-statement/:contactId')
  getReconciliationStatement(
    @Param('contactId') contactId: string,
  ): Promise<ReconciliationStatement> {
    return this.reconcilService.generate(contactId);
  }

  /**
   * Cari hesap mutabakat belgesi PDF indirme.
   */
  @ApiOperation({ summary: 'Mutabakat belgesi PDF indir', description: 'Cari hesap mutabakat ekstresini PDF dosyası olarak indirir' })
  @ApiParam({ name: 'contactId', description: 'Müşteri veya tedarikçi UUID' })
  @ApiResponse({ status: 200, description: 'PDF dosyası (application/pdf)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Cari hesap bulunamadı' })
  @Get('reconciliation-statement/:contactId/pdf')
  async downloadReconciliationPdf(
    @Param('contactId') contactId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const statement = await this.reconcilService.generate(contactId);
    const pdfBuffer = await new ReconciliationPdfBuilder(statement).toBuffer();
    const filename  = `Mutabakat-${statement.contactName.replace(/\s+/g, '-')}-${statement.generatedAt.replace(/\./g, '')}.pdf`;

    await reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(pdfBuffer);
  }

  // ── Vade Analizi (Aging) ─────────────────────────────────────────────────

  /**
   * Alacak aging özeti (müşteri faturaları, vadesi geçmişler).
   * Dashboard için.
   */
  @ApiOperation({ summary: 'Alacak aging özeti', description: 'Müşteri faturalarının vade analizi özetini getirir (dashboard için). 5 dilim: vadesi gelmemiş, 1-30, 31-60, 61-90, 90+ gün' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('aging/receivables/summary')
  getReceivablesSummary(): Promise<AgingSummary> {
    return this.agingService.getSummary('OUT');
  }

  /**
   * Borç aging özeti (tedarikçi faturaları).
   */
  @ApiOperation({ summary: 'Borç aging özeti', description: 'Tedarikçi faturalarının vade analizi özetini getirir. 5 dilim: vadesi gelmemiş, 1-30, 31-60, 61-90, 90+ gün' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('aging/payables/summary')
  getPayablesSummary(): Promise<AgingSummary> {
    return this.agingService.getSummary('IN');
  }

  /**
   * Müşteri bazında alacak detayı.
   * En yüksek vadesi geçmişten sırala.
   */
  @ApiOperation({ summary: 'Alacak aging detayı', description: 'Müşteri bazında alacak vade analizi detayını getirir. En yüksek vadesi geçmişten sıralı' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('aging/receivables/detail')
  getReceivablesDetail(): Promise<AgingReportRow[]> {
    return this.agingService.getDetailByParty('OUT');
  }

  /**
   * Tedarikçi bazında borç detayı.
   */
  @ApiOperation({ summary: 'Borç aging detayı', description: 'Tedarikçi bazında borç vade analizi detayını getirir' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('aging/payables/detail')
  getPayablesDetail(): Promise<AgingReportRow[]> {
    return this.agingService.getDetailByParty('IN');
  }

  // ── Ödeme Planları ───────────────────────────────────────────────────────

  /**
   * Fatura için ödeme planını getir.
   */
  @ApiOperation({ summary: 'Fatura ödeme planı getir', description: 'Belirtilen faturaya ait ödeme planını ve taksitlerini getirir' })
  @ApiParam({ name: 'invoiceId', description: 'Fatura UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Ödeme planı bulunamadı' })
  @Get('payment-plans/invoice/:invoiceId')
  async getPlanByInvoice(
    @Param('invoiceId') invoiceId: string,
  ): Promise<{ plan: PaymentPlan; installments: PaymentInstallment[] }> {
    return this.planService.findByInvoiceWithInstallments(invoiceId);
  }

  /**
   * Fatura için ödeme planı oluştur.
   *
   * Tek seferlik:      installments → [{dueDate, amount}]
   * Taksitli satış:    installments → [{...}, {...}, {...}]
   */
  @ApiOperation({ summary: 'Ödeme planı oluştur', description: 'Fatura için ödeme planı oluşturur. Tek seferlik veya taksitli (her taksit için dueDate ve amount) olabilir' })
  @ApiResponse({ status: 201, description: 'Ödeme planı başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek verisi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('payment-plans')
  @HttpCode(HttpStatus.CREATED)
  createPlan(@Body() dto: CreatePlanDto): Promise<PaymentPlan> {
    return this.planService.create(dto);
  }

  /**
   * Taksiti ödendi olarak işaretle.
   * Banka dekontu referans numarasını ekle.
   */
  @ApiOperation({ summary: 'Taksit öde', description: 'Taksiti ödendi olarak işaretler ve banka dekontu referans numarasını kaydeder' })
  @ApiParam({ name: 'id', description: 'Taksit UUID' })
  @ApiResponse({ status: 200, description: 'Taksit başarıyla ödendi olarak işaretlendi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @ApiResponse({ status: 404, description: 'Taksit bulunamadı' })
  @Patch('installments/:id/pay')
  @HttpCode(HttpStatus.OK)
  markInstallmentPaid(
    @Param('id') id: string,
    @Body() body: { paymentRef?: string; paidAt?: string },
  ): Promise<PaymentInstallment> {
    return this.planService.markPaid({
      installmentId: id,
      paymentRef:    body.paymentRef,
      paidAt:        body.paidAt,
    });
  }
}

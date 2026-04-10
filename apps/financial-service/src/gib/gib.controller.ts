import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
  Query,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TenantGuard, getTenantContext } from '@enkap/database';
import { GibSubmissionService } from './gib-submission.service';
import { GibEnvelopeService } from './gib-envelope.service';
import { ApplicationResponseService } from './application-response.service';
import { ArchiveReportingService } from './archive-reporting.service';
import { GibInboxService } from './gib-inbox.service';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { CreateApplicationResponseDto } from './dto/application-response.dto';
import { MarkCancelledOnPortalDto } from './dto/mark-cancelled.dto';
import type { FastifyRequest } from 'fastify';

/**
 * GİB EF-VAP API Controller
 *
 * Endpoint'ler:
 *  POST /gib/invoices/send                 → Faturayı GİB'e gönder (ENVELOPE — MTOM SOAP)
 *  GET  /gib/envelopes/:id                 → Zarf durumunu sorgula
 *  POST /gib/invoices/application-response → Kabul / Red yanıtı gönder (TICARIFATURA)
 *  GET  /gib/archive-reports               → Günlük e-Arşiv rapor listesi
 *  POST /gib/archive-reports/trigger       → Manuel rapor tetikleme (REPORTING kategorisi)
 */
@ApiTags('GİB E-Belge')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('gib')
export class GibController {
  constructor(
    private readonly submissionService: GibSubmissionService,
    private readonly envelopeService: GibEnvelopeService,
    private readonly applicationResponseService: ApplicationResponseService,
    private readonly archiveReportingService: ArchiveReportingService,
    private readonly inboxService: GibInboxService,
  ) {}

  /**
   * Onaylanmış faturayı GİB EF-VAP protokolü ile gönderir.
   *
   * Kabul koşulları:
   *  - Fatura status = APPROVED
   *  - ProfileID ve InvoiceTypeCode geçerli
   *  - Sektörel validasyonlar (SGK, Şarj, İlaç, İDİS)
   *  - 16 karakterlik benzersiz belge numarası
   */
  @Post('invoices/send')
  @ApiOperation({ summary: 'Faturayı GİB\'e gönder (EF-VAP SOAP)' })
  async sendInvoice(
    @Body() dto: SendInvoiceDto,
    @Req() req: FastifyRequest,
  ) {
    const userId: string = (req as unknown as { user?: { sub?: string } }).user?.sub ?? 'unknown';
    const ipAddress = req.ip;
    return this.submissionService.submitInvoice(dto, userId, ipAddress);
  }

  /**
   * GİB zarfının güncel durumunu döner.
   * Polling tabanlı durum takibi için kullanılır.
   */
  @Get('envelopes/:id')
  @ApiOperation({ summary: 'GİB zarfı durum sorgula' })
  async getEnvelope(@Param('id', ParseUUIDPipe) id: string) {
    return this.envelopeService.findOne(id);
  }

  /**
   * Gelen TICARIFATURA'ya Kabul veya Red yanıtı gönderir.
   *
   * Kısıtlamalar (backend tarafından zorlanır):
   *  - Sadece yön=IN, profil=TICARIFATURA, durum=BEKLIYOR olan faturalar
   *  - Zarfın geliş tarihinden itibaren 192 saat (8 gün) geçmemeli
   *  - RED tipinde rejectionReason zorunlu
   */
  @Post('invoices/application-response')
  @ApiOperation({ summary: 'Fatura için Kabul/Red yanıtı gönder (8 gün kuralı uygulanır)' })
  async sendApplicationResponse(
    @Body() dto: CreateApplicationResponseDto,
    @Req() req: FastifyRequest,
  ) {
    const userId: string = (req as unknown as { user?: { sub?: string } }).user?.sub ?? 'unknown';
    const ipAddress = req.ip;
    return this.applicationResponseService.sendResponse(dto, userId, ipAddress);
  }

  /**
   * Tenant'ın günlük e-Arşiv rapor kayıtlarını listeler.
   * REPORTING kategorisi belgeler (EARSIVFATURA B2C, ESMM, EMM vb.) için.
   */
  @Get('archive-reports')
  @ApiOperation({ summary: 'Günlük e-Arşiv rapor listesi' })
  @ApiQuery({ name: 'from', required: false, description: 'Başlangıç tarihi (yyyy-MM-dd)' })
  @ApiQuery({ name: 'to', required: false, description: 'Bitiş tarihi (yyyy-MM-dd)' })
  async listArchiveReports(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.archiveReportingService.listReports(from, to);
  }

  /**
   * Başarısız olan veya max retry sayısına ulaşan e-Arşiv raporunu yeniden gönderir.
   */
  @Post('archive-reports/:id/retry')
  @ApiOperation({ summary: 'e-Arşiv raporunu yeniden gönder' })
  async retryArchiveReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.archiveReportingService.retryReport(id);
  }

  /**
   * Belirli bir tenant için e-Arşiv raporunu manuel tetikler.
   * Sadece platform yöneticileri veya cron başarısız olduğunda kullanılır.
   */
  @Post('archive-reports/trigger')
  @ApiOperation({ summary: 'e-Arşiv raporunu manuel tetikle (REPORTING kategorisi)' })
  async triggerArchiveReport(@Req() req: FastifyRequest) {
    const { tenantId } = getTenantContext();
    void req;
    await this.archiveReportingService.processOneTenant(tenantId);
    return { success: true, tenantId };
  }

  /**
   * GİB SOAP Listener — PUSH Mimarisi
   *
   * GİB bu endpoint'e MTOM SOAP ile zarf PUSH eder.
   * TenantGuard UYGULANMAZ — GİB JWT göndermez.
   * Kong seviyesinde GİB IP whitelist'i ile korunur.
   *
   * Güvenlik notu: Bu endpoint /api/v1/gib/inbox olarak dışarıya açılır.
   * Kong'da GIB_IP_WHITELIST kuralı aktif olmalıdır.
   */
  @Post('inbox')
  @ApiOperation({ summary: 'GİB SOAP Listener — gelen zarf alımı (PUSH)' })
  async receiveIncomingEnvelope(
    @Req() req: RawBodyRequest<FastifyRequest>,
  ) {
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    const contentType = req.headers['content-type'] ?? '';
    return this.inboxService.handleIncomingEnvelope(rawBody, contentType);
  }

  /**
   * GİB Portalında İptal Edilmiş Faturayı Senkronize Et
   *
   * GİB portalından yapılan iptaller Enkap'a bildirilmez.
   * Kullanıcı portaldaki iptali gördükten sonra bu endpoint ile
   * yerel DB'yi senkronize eder.
   *
   * Kısıtlamalar:
   *  - Fatura mevcut tenant'a ait olmalı
   *  - Zaten CANCELLED değilse güncellenir
   */
  @Patch('invoices/:id/mark-cancelled-on-portal')
  @ApiOperation({ summary: 'GİB portalında iptal edilen faturayı işaretle' })
  async markCancelledOnPortal(
    @Param('id', ParseUUIDPipe) invoiceId: string,
    @Body() dto: MarkCancelledOnPortalDto,
    @Req() req: FastifyRequest,
  ) {
    const userId: string = (req as unknown as { user?: { sub?: string } }).user?.sub ?? 'unknown';
    const ipAddress = req.ip;
    return this.applicationResponseService.markCancelledOnPortal(invoiceId, dto, userId, ipAddress);
  }
}

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { GibEnvelopeService } from './gib-envelope.service';
import { GibAuditService, GibAuditAction } from './gib-audit.service';
import { UblBuilderService } from './ubl-builder.service';
import type { CreateApplicationResponseDto, ApplicationResponseResultDto } from './dto/application-response.dto';
import type { MarkCancelledOnPortalDto, MarkCancelledResultDto } from './dto/mark-cancelled.dto';

/**
 * Uygulama Yanıtı (Kabul/Red) Servisi
 *
 * VUK 509 gereği TICARIFATURA profilli gelen faturalar için:
 *  - Kullanıcı 8 gün (192 saat) içinde KABUL veya RED verebilir
 *  - 8 gün geçmişse: backend seviyesinde kesinlikle engellenir
 *  - KABUL/RED → UBL ApplicationResponse XML üretilir → Java ile imzalanır
 *  - İmzalı XML → POSTBOXENVELOPE olarak GİB'e gönderilir
 *
 * 8 GÜN KURALI (KRİTİK):
 *  Gelen zarfın geliş tarihi (gib_envelopes.created_at) baz alınır.
 *  Bu tarihten itibaren 192 saat geçmişse ApplicationResponse
 *  ASLA GİB'e gönderilmez — domain exception fırlatılır.
 */
@Injectable()
export class ApplicationResponseService {
  private readonly logger = new Logger(ApplicationResponseService.name);

  /** 8 gün = 192 saat (milisaniye) */
  private static readonly EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

  private readonly SIGNER_ENDPOINT =
    process.env.GIB_SIGNER_ENDPOINT ?? 'http://gib-signer:8080';

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
    private readonly envelopeService: GibEnvelopeService,
    private readonly auditService: GibAuditService,
    private readonly ublBuilder: UblBuilderService,
  ) {}

  /**
   * Gelen TICARIFATURA'ya Kabul veya Red yanıtı gönderir.
   *
   * 8 gün kuralı kontrolü:
   *  - Zarfın geliş tarihi (IN yönlü SENDERENVELOPE.created_at) kontrol edilir
   *  - 192 saat geçmişse BadRequestException fırlatılır
   *  - XML GİB'e iletilmez
   */
  async sendResponse(
    dto: CreateApplicationResponseDto,
    userId: string,
    ipAddress?: string,
  ): Promise<ApplicationResponseResultDto> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    // Fatura kaydını al
    const invoiceRows = await dataSource.query<Array<{
      id: string;
      invoice_number: string;
      gib_uuid: string;
      profile_id: string;
      envelope_uuid: string;
      commercial_status: string;
      direction: string;
    }>>(
      `SELECT id, invoice_number, gib_uuid, profile_id, envelope_uuid, commercial_status, direction
       FROM invoices
       WHERE id=$1 AND tenant_id=$2`,
      [dto.invoiceId, tenantId],
    );

    const invoice = invoiceRows[0];
    if (!invoice) throw new NotFoundException('Fatura bulunamadı');

    // Sadece gelen (IN) TICARIFATURA için ApplicationResponse gönderilir
    if (invoice.direction !== 'IN') {
      throw new BadRequestException('Sadece gelen faturalar için kabul/red gönderilebilir');
    }
    if (invoice.profile_id !== 'TICARIFATURA') {
      throw new BadRequestException('Sadece TICARIFATURA profilli faturalar için kabul/red gönderilir');
    }
    if (invoice.commercial_status !== 'BEKLIYOR') {
      throw new BadRequestException(
        `Bu fatura zaten yanıtlanmış: ${invoice.commercial_status}`,
      );
    }

    let senderAlias: string | undefined;

    // ─── 8 GÜN KURALI ────────────────────────────────────────────────────────
    if (invoice.envelope_uuid) {
      const envelopeRows = await dataSource.query<Array<{ created_at: Date; sender_alias: string }>>(
        `SELECT created_at, sender_alias FROM gib_envelopes WHERE id=$1 AND tenant_id=$2`,
        [invoice.envelope_uuid, tenantId],
      );
      const envelopeCreatedAt = envelopeRows[0]?.created_at;
      senderAlias = envelopeRows[0]?.sender_alias;

      if (envelopeCreatedAt) {
        const elapsedMs = Date.now() - new Date(envelopeCreatedAt).getTime();
        if (elapsedMs > ApplicationResponseService.EIGHT_DAYS_MS) {
          this.logger.warn(
            `8 günlük itiraz süresi aşıldı: invoice=${dto.invoiceId} geliş=${envelopeCreatedAt}`,
          );
          throw new BadRequestException(
            '8 günlük yasal itiraz süresi aşılmıştır. ' +
            'Bu fatura için kabul/red işlemi artık GİB\'e iletilemez.',
          );
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // UBL ApplicationResponse XML üret
    const responseUuid = randomUUID();
    const ublXml = this.buildApplicationResponseXml({
      responseUuid,
      invoiceGibUuid: invoice.gib_uuid,
      invoiceNumber: invoice.invoice_number,
      responseType: dto.responseType,
      rejectionReason: dto.rejectionReason,
    });

    // Transaction ile tüm adımları atomik yap
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const appResponseId = randomUUID();
    try {
      // Idempotency: aynı fatura için zaten gönderilmiş yanıt var mı?
      const existingRows = await queryRunner.query(
        `SELECT id FROM application_responses
         WHERE tenant_id=$1 AND invoice_id=$2 AND status IN ('DRAFT','SENT')
         LIMIT 1`,
        [tenantId, dto.invoiceId],
      );
      if (existingRows.length > 0) {
        await queryRunner.rollbackTransaction();
        throw new BadRequestException(
          'Bu fatura için zaten bir ApplicationResponse kaydı mevcut',
        );
      }

      // ApplicationResponse kaydını oluştur
      await queryRunner.query(
        `INSERT INTO application_responses
           (id, tenant_id, invoice_id, invoice_envelope_id, response_type, rejection_reason,
            created_by, status, ubl_xml, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,NOW())`,
        [
          appResponseId,
          tenantId,
          dto.invoiceId,
          invoice.envelope_uuid ?? null,
          dto.responseType,
          dto.rejectionReason ?? null,
          userId,
          ublXml,
        ],
      );

      // Java imzalama servisi
      let signedXml: string;
      try {
        signedXml = await this.signXml(ublXml, responseUuid);
      } catch (err) {
        await queryRunner.query(
          `UPDATE application_responses SET status='FAILED', error_message=$1 WHERE id=$2`,
          [String(err), appResponseId],
        );
        await queryRunner.commitTransaction();
        return { success: false, applicationResponseId: appResponseId, error: String(err) };
      }

      // POSTBOXENVELOPE oluştur ve GİB'e gönder
      const filename = `AR-${invoice.invoice_number}.zip`;
      let envelopeResult: { envelopeId: string; success: boolean; gibStatusCode?: number };
      try {
        envelopeResult = await this.envelopeService.createAndSend({
          signedXml,
          filename,
          documentId: appResponseId,
          receiverAlias: senderAlias ?? 'urn:mail:defaultpk@gib.gov.tr',
          userId,
          ipAddress,
        });
      } catch (err) {
        await queryRunner.query(
          `UPDATE application_responses SET status='FAILED', error_message=$1 WHERE id=$2`,
          [String(err), appResponseId],
        );
        await queryRunner.commitTransaction();
        return { success: false, applicationResponseId: appResponseId, error: `Zarf gönderim hatası: ${err}` };
      }

      const newStatus = dto.responseType === 'KABUL' ? 'KABUL' : 'RED';

      // ApplicationResponse kaydını güncelle
      await queryRunner.query(
        `UPDATE application_responses
         SET status='SENT', response_envelope_id=$1, updated_at=NOW()
         WHERE id=$2`,
        [envelopeResult.envelopeId, appResponseId],
      );

      // Fatura commercial_status'unu güncelle
      await queryRunner.query(
        `UPDATE invoices
         SET commercial_status=$1, updated_at=NOW()
         WHERE id=$2 AND tenant_id=$3`,
        [newStatus, dto.invoiceId, tenantId],
      );

      await queryRunner.commitTransaction();

      // Audit (fire-and-forget — transaction dışında)
      await this.auditService.log({
        tenantId,
        userId,
        invoiceId: dto.invoiceId,
        envelopeId: envelopeResult.envelopeId,
        action: GibAuditAction.APPLICATION_RESPONSE,
        details: {
          responseType: dto.responseType,
          rejectionReason: dto.rejectionReason,
          responseUuid,
          envelopeId: envelopeResult.envelopeId,
        },
        ipAddress,
      }).catch(() => undefined);

      this.logger.log(
        `ApplicationResponse gönderildi: invoice=${dto.invoiceId} tip=${dto.responseType} ` +
        `envelope=${envelopeResult.envelopeId}`,
      );

      return {
        success: envelopeResult.success,
        applicationResponseId: appResponseId,
        envelopeId: envelopeResult.envelopeId,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * GİB portalında iptal edilmiş faturayı yerel DB'de işaretler.
   *
   * GİB portali üzerinden yapılan iptaller Enkap'a API olarak bildirilmez.
   * Kullanıcı portalda iptali gördükten sonra bu endpoint ile senkronize eder.
   *
   * Etkilenen alanlar:
   *  - invoices.gib_status → 'CANCELLED'
   *  - invoices.cancelled_at, cancelled_by, cancellation_reason
   *  - gib_envelopes.cancellation_portal_ref (varsa)
   */
  async markCancelledOnPortal(
    invoiceId: string,
    dto: MarkCancelledOnPortalDto,
    userId: string,
    ipAddress?: string,
  ): Promise<MarkCancelledResultDto> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    const rows = await dataSource.query<Array<{
      id: string;
      invoice_number: string;
      gib_status: string;
      envelope_uuid: string;
    }>>(
      `SELECT id, invoice_number, gib_status, envelope_uuid
       FROM invoices
       WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId],
    );

    const invoice = rows[0];
    if (!invoice) throw new NotFoundException('Fatura bulunamadı');

    if (invoice.gib_status === 'CANCELLED') {
      throw new BadRequestException('Bu fatura zaten iptal olarak işaretlenmiş');
    }

    const previousStatus = invoice.gib_status ?? 'UNKNOWN';
    const cancelledAt = dto.cancelledAt ? new Date(dto.cancelledAt) : new Date();

    await dataSource.query(
      `UPDATE invoices
       SET gib_status         = 'CANCELLED',
           cancelled_at       = $1,
           cancelled_by       = $2,
           cancellation_reason = $3,
           updated_at         = NOW()
       WHERE id = $4 AND tenant_id = $5`,
      [cancelledAt, userId, dto.reason ?? 'GİB portalında iptal edildi', invoiceId, tenantId],
    );

    if (invoice.envelope_uuid && dto.gibPortalRef) {
      await dataSource.query(
        `UPDATE gib_envelopes
         SET cancellation_portal_ref = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [dto.gibPortalRef, invoice.envelope_uuid, tenantId],
      );
    }

    await this.auditService.log({
      tenantId,
      userId,
      invoiceId,
      action: GibAuditAction.PORTAL_CANCEL_SYNC,
      details: {
        previousStatus,
        gibPortalRef: dto.gibPortalRef,
        cancelledAt: cancelledAt.toISOString(),
        reason: dto.reason,
      },
      ipAddress,
    }).catch(() => undefined);

    this.logger.log(
      `GİB portal iptali işaretlendi: invoice=${invoiceId} ` +
      `öncekiDurum=${previousStatus} ref=${dto.gibPortalRef ?? '-'}`,
    );

    return { success: true, invoiceId, previousStatus };
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  private buildApplicationResponseXml(params: {
    responseUuid: string;
    invoiceGibUuid: string;
    invoiceNumber: string;
    responseType: 'KABUL' | 'RED';
    rejectionReason?: string;
  }): string {
    const now = new Date();
    const issueDate = format(now, 'yyyy-MM-dd');
    const issueTime = format(now, 'HH:mm:ss');

    // UBL ApplicationResponse kodu: A (KABUL) veya RE (RED)
    const responseCode = params.responseType === 'KABUL' ? 'A' : 'RE';
    const responseDesc =
      params.responseType === 'KABUL'
        ? 'Kabul Edildi'
        : (params.rejectionReason ?? 'Reddedildi');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
    xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TICARIFATURA</cbc:ProfileID>
  <cbc:ID>${params.responseUuid}</cbc:ID>
  <cbc:UUID>${params.responseUuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cac:DocumentResponse>
    <cac:Response>
      <cbc:ReferenceID>${params.invoiceGibUuid}</cbc:ReferenceID>
      <cbc:ResponseCode>${responseCode}</cbc:ResponseCode>
      <cbc:Description>${this.escapeXml(responseDesc)}</cbc:Description>
    </cac:Response>
    <cac:DocumentReference>
      <cbc:ID>${params.invoiceNumber}</cbc:ID>
      <cbc:UUID>${params.invoiceGibUuid}</cbc:UUID>
      <cbc:DocumentTypeCode>INVOICE</cbc:DocumentTypeCode>
    </cac:DocumentReference>
  </cac:DocumentResponse>
</ApplicationResponse>`;
  }

  private async signXml(rawXml: string, uuid: string): Promise<string> {
    const xmlBase64 = Buffer.from(rawXml, 'utf-8').toString('base64');
    const response = await fetch(`${this.SIGNER_ENDPOINT}/sign/xades-bes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, xmlContent: xmlBase64 }),
    });

    if (!response.ok) {
      throw new Error(`İmzalama servisi hatası: ${response.status}`);
    }

    const result = (await response.json()) as { signedXml: string };
    return Buffer.from(result.signedXml, 'base64').toString('utf-8');
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

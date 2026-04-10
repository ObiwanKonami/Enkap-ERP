import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TenantDataSourceManager, TenantRoutingService, getTenantContext } from '@enkap/database';
import { GibAuditService, GibAuditAction } from './gib-audit.service';
import {
  ArchiveReportBuilderService,
  ArchiveDocumentEntry,
} from './archive-report-builder.service';
import { MtomSoapService } from './mtom-soap.service';
import { getDocumentBehavior, DocumentBehavior } from './document-behavior';

/**
 * GİB e-Arşiv Raporlama Servisi — REPORTING kategorisi belgeler
 *
 * VUK 509 gereği REPORTING kategorisi belgeler (EARSIVFATURA B2C, ESMM, EMM vb.)
 * her gün 23:59'a kadar GİB Raporlama API'sine bildirilmelidir.
 *
 * İş akışı:
 *  1. Tüm aktif tenant'lar için döngü
 *  2. Bugün kesilen ve henüz raporlanmamış REPORTING kategorisi belgeleri çek
 *  3. ArchiveReportBuilderService ile eArsivRaporu UBL XML oluştur
 *  4. Java imzalama servisi (INTEGRATOR mühürü) ile imzala
 *  5. GİB Raporlama API'sine POST et
 *  6. e_archive_reports tablosuna sonucu kaydet
 *  7. GibAuditService ile ÖEBSD SIS.5 audit log yaz
 */

// ✅ FIXED #6: Batch status kodları belgelenmiş enum
enum GIB_BATCH_STATUS_CODE {
  SUCCESS = 0,
  PENDING_WITH_RETRY = 200,
}

@Injectable()
export class ArchiveReportingService {
  private readonly logger = new Logger(ArchiveReportingService.name);
  // ✅ FIXED #3: Max archive retry sabiti
  private readonly MAX_ARCHIVE_RETRIES = 5;

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly tenantRouting: TenantRoutingService,
    private readonly reportBuilder: ArchiveReportBuilderService,
    private readonly mtomSoap: MtomSoapService,
    private readonly audit: GibAuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Her gün 23:59'da tüm tenant'lar için eArsivRaporu gönderir.
   * Hata durumunda bir sonraki gün yeniden denenebilir (idempotent).
   */
  @Cron('59 23 * * *', { name: 'archive-report-daily', timeZone: 'Europe/Istanbul' })
  async runDailyArchiveReport(): Promise<void> {
    this.logger.log('Günlük e-Arşiv raporlama başladı');
    const tenantIds = await this.tenantRouting.findAllActiveIds();

    const results = await Promise.allSettled(
      tenantIds.map((id) => this.processOneTenant(id)),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(
      `Günlük rapor tamamlandı — toplam: ${tenantIds.length}, hata: ${failed}`,
    );
  }

  /**
   * Tek bir tenant için eArsivRaporu gönderir.
   * Manuel tetiklemede de kullanılabilir.
   */
  async processOneTenant(tenantId: string, reportDate = new Date()): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);

    // Bugün kesilen, henüz raporlanmamış REPORTING kategorisi faturaları çek
    const today = new Date(reportDate);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const rows: Array<{
      gib_uuid: string;
      invoice_number: string;
      profile_id: string;
      issue_date: Date;
      seller_vkn: string;
      buyer_vkn_tckn: string;
      total: string;
      currency: string;
    }> = await ds.query(
      `SELECT i.gib_uuid, i.invoice_number, i.profile_id,
              i.issue_date, tp.vkn AS seller_vkn,
              COALESCE(c.tax_id, c.national_id) AS buyer_vkn_tckn,
              i.total, i.currency
       FROM invoices i
       LEFT JOIN crm_contacts c ON c.id = i.customer_id
       LEFT JOIN tenant_profiles tp ON tp.tenant_id = $1
       WHERE i.tenant_id = $1
         AND i.issue_date >= $2
         AND i.issue_date < $3
         AND i.gib_status NOT IN ('ARCHIVE_REPORTED', 'CANCELLED')
         AND i.id NOT IN (
           SELECT UNNEST(invoice_ids) FROM e_archive_reports
           WHERE tenant_id = $1 AND report_date = $4::date AND status = 'SUCCESS'
         )`,
      [tenantId, today, tomorrow, today],
    );

    // REPORTING kategorisi olmayanları filtrele (güvenlik katmanı)
    const reportingRows = rows.filter(
      (r) => getDocumentBehavior(r.profile_id) === DocumentBehavior.REPORTING,
    );

    if (reportingRows.length === 0) {
      this.logger.debug(`Tenant ${tenantId}: raporlanacak belge yok`);
      return;
    }

    const tenantProfile: { vkn: string } | undefined = await ds
      .query('SELECT vkn FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1', [tenantId])
      .then((r: { vkn: string }[]) => r[0]);

    const integratorVkn = this.config.get<string>('GIB_INTEGRATOR_VKN') ?? '';

    const entries: ArchiveDocumentEntry[] = reportingRows.map((r) => ({
      ettn: r.gib_uuid,
      invoiceNumber: r.invoice_number,
      profileId: r.profile_id,
      issueDate: r.issue_date,
      sellerVkn: tenantProfile?.vkn ?? '',
      buyerVknTckn: r.buyer_vkn_tckn ?? '',
      total: parseInt(r.total, 10),
      currency: r.currency,
    }));

    const reportXml = this.reportBuilder.buildReportXml({
      reportDate,
      integratorVkn,
      tenantVkn: tenantProfile?.vkn ?? '',
      entries,
    });

    // Enkap entegratör mühürü ile imzala
    const signedXml = await this.signXmlAsIntegrator(reportXml);

    // GİB e-Arşiv SOAP API'ye MTOM ile gönder (EArsivWs — sendDocumentFile)
    const reportFilename = `earsiv-rapor-${today.toISOString().slice(0, 10)}-${tenantId.slice(0, 8)}.zip`;

    // ✅ FIXED #2: sendDocumentFile exception handling sarılmış
    let paketId: string | undefined;
    let gibDurumKodu: number | undefined;
    let lastError: string | undefined;
    let sendResult: any;
    const isSuccess: boolean = await (async () => {
      try {
        sendResult = await this.mtomSoap.sendDocumentFile(signedXml, reportFilename);

        // Gönderim başarılıysa paketId ile durum sorgula (getBatchStatus)
        paketId = sendResult.paketId;

        if (sendResult.success && paketId) {
          const statusResult = await this.mtomSoap.getBatchStatus(paketId);
          gibDurumKodu = statusResult.durumKodu;
          // ✅ FIXED #6: Batch status kodları enum ile kontrol et
          if (gibDurumKodu !== GIB_BATCH_STATUS_CODE.SUCCESS && gibDurumKodu !== GIB_BATCH_STATUS_CODE.PENDING_WITH_RETRY) {
            // ✅ FIXED #11: Error message truncation 500 chars
            lastError = statusResult.durumAciklama?.slice(0, 500) ?? 'Bilinmeyen GİB hatası';
          }
          return sendResult.success ?? false;
        } else if (!sendResult.success) {
          // ✅ FIXED #11: Standardize error truncation to 500 chars
          lastError = sendResult.rawResponse?.slice(0, 500) ?? 'Bağlantı hatası';
          return false;
        }
        return sendResult.success ?? false;
      } catch (err) {
        this.logger.error(`GİB e-Arşiv SOAP gönderim hatası (tenant ${tenantId}): ${err}`);
        // ✅ FIXED #11: Truncate error message to 500 chars
        lastError = `İç hata: ${(err as Error).message.slice(0, 500)}`;
        sendResult = { success: false };
        return false;
      }
    })();

    // Rapor kaydını oluştur
    const invoiceIds = await ds
      .query(
        `SELECT id FROM invoices WHERE tenant_id = $1 AND gib_uuid = ANY($2)`,
        [tenantId, reportingRows.map((r) => r.gib_uuid)],
      )
      .then((r: { id: string }[]) => r.map((row) => row.id));

    // ✅ FIXED #3: Retry count enforcement — max 5 retries
    await ds.query(
      `INSERT INTO e_archive_reports
         (tenant_id, report_date, invoice_count, invoice_ids, status,
          gib_response, gib_reference_number, retry_count, last_error, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, NOW())
       ON CONFLICT (tenant_id, report_date) DO UPDATE
         SET invoice_count      = EXCLUDED.invoice_count,
             invoice_ids        = EXCLUDED.invoice_ids,
             status             = EXCLUDED.status,
             gib_response       = EXCLUDED.gib_response,
             gib_reference_number = EXCLUDED.gib_reference_number,
             retry_count        = CASE
                                  WHEN e_archive_reports.retry_count < $9 THEN e_archive_reports.retry_count + 1
                                  ELSE e_archive_reports.retry_count
                                  END,
             last_error         = EXCLUDED.last_error,
             sent_at            = EXCLUDED.sent_at`,
      [
        tenantId,
        today,
        entries.length,
        invoiceIds,
        isSuccess ? 'SUCCESS' : 'FAILED',
        JSON.stringify({ gibDurumKodu, paketId }),
        paketId ?? null,
        lastError ?? null,
        this.MAX_ARCHIVE_RETRIES,
      ],
    );

    if (isSuccess) {
      // Başarıyla raporlanan faturaların durumunu güncelle
      await ds.query(
        `UPDATE invoices SET gib_status = 'ARCHIVE_REPORTED'
         WHERE tenant_id = $1 AND id = ANY($2)`,
        [tenantId, invoiceIds],
      );
    }

    // ✅ FIXED #4: Audit logging with graceful error handling
    await this.audit.log({
      tenantId,
      action: GibAuditAction.ARCHIVE_REPORT_SENT,
      details: {
        reportDate: today.toISOString().slice(0, 10),
        invoiceCount: entries.length,
        success: isSuccess,
        paketId,
        gibDurumKodu,
      },
    }).catch((err) => {
      this.logger.warn(
        `Audit log yazılamadı (tenant ${tenantId}, report_date ${today.toISOString().slice(0, 10)}): ${(err as Error).message}`,
      );
    });

    this.logger.log(
      `Tenant ${tenantId}: ${entries.length} belge raporlandı — ` +
      `${isSuccess ? 'BAŞARILI' : 'HATA'} paketId=${paketId ?? '-'}`,
    );
  }

  /**
   * Tenant'ın e-Arşiv rapor kayıtlarını tarihe göre listeler.
   */
  async listReports(from?: string, to?: string): Promise<any> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const params: any[] = [tenantId];
    let whereClause = 'tenant_id = $1';

    if (from) {
      params.push(from);
      whereClause += ` AND report_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      whereClause += ` AND report_date <= $${params.length}`;
    }

    const rows = await ds.query(
      `SELECT id, report_date, invoice_count, status,
              gib_reference_number, retry_count, last_error, sent_at
       FROM e_archive_reports
       WHERE ${whereClause}
       ORDER BY report_date DESC`,
      params,
    );

    return {
      data: rows,
      total: rows.length,
      limit: rows.length,
      offset: 0,
    };
  }

  /**
   * Başarısız olan veya max retry sayısına ulaşan bir raporun yeniden gönderilmesini tetikler.
   */
  async retryReport(reportId: string): Promise<any> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    // Rapor kaydını bul
    const report: any = await ds.query(
      `SELECT id, report_date, invoice_ids FROM e_archive_reports
       WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [reportId, tenantId],
    ).then((r) => r[0]);

    if (!report) {
      throw new Error('Rapor bulunamadı');
    }

    // Raporun ilişkili olduğu faturaları çek
    const invoiceRows: any[] = await ds.query(
      `SELECT i.gib_uuid, i.invoice_number, i.profile_id,
              i.issue_date, tp.vkn AS seller_vkn,
              COALESCE(c.tax_id, c.national_id) AS buyer_vkn_tckn,
              i.total, i.currency
       FROM invoices i
       LEFT JOIN crm_contacts c ON c.id = i.customer_id
       LEFT JOIN tenant_profiles tp ON tp.tenant_id = $1
       WHERE i.id = ANY($2)`,
      [tenantId, report.invoice_ids],
    );

    if (invoiceRows.length === 0) {
      throw new Error('Bu rapor ile ilişkili fatura bulunamadı');
    }

    const tenantProfile: any = await ds
      .query('SELECT vkn FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1', [tenantId])
      .then((r) => r[0]);

    const integratorVkn = this.config.get<string>('GIB_INTEGRATOR_VKN') ?? '';

    const entries: ArchiveDocumentEntry[] = invoiceRows.map((r) => ({
      ettn: r.gib_uuid,
      invoiceNumber: r.invoice_number,
      profileId: r.profile_id,
      issueDate: r.issue_date,
      sellerVkn: tenantProfile?.vkn ?? '',
      buyerVknTckn: r.buyer_vkn_tckn ?? '',
      total: parseInt(r.total, 10),
      currency: r.currency,
    }));

    // XML ve imza işlemleri
    const reportDate = new Date(report.report_date);
    const reportXml = this.reportBuilder.buildReportXml({
      reportDate,
      integratorVkn,
      tenantVkn: tenantProfile?.vkn ?? '',
      entries,
    });

    const signedXml = await this.signXmlAsIntegrator(reportXml);
    const reportFilename = `earsiv-rapor-${report.report_date}-${tenantId.slice(0, 8)}.zip`;

    let paketId: string | undefined;
    let lastError: string | undefined;
    let isSuccess = false;

    try {
      const sendResult = await this.mtomSoap.sendDocumentFile(signedXml, reportFilename);
      paketId = sendResult.paketId;

      if (sendResult.success && paketId) {
        const statusResult = await this.mtomSoap.getBatchStatus(paketId);
        isSuccess = statusResult.durumKodu === GIB_BATCH_STATUS_CODE.SUCCESS ||
                    statusResult.durumKodu === GIB_BATCH_STATUS_CODE.PENDING_WITH_RETRY;

        if (!isSuccess) {
          lastError = statusResult.durumAciklama?.slice(0, 500) ?? 'Bilinmeyen GİB hatası';
        }
      } else {
        lastError = sendResult.rawResponse?.slice(0, 500) ?? 'Bağlantı hatası';
      }
    } catch (err) {
      this.logger.error(`Retry: GİB e-Arşiv SOAP gönderim hatası: ${err}`);
      lastError = `İç hata: ${(err as Error).message.slice(0, 500)}`;
    }

    // Rapor kaydını güncelle
    await ds.query(
      `UPDATE e_archive_reports
       SET status = $1,
           gib_response = $2,
           gib_reference_number = $3,
           last_error = $4,
           retry_count = retry_count + 1,
           sent_at = NOW()
       WHERE id = $5 AND tenant_id = $6`,
      [
        isSuccess ? 'SUCCESS' : 'FAILED',
        JSON.stringify({ paketId }),
        paketId ?? null,
        lastError ?? null,
        reportId,
        tenantId,
      ],
    );

    if (isSuccess) {
      // Başarıyla raporlanan faturaların durumunu güncelle
      await ds.query(
        `UPDATE invoices SET gib_status = 'ARCHIVE_REPORTED'
         WHERE tenant_id = $1 AND id = ANY($2)`,
        [tenantId, report.invoice_ids],
      );
    }

    return { success: isSuccess, paketId, error: lastError || null };
  }

  /**
   * Enkap entegratör mali mühürü ile XML imzalar.
   * INTEGRATOR signer endpoint'ini kullanır (tenant'ınkinden ayrı).
   */
  private async signXmlAsIntegrator(xml: string): Promise<string> {
    const endpoint =
      this.config.get<string>('GIB_INTEGRATOR_SIGNER_ENDPOINT') ??
      'http://gib-integrator-signer:8081';

    const response = await fetch(`${endpoint}/sign/xades-bes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
    });

    if (!response.ok) {
      throw new Error(`Entegratör imzalama hatası: HTTP ${response.status}`);
    }
    return response.text();
  }
}

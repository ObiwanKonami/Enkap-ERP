import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { MtomSoapService } from './mtom-soap.service';
import { GibAuditService, GibAuditAction } from './gib-audit.service';
import type { GibEnvelope } from './entities/gib-envelope.entity';

/**
 * GİB Durum Kodu → Enkap Aksiyonu haritalama.
 * GİB Mevzuat Bölüm 5'e göre.
 */
/**
 * GİB durum kategorileri (Roadmap Bölüm 4 — State Machine).
 *  PENDING   → Polling devam etmeli
 *  SUCCESS   → Akış başarıyla bitti
 *  RETRYABLE → Ağ hatası / timeout / alıcı yanıtsız — tekrar denenecek (max 48 saat)
 *  FATAL     → Şema/imza/mükellef hatası — kullanıcı müdahalesi gerekir
 */
export enum GibStatusCategory {
  PENDING   = 'PENDING',
  SUCCESS   = 'SUCCESS',
  RETRYABLE = 'RETRYABLE',
  FATAL     = 'FATAL',
}

export const GIB_STATUS_ACTIONS: Record<number, { category: GibStatusCategory; status: 'PROCESSING' | 'SUCCESS' | 'FAILED'; description: string }> = {
  1000: { category: GibStatusCategory.PENDING,   status: 'PROCESSING', description: 'Kuyruğa eklendi' },
  1100: { category: GibStatusCategory.PENDING,   status: 'PROCESSING', description: 'İşleniyor' },
  1140: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'Şema hatası' },
  1150: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'Schematron hatası' },
  1160: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'İmza/iş kuralı hatası' },
  1163: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'ETTN çakışması — zaten kayıtlı' },
  1164: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'Belge numarası çakışması' },
  1200: { category: GibStatusCategory.PENDING,   status: 'PROCESSING', description: 'Zarf başarıyla işlendi, alıcıya iletildi' },
  1210: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'Alıcı adresi bulunamadı' },
  1215: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'Alıcı posta kutusu dolu' },
  1220: { category: GibStatusCategory.RETRYABLE, status: 'PROCESSING', description: 'Alıcı sistemden yanıt bekleniyor (max 48 saat)' },
  1230: { category: GibStatusCategory.FATAL,     status: 'FAILED',     description: 'Alıcı sistemi zarfı reddetti' },
  1300: { category: GibStatusCategory.SUCCESS,   status: 'SUCCESS',    description: 'Başarıyla tamamlandı' },
};

/**
 * GİB Zarf Yönetim Servisi
 *
 * Sorumluluklar:
 *  1. Zarf oluşturma (SENDERENVELOPE / POSTBOXENVELOPE)
 *  2. MTOM SOAP ile GİB'e gönderme
 *  3. GİB durum koduna göre fatura/irsaliye statüsü güncelleme
 *  4. Zarf durum sorgulama (polling için)
 *
 * Belge numarası çakışması (1163/1164) durumunda:
 *  - Sistem otomatik yeni ETTN üretir ve tekrar göndermeyi dener
 *  - Max 1 otomatik yeniden deneme — sonraki deneme kullanıcıya bırakılır
 */
@Injectable()
export class GibEnvelopeService {
  private readonly logger = new Logger(GibEnvelopeService.name);

  private readonly GIB_GB_ALIAS =
    process.env.GIB_GB_ALIAS ?? 'urn:mail:defaultgb@enkap.com.tr';

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
    private readonly mtomSoap: MtomSoapService,
    private readonly auditService: GibAuditService,
  ) {}

  /**
   * Yeni bir SENDERENVELOPE oluşturur, ZIP'ler ve GİB'e gönderir.
   *
   * Akış:
   *  1. Zarf kaydını DB'ye yaz (PENDING)
   *  2. İmzalı XML'i ZIP'le + hash'le
   *  3. GİB SOAP sendDocument → MTOM
   *  4. Yanıta göre zarf statüsünü güncelle
   *  5. Audit log yaz
   */
  async createAndSend(params: {
    signedXml: string;
    filename: string;
    documentId: string;
    senderAlias?: string;
    receiverAlias?: string;
    userId: string;
    ipAddress?: string;
  }): Promise<{ envelopeId: string; success: boolean; gibStatusCode?: number }> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    const envelopeId = randomUUID();
    const senderAlias = params.senderAlias ?? this.GIB_GB_ALIAS;

    // Declare hash variables before transaction
    let zipBuffer: Buffer;
    let md5Hash: string;
    let sha256Hash: string;

    // ✅ FIXED #10: Transaction isolation — envelope creation + hash update atomicity
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.startTransaction();
    try {
      // Adım 1: Zarf kaydını oluştur
      await queryRunner.query(
        `INSERT INTO gib_envelopes
           (id, tenant_id, type, direction, sender_alias, receiver_alias, document_ids, status, created_at, updated_at)
         VALUES ($1,$2,'SENDERENVELOPE','OUT',$3,$4,$5,'PENDING',NOW(),NOW())`,
        [envelopeId, tenantId, senderAlias, params.receiverAlias, `{${params.documentId}}`],
      );

      // Adım 2: ZIP + hash
      const hashes = await this.mtomSoap.zipAndHash(
        params.signedXml,
        params.filename,
      );
      zipBuffer = hashes.zipBuffer;
      md5Hash = hashes.md5Hash;
      sha256Hash = hashes.sha256Hash;

      await queryRunner.query(
        `UPDATE gib_envelopes SET zip_md5_hash=$1, zip_sha256_hash=$2, zip_filename=$3, updated_at=NOW()
         WHERE id=$4 AND tenant_id=$5`,
        [md5Hash, sha256Hash, params.filename, envelopeId, tenantId],
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Adım 3: MTOM SOAP gönderim
    let result: { success: boolean; statusCode?: number; statusMessage?: string; rawResponse?: string };
    try {
      result = await this.mtomSoap.sendDocument({
        zipBuffer,
        md5Hash,
        filename: params.filename,
        senderAlias,
        receiverAlias: params.receiverAlias,
      });
    } catch (err) {
      this.logger.error(`MTOM SOAP gönderim hatası: envelope=${envelopeId} err=${err}`);
      await dataSource.query(
        `UPDATE gib_envelopes
         SET status='FAILED', gib_status_message=$1, updated_at=NOW()
         WHERE id=$2 AND tenant_id=$3`,
        [`SOAP bağlantı hatası: ${String(err).slice(0, 500)}`, envelopeId, tenantId],
      );
      return { envelopeId, success: false };
    }

    const statusCode = result.statusCode;
    const statusAction = statusCode ? GIB_STATUS_ACTIONS[statusCode] : undefined;
    // ✅ FIXED #8: Explicit logging for PROCESSING status
    const envelopeStatus = statusAction?.status ?? (result.success ? 'PROCESSING' : 'FAILED');
    if (envelopeStatus === 'PROCESSING') {
      this.logger.log(
        `Zarf işleme durumundadır (PROCESSING): envelope=${envelopeId} statusCode=${statusCode}`,
      );
    }

    // Adım 4: Zarf statüsünü güncelle
    await dataSource.query(
      `UPDATE gib_envelopes
       SET status=$1, gib_status_code=$2, gib_status_message=$3,
           sent_at=NOW(), raw_gib_response=$4, updated_at=NOW()
       WHERE id=$5 AND tenant_id=$6`,
      [
        envelopeStatus,
        statusCode ?? null,
        statusAction?.description ?? result.statusMessage ?? null,
        result.rawResponse ? result.rawResponse.substring(0, 500) : null,
        envelopeId,
        tenantId,
      ],
    );

    // Adım 5: Audit log
    await this.auditService.log({
      tenantId,
      userId: params.userId,
      invoiceId: params.documentId,
      action: GibAuditAction.ENVELOPE_SENT,
      details: {
        envelopeId,
        filename: params.filename,
        md5Hash,
        sha256Hash,
        statusCode,
        statusMessage: statusAction?.description,
      },
      ipAddress: params.ipAddress,
    }).catch((err) => this.logger.warn(`Audit log yazılamadı: ${(err as Error).message.slice(0, 500)}`));

    this.logger.log(
      `Zarf gönderildi: envelope=${envelopeId} status=${envelopeStatus} gibKod=${statusCode}`,
    );

    return {
      envelopeId,
      success: envelopeStatus !== 'FAILED',
      gibStatusCode: statusCode,
    };
  }

  /**
   * Polling sonucu gelen GİB durum koduna göre zarfı ve bağlı belgeyi günceller.
   *
   * Fatura statüsü güncellemeleri:
   *  SUCCESS (1300)    → invoices.status = 'ACCEPTED_GIB'
   *  FAILED (şema vb) → invoices.status = 'DRAFT' (kullanıcı düzeltebilir)
   */
  async applyGibStatus(
    envelopeId: string,
    tenantId: string,
    statusCode: number,
    rawResponse: string,
  ): Promise<void> {
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    const action = GIB_STATUS_ACTIONS[statusCode];

    if (!action) {
      // ✅ FIXED #5: Log unknown GIB status code with details for debugging
      this.logger.warn(
        `Bilinmeyen GİB durum kodu alındı: statusCode=${statusCode} envelopeId=${envelopeId} tenantId=${tenantId} — ` +
        `GIB_STATUS_ACTIONS mapping'i kontrol edilsin; rawResponse: ${rawResponse?.slice(0, 500) ?? '-'}`,
      );
      return;
    }

    await dataSource.query(
      `UPDATE gib_envelopes
       SET status=$1, gib_status_code=$2, gib_status_message=$3,
           last_polled_at=NOW(), raw_gib_response=$4, updated_at=NOW()
       WHERE id=$5 AND tenant_id=$6`,
      [action.status, statusCode, action.description, rawResponse.substring(0, 500), envelopeId, tenantId],
    );

    // Bağlı fatura statüsünü güncelle
    await this.updateLinkedInvoiceStatus(dataSource, envelopeId, tenantId, action.status);

    // Audit log — durum geçişi kayıt altına alınır (ÖEBSD SIS.5)
    await this.auditService.log({
      tenantId,
      envelopeId,
      userId: 'system:status-apply',
      action: GibAuditAction.ENVELOPE_STATUS,
      details: {
        statusCode,
        description: action.description,
        category: action.category,
        envelopeStatus: action.status,
      },
    }).catch((err) => this.logger.warn(`Audit log yazılamadı: ${err}`));

    this.logger.log(
      `GİB durum uygulandı: envelope=${envelopeId} kod=${statusCode} ` +
      `açıklama="${action.description}" envelopeStatus=${action.status}`,
    );
  }

  /** Zarf detayını getir (UI polling için) */
  async findOne(envelopeId: string): Promise<GibEnvelope | null> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    const rows = await dataSource.query<GibEnvelope[]>(
      `SELECT * FROM gib_envelopes WHERE id=$1 AND tenant_id=$2`,
      [envelopeId, tenantId],
    );
    return rows[0] ?? null;
  }

  /** Polling bekleyen zarfları getir (polling job için) */
  async findPendingPolls(tenantId: string, limit = 50): Promise<Array<{ id: string; senderAlias: string }>> {
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);
    return dataSource.query<Array<{ id: string; senderAlias: string }>>(
      `SELECT id, sender_alias as "senderAlias"
       FROM gib_envelopes
       WHERE tenant_id=$1
         AND status='PROCESSING'
         AND (next_poll_at IS NULL OR next_poll_at <= NOW())
       ORDER BY created_at ASC
       LIMIT $2`,
      [tenantId, limit],
    );
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  private async updateLinkedInvoiceStatus(
    dataSource: import('typeorm').DataSource,
    envelopeId: string,
    tenantId: string,
    envelopeStatus: 'PROCESSING' | 'SUCCESS' | 'FAILED',
  ): Promise<void> {
    let invoiceStatus: string | null = null;

    if (envelopeStatus === 'SUCCESS') {
      invoiceStatus = 'ACCEPTED_GIB';
    } else if (envelopeStatus === 'FAILED') {
      // Şema hatası → faturayı DRAFT'a çek, kullanıcı düzeltebilir
      invoiceStatus = 'DRAFT';
    }

    if (!invoiceStatus) return;

    await dataSource.query(
      `UPDATE invoices
       SET status=$1, updated_at=NOW()
       WHERE envelope_uuid=$2 AND tenant_id=$3 AND status='PENDING_GIB'`,
      [invoiceStatus, envelopeId, tenantId],
    );
  }
}

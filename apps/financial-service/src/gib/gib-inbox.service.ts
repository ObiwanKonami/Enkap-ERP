import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { GibAuditService, GibAuditAction } from './gib-audit.service';

/**
 * GİB SOAP Listener Servisi — PUSH Mimarisi
 *
 * GİB EF-VAP'ta "inbox polling" yoktur.
 * GİB, zarfı Enkap'ın bu endpoint'ine SOAP ile PUSH eder:
 *   POST /api/v1/gib/inbox  (MTOM multipart/related)
 *
 * Akış:
 *  1. GİB → MTOM SOAP isteği gönderir (SBDH + ZIP payload)
 *  2. Bu servis raw body'yi ayrıştırır
 *  3. receiver_alias → tenant_profiles.gib_pk_alias → tenantId
 *  4. incoming_envelopes tablosuna idempotent INSERT
 *  5. GibInboxProcessorService arka planda işler
 *
 * Güvenlik:
 *  - TenantGuard UYGULANMAZ — GİB JWT göndermez
 *  - Kong'da GİB IP whitelist'i zorunlu (GİB teknik ekibinden alınacak)
 *  - Istio mTLS bu endpoint için PERMISSIVE moda alınır (GİB sertifikası farklı CA)
 */
@Injectable()
export class GibInboxService {
  private readonly logger = new Logger(GibInboxService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlaneDs: DataSource,
    private readonly tenantDataSourceManager: TenantDataSourceManager,
    private readonly auditService: GibAuditService,
  ) {}

  /**
   * GİB'den gelen MTOM SOAP zarfını işler.
   *
   * @param rawBody  Raw HTTP body (Buffer) — MTOM multipart
   * @param contentType Content-Type header (boundary parametresini içerir)
   * @returns SOAP yanıtı (ACK veya FAULT)
   */
  async handleIncomingEnvelope(
    rawBody: Buffer,
    contentType: string,
  ): Promise<{ success: boolean; envelopeId?: string; error?: string }> {
    // MTOM body'den SBDH metaverilerini çıkar
    let parsed: ParsedIncomingEnvelope;
    try {
      parsed = this.parseMtomEnvelope(rawBody, contentType);
    } catch (err) {
      this.logger.error(`MTOM ayrıştırma hatası: ${String(err)}`);
      throw new BadRequestException(`MTOM ayrıştırma hatası: ${String(err)}`);
    }

    this.logger.log(
      `Gelen zarf: sender=${parsed.senderAlias} receiver=${parsed.receiverAlias} ` +
      `docType=${parsed.documentType} envelopeId=${parsed.envelopeId}`,
    );

    // receiver_alias → tenantId çözümlemesi (control_plane)
    const tenantRows = await this.controlPlaneDs.query<Array<{ tenant_id: string }>>(
      `SELECT tenant_id FROM tenant_profiles WHERE gib_pk_alias = $1 LIMIT 1`,
      [parsed.receiverAlias],
    );

    if (!tenantRows.length) {
      this.logger.warn(
        `Bilinmeyen receiver_alias: ${parsed.receiverAlias} — zarf reddedildi`,
      );
      // GİB'e SOAP FAULT yerine boş başarı dönüyoruz; IP whitelist bunu engeller
      return { success: false, error: `Bilinmeyen alıcı alias: ${parsed.receiverAlias}` };
    }

    const tenantId = tenantRows[0].tenant_id;
    const dataSource = await this.tenantDataSourceManager.getDataSource(tenantId);

    // Idempotent INSERT — aynı envelope_id tekrar gelirse görmezden gel
    const incomingId = randomUUID();
    await dataSource.query(
      `INSERT INTO incoming_envelopes
         (id, tenant_id, gib_envelope_id, sender_alias, receiver_alias,
          document_type, raw_payload, processed, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW())
       ON CONFLICT (gib_envelope_id) DO NOTHING`,
      [
        incomingId,
        tenantId,
        parsed.envelopeId,
        parsed.senderAlias,
        parsed.receiverAlias,
        parsed.documentType,
        parsed.zipPayloadBase64,
      ],
    );

    // Audit
    await this.auditService.log({
      tenantId,
      userId: 'GIB_PUSH',
      action: GibAuditAction.ENVELOPE_RECEIVED,
      details: {
        envelopeId: parsed.envelopeId,
        senderAlias: parsed.senderAlias,
        documentType: parsed.documentType,
      },
    }).catch(() => undefined);

    return { success: true, envelopeId: parsed.envelopeId };
  }

  // ─── MTOM / SBDH Ayrıştırıcı ─────────────────────────────────────────────

  /**
   * MTOM multipart/related body'den SBDH metadata + ZIP payload çıkarır.
   *
   * NOT: GİB'in tam SOAP şeması alındığında bu metod güncellenir.
   * Şu an minimal SBDH ayrıştırma yapılmaktadır.
   * Ayrıştırma mantığı: Content-Type boundary ile parçalar ayrılır,
   * ilk part (SOAP envelope) XML olarak parse edilir.
   */
  private parseMtomEnvelope(
    rawBody: Buffer,
    contentType: string,
  ): ParsedIncomingEnvelope {
    const bodyStr = rawBody.toString('utf-8');

    // Boundary'yi Content-Type header'dan çıkar
    const boundaryMatch = /boundary="?([^";]+)"?/i.exec(contentType);
    if (!boundaryMatch) {
      throw new Error('MTOM boundary bulunamadı');
    }
    const boundary = `--${boundaryMatch[1]}`;

    // MTOM partlarını böl
    const parts = bodyStr.split(boundary).filter(
      (p) => p.trim() && p.trim() !== '--',
    );

    if (parts.length < 2) {
      throw new Error(`MTOM part sayısı yetersiz: ${parts.length}`);
    }

    // İlk part: SOAP Envelope (SBDH içerir)
    const soapPart = parts[0];

    // SBDH alanlarını XML'den çıkar (regex — tam XML parser V1 sonrası eklenir)
    const envelopeId    = this.extractXmlValue(soapPart, 'InstanceIdentifier') ?? randomUUID();
    const senderAlias   = this.extractXmlValue(soapPart, 'Sender')             ?? 'unknown';
    const receiverAlias = this.extractXmlValue(soapPart, 'Receiver')           ?? 'unknown';
    const documentType  = this.extractXmlValue(soapPart, 'Type')               ?? 'INVOICE';

    // İkinci part: ZIP payload (base64 veya binary)
    const zipPart = parts[1] ?? '';
    const zipBody = zipPart.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
    const zipPayloadBase64 = Buffer.from(zipBody, 'binary').toString('base64');

    return { envelopeId, senderAlias, receiverAlias, documentType, zipPayloadBase64 };
  }

  private extractXmlValue(xml: string, tagName: string): string | undefined {
    const match = new RegExp(`<[^:>]*:?${tagName}[^>]*>([^<]+)<`, 'i').exec(xml);
    return match?.[1]?.trim();
  }
}

interface ParsedIncomingEnvelope {
  envelopeId: string;
  senderAlias: string;
  receiverAlias: string;
  documentType: string;
  zipPayloadBase64: string;
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * ÖEBSD / ISO 27001 Uyumlu GİB Denetim İzi Servisi
 *
 * GİB Özel Entegratör gereksinimleri (ÖEBSD SIS.5) uyarınca:
 *  - Faturaya müdahale eden IP, kullanıcı, işlem tarihi, imza hash'i
 *  - 10 yıl saklanmak üzere silinemez (immutable) log tablosuna yazılır
 *  - Tablo: control_plane.gib_audit_logs
 *
 * Tablo tamamen INSERT-only'dir. UPDATE/DELETE asla gerçekleşmez.
 * PostgreSQL'de bu kural RLS policy ile de desteklenir.
 */

export enum GibAuditAction {
  INVOICE_CREATED      = 'INVOICE_CREATED',
  INVOICE_SIGNED       = 'INVOICE_SIGNED',
  ENVELOPE_SENT        = 'ENVELOPE_SENT',
  ENVELOPE_STATUS      = 'ENVELOPE_STATUS',
  APPLICATION_RESPONSE = 'APPLICATION_RESPONSE',
  INVOICE_CANCELLED    = 'INVOICE_CANCELLED',
  ENVELOPE_RECEIVED    = 'ENVELOPE_RECEIVED',
  PORTAL_CANCEL_SYNC   = 'PORTAL_CANCEL_SYNC',
  GIB_ERROR            = 'GIB_ERROR',
  ARCHIVE_REPORT_SENT  = 'ARCHIVE_REPORT_SENT',
}

export interface GibAuditEntry {
  tenantId: string;
  /** Cron job'lar için opsiyonel — sistem kaynaklı işlemlerde olmayabilir */
  userId?: string;
  invoiceId?: string;
  envelopeId?: string;
  /** Belgenin ETTN (UUID) değeri — ÖEBSD SIS.5 zorunlu alanı */
  documentUuid?: string;
  /** Java signer'dan dönen imza hash değeri — denetim için */
  signatureHash?: string;
  action: GibAuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class GibAuditService {
  private readonly logger = new Logger(GibAuditService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlaneDs: DataSource,
  ) {}

  /**
   * GİB denetim kaydı yazar.
   *
   * Silinemez kayıt: Bu metod yalnızca INSERT yapar, hiçbir zaman UPDATE/DELETE çağırmaz.
   * Hata durumunda sessizce loglar — asıl iş akışını asla durdurma.
   */
  async log(entry: GibAuditEntry): Promise<void> {
    try {
      await this.controlPlaneDs.query(
        `INSERT INTO gib_audit_logs
           (id, tenant_id, user_id, invoice_id, envelope_id, document_uuid, signature_hash, action, details, ip_address, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW())`,
        [
          entry.tenantId,
          entry.userId,
          entry.invoiceId ?? null,
          entry.envelopeId ?? null,
          entry.documentUuid ?? null,
          entry.signatureHash ?? null,
          entry.action,
          JSON.stringify(entry.details ?? {}),
          entry.ipAddress ?? null,
        ],
      );
    } catch (err) {
      // Fire-and-forget: audit hatası ana akışı durdurmamalı
      this.logger.warn(
        `Audit log yazma hatası (tenant=${entry.tenantId} action=${entry.action}): ${err}`,
      );
    }
  }
}

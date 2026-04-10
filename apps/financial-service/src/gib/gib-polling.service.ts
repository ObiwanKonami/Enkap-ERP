import { Injectable, Logger } from '@nestjs/common';
import { TenantDataSourceManager, TenantRoutingService } from '@enkap/database';
import { MtomSoapService } from './mtom-soap.service';
import { GibEnvelopeService } from './gib-envelope.service';
import { GibAuditService, GibAuditAction } from './gib-audit.service';

/**
 * GİB Durum Sorgulama (Polling) Servisi
 *
 * EF-VAP protokolünde GİB sendDocument'a eşzamanlı olarak yalnızca
 * Zarf'ın alındığına dair ACK döner. Asıl durum için polling gerekir.
 *
 * Polling stratejisi:
 *  - Her 5 saatte bir çalışır (RabbitMQ Delayed Exchange veya Cron)
 *  - Durumu PROCESSING olan tüm zarfları sorgular
 *  - GİB'den 1300 gelene veya FAILED olana kadar devam eder
 *  - 1220 (hedef yanıt vermedi) → beklemeye devam
 *
 * Bu servis @Cron veya RabbitMQ Delayed Message ile tetiklenir.
 * Tenant listesi TenantRoutingService'den alınır.
 */
@Injectable()
export class GibPollingService {
  private readonly logger = new Logger(GibPollingService.name);

  /** 1220 kodu için maksimum polling sayısı (5 saat × 48 = 10 gün) */
  private static readonly MAX_POLL_ATTEMPTS = 48;

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
    private readonly routingService: TenantRoutingService,
    private readonly mtomSoap: MtomSoapService,
    private readonly envelopeService: GibEnvelopeService,
    private readonly auditService: GibAuditService,
  ) {}

  /**
   * Tüm tenant'lardaki PROCESSING zarfları sorgular.
   * Cron job veya RabbitMQ consumer tarafından tetiklenir.
   */
  async pollAllTenants(): Promise<void> {
    this.logger.log('GİB polling başlıyor — tüm tenant\'lar...');

    const tenantIds = await this.routingService.findAllActiveIds();

    await Promise.all(
      tenantIds.map((tenantId) =>
        this.pollTenant(tenantId).catch((err) =>
          this.logger.error(`Tenant polling hatası: tenant=${tenantId} hata=${err}`),
        ),
      ),
    );

    this.logger.log(`GİB polling tamamlandı (${tenantIds.length} tenant)`);
  }

  /**
   * Tek tenant için PROCESSING zarfları sorgular.
   */
  async pollTenant(tenantId: string): Promise<void> {
    const pendingEnvelopes = await this.envelopeService.findPendingPolls(tenantId);

    if (pendingEnvelopes.length === 0) return;

    this.logger.debug(`Polling: tenant=${tenantId} zarfSayısı=${pendingEnvelopes.length}`);

    for (const envelope of pendingEnvelopes) {
      await this.pollEnvelope(envelope.id, envelope.senderAlias, tenantId);
    }
  }

  // ─── Özel metodlar ────────────────────────────────────────────────────────

  private async pollEnvelope(
    envelopeId: string,
    senderAlias: string,
    tenantId: string,
  ): Promise<void> {
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    // Önce mevcut sayacı kontrol et (artırmadan)
    const checkRows = await dataSource.query<Array<{ poll_attempt_count: number }>>(
      `SELECT poll_attempt_count FROM gib_envelopes
       WHERE id=$1 AND tenant_id=$2 AND status='PROCESSING'
       FOR UPDATE SKIP LOCKED`,
      [envelopeId, tenantId],
    );

    if (!checkRows[0]) return; // Başka bir worker zaten işliyor veya status değişmiş

    const currentCount = checkRows[0].poll_attempt_count ?? 0;

    // Maksimum deneme aşıldıysa FAILED yap
    if (currentCount >= GibPollingService.MAX_POLL_ATTEMPTS) {
      this.logger.warn(
        `Maksimum polling sayısı aşıldı: envelope=${envelopeId} deneme=${currentCount}`,
      );
      await dataSource.query(
        `UPDATE gib_envelopes
         SET status='FAILED', gib_status_message='Maksimum polling süresi aşıldı (10 gün)', updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2`,
        [envelopeId, tenantId],
      );
      return;
    }

    // GİB getApplicationResponse SOAP çağrısı
    let result: { statusCode?: number; statusMessage?: string; rawResponse?: string };
    try {
      result = await this.mtomSoap.getApplicationResponse({
        envelopeUuid: envelopeId,
        senderAlias,
      });
    } catch (err) {
      this.logger.error(`SOAP polling hatası: envelope=${envelopeId} hata=${err}`);
      // Sayacı artır ve next_poll_at ayarla — SOAP başarısız olsa da deneme kayıt altına alınır
      await dataSource.query(
        `UPDATE gib_envelopes
         SET poll_attempt_count = poll_attempt_count + 1,
             last_polled_at = NOW(),
             next_poll_at = NOW() + INTERVAL '5 hours',
             updated_at = NOW()
         WHERE id=$1 AND tenant_id=$2`,
        [envelopeId, tenantId],
      );
      return;
    }

    // SOAP başarılı — sayacı artır
    await dataSource.query(
      `UPDATE gib_envelopes
       SET poll_attempt_count = poll_attempt_count + 1,
           last_polled_at = NOW(),
           next_poll_at = NOW() + INTERVAL '5 hours',
           updated_at = NOW()
       WHERE id=$1 AND tenant_id=$2`,
      [envelopeId, tenantId],
    );

    this.logger.debug(
      `Polling yanıtı: envelope=${envelopeId} kod=${result.statusCode} mesaj=${result.statusMessage}`,
    );

    if (!result.statusCode || result.statusCode === 0) {
      // GİB'e ulaşılamadı — bir sonraki döngüde tekrar dene
      return;
    }

    // Durum uygula (fatura statüsünü de günceller)
    await this.envelopeService.applyGibStatus(
      envelopeId,
      tenantId,
      result.statusCode,
      result.rawResponse ?? '',
    );

    // Audit
    await this.auditService.log({
      tenantId,
      userId: 'system:polling',
      envelopeId,
      action: GibAuditAction.ENVELOPE_STATUS,
      details: { statusCode: result.statusCode, statusMessage: result.statusMessage },
    }).catch(() => undefined);
  }
}

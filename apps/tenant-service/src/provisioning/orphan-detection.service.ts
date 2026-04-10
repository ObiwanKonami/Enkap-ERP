import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';

/** Provizyon başlangıcından bu kadar geçti ise orphan sayılır (dakika) */
const ORPHAN_THRESHOLD_MINUTES = 30;

export interface OrphanTenant {
  tenantId:    string;
  tenantSlug:  string;
  status:      string;
  stuckSince:  Date;
  minutesStuck: number;
}

/**
 * Orphan Tenant Tespit Servisi.
 *
 * Sorun: Tenant provizyon sırasında hem ana işlem hem de kompansasyon
 * başarısız olursa tenant yarı oluşturulmuş ('provisioning' veya
 * 'deprovisioning') durumda kalır.
 *
 * Bu servis saatte bir çalışarak stuck tenant'ları tespit eder ve loglar.
 * Admin endpoint'i üzerinden manuel müdahale mümkündür.
 *
 * Otomatik kurtarma stratejisi (gelecek faz):
 *  - 'provisioning' → provizyon yeniden dene
 *  - 'deprovisioning' → şema ve kayıtları temizle
 */
@Injectable()
export class OrphanDetectionService {
  private readonly logger = new Logger(OrphanDetectionService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
  ) {}

  /**
   * Her saat başı orphan tenant'ları tespit eder ve loglar.
   * Production'da: Prometheus alert veya PagerDuty webhook tetiklenebilir.
   */
  @Cron('0 * * * *', { timeZone: 'Europe/Istanbul' })
  async detectOrphans(): Promise<void> {
    const orphans = await this.findOrphanedTenants();

    if (orphans.length === 0) {
      this.logger.debug('Orphan tenant tespit edilmedi');
      return;
    }

    this.logger.warn(
      `ORPHAN TENANT TESPİT EDİLDİ: ${orphans.length} adet. ` +
      `Tenant'lar: ${orphans.map((o) => o.tenantId).join(', ')}`,
    );

    for (const orphan of orphans) {
      this.logger.error(
        `ORPHAN: tenant=${orphan.tenantId} slug=${orphan.tenantSlug} ` +
        `durum=${orphan.status} takılma=${orphan.minutesStuck} dakika`,
      );
    }

    // Orphan kaydını denetim tablosuna yaz (idempotent)
    await this.recordOrphans(orphans);
  }

  /**
   * Orphan tenant'ları listeler.
   * Admin endpoint'i ve cron job tarafından kullanılır.
   */
  async findOrphanedTenants(): Promise<OrphanTenant[]> {
    const rows = await this.controlPlane.query<{
      tenant_id:     string;
      tenant_slug:   string;
      status:        string;
      updated_at:    Date;
    }[]>(
      `SELECT
         tenant_id,
         tenant_slug,
         status,
         updated_at
       FROM tenant_routing
       WHERE status IN ('provisioning', 'deprovisioning')
         AND updated_at < NOW() - INTERVAL '${ORPHAN_THRESHOLD_MINUTES} minutes'
       ORDER BY updated_at ASC`,
    );

    const now = new Date();

    return rows.map((row) => ({
      tenantId:    row.tenant_id,
      tenantSlug:  row.tenant_slug,
      status:      row.status,
      stuckSince:  row.updated_at,
      minutesStuck: Math.floor((now.getTime() - new Date(row.updated_at).getTime()) / 60_000),
    }));
  }

  /**
   * Orphan tenant'ı manuel olarak 'failed' durumuna geçirir.
   * Şema temizliği ayrıca yapılmalıdır.
   *
   * @returns Güncellenen satır sayısı (0 = bulunamadı veya zaten aktif)
   */
  async markAsFailed(tenantId: string): Promise<number> {
    const result = await this.controlPlane.query<{ rowcount: number }>(
      `UPDATE tenant_routing
       SET status = 'failed', updated_at = NOW()
       WHERE tenant_id = $1
         AND status IN ('provisioning', 'deprovisioning')`,
      [tenantId],
    );

    const count = (result as unknown as { rowCount: number }).rowCount ?? 0;

    if (count > 0) {
      this.logger.log(`Orphan tenant 'failed' olarak işaretlendi: ${tenantId}`);
    }

    return count;
  }

  /** Orphan tespit geçmişini denetim tablosuna yazar */
  private async recordOrphans(orphans: OrphanTenant[]): Promise<void> {
    for (const orphan of orphans) {
      await this.controlPlane.query(
        `INSERT INTO provisioning_log (id, tenant_id, step, status, error_message)
         VALUES (gen_random_uuid(), $1, 'orphan_detected', 'failed', $2)
         ON CONFLICT DO NOTHING`,
        [
          orphan.tenantId,
          `Tenant ${orphan.minutesStuck} dakikadır '${orphan.status}' durumunda takılı`,
        ],
      ).catch((err: Error) =>
        this.logger.warn(`Orphan log yazılamadı: ${err.message}`),
      );
    }
  }
}

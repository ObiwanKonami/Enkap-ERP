import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PlatformMetricsSnapshot } from '../platform/platform-metrics.entity';
import { TenantUsageMetric }       from './tenant-usage.entity';
import { TenantDataSourceManager } from '@enkap/database';

interface TenantRow {
  tenant_id:   string;
  schema_name: string;
  tier:        string;
  status:      string;
  plan_id:     string | null;
}

interface PlanPriceRow {
  id:           string;
  price_kurus:  string;
}

/**
 * Kullanım verisi toplama servisi.
 *
 * Her gece 01:00 İstanbul saatinde çalışır:
 *  1. Control plane'den tenant listesini çek
 *  2. Her tenant şemasına COUNT sorguları at → tenant_usage_metrics'e yaz
 *  3. Tüm tenant'ları birleştir → platform_metrics_snapshots'a yaz
 *
 * Büyük platformlarda (1000+ tenant) bu işlem paralel çalışır (Promise.allSettled).
 * Her tenant birbirinden bağımsız — bir tanesi başarısız olsa diğerleri etkilenmez.
 */
@Injectable()
export class UsageCollectorService {
  private readonly logger = new Logger(UsageCollectorService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
    @InjectRepository(PlatformMetricsSnapshot, 'control_plane')
    private readonly snapshotRepo: Repository<PlatformMetricsSnapshot>,
    @InjectRepository(TenantUsageMetric, 'control_plane')
    private readonly usageRepo: Repository<TenantUsageMetric>,
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  /**
   * Günlük metrik toplama — her gece 01:00 İstanbul.
   * Manuel tetikleme: POST /admin/collect-metrics
   */
  @Cron('0 1 * * *', { timeZone: 'Europe/Istanbul' })
  async collectAll(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    this.logger.log(`Metrik toplama başladı: ${today}`);

    const tenants = await this.getActiveTenants();
    this.logger.log(`${tenants.length} tenant işlenecek`);

    // Tenant başına paralel metrik toplama
    const results = await Promise.allSettled(
      tenants.map((t) => this.collectForTenant(t, today)),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`${failed} tenant metrik toplama başarısız`);
    }

    // Platform snapshot'ını oluştur
    await this.buildPlatformSnapshot(today);

    this.logger.log(`Metrik toplama tamamlandı: ${today}, başarısız=${failed}`);
  }

  // ── İç metodlar ─────────────────────────────────────────────────────────

  private async getActiveTenants(): Promise<TenantRow[]> {
    return this.controlPlane.query<TenantRow[]>(
      `SELECT
         tr.tenant_id,
         tr.schema_name,
         tr.tier,
         tr.status,
         s.plan_id
       FROM tenant_routing tr
       LEFT JOIN subscriptions s ON s.tenant_id = tr.tenant_id
       WHERE tr.status = 'active'
       ORDER BY tr.created_at`,
    );
  }

  private async collectForTenant(tenant: TenantRow, date: string): Promise<void> {
    try {
      const ds = await this.dsManager.getDataSource(tenant.tenant_id);

      // Paralel COUNT sorguları — her tablo bağımsız
      const [
        userRow, invoiceRow, productRow,
        movementRow, leadRow, employeeRow,
        marketplaceRow,
      ] = await Promise.all([
        ds.query<{ cnt: string }[]>('SELECT COUNT(*) AS cnt FROM users WHERE is_active = true'),
        ds.query<{ cnt: string }[]>('SELECT COUNT(*) AS cnt FROM invoices'),
        ds.query<{ cnt: string }[]>('SELECT COUNT(*) AS cnt FROM products WHERE is_active = true'),
        ds.query<{ cnt: string }[]>(
          "SELECT COUNT(*) AS cnt FROM stock_movements WHERE created_at::date = $1",
          [date],
        ),
        // CRM tabloları yoksa 0 döner (migration V010 gerekli)
        ds.query<{ cnt: string }[]>(
          "SELECT COUNT(*) AS cnt FROM crm_leads WHERE stage NOT IN ('won','lost')",
        ).catch(() => [{ cnt: '0' }]),
        ds.query<{ cnt: string }[]>(
          "SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active'",
        ).catch(() => [{ cnt: '0' }]),
        ds.query<{ cnt: string }[]>(
          'SELECT COUNT(*) AS cnt FROM marketplace_integrations WHERE is_active = true',
        ).catch(() => [{ cnt: '0' }]),
      ]);

      const usedMarketplace = parseInt(marketplaceRow[0]?.cnt ?? '0', 10) > 0;
      const usedHr          = parseInt(employeeRow[0]?.cnt   ?? '0', 10) > 0;
      const usedCrm         = parseInt(leadRow[0]?.cnt       ?? '0', 10) > 0;

      // UPSERT — aynı gün için idempotent
      await this.controlPlane.query(
        `INSERT INTO tenant_usage_metrics
           (tenant_id, metric_date, user_count, invoice_count, product_count,
            stock_movements, lead_count, employee_count,
            used_marketplace, used_ml, used_hr, used_crm)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11)
         ON CONFLICT (tenant_id, metric_date) DO UPDATE SET
           user_count       = EXCLUDED.user_count,
           invoice_count    = EXCLUDED.invoice_count,
           product_count    = EXCLUDED.product_count,
           stock_movements  = EXCLUDED.stock_movements,
           lead_count       = EXCLUDED.lead_count,
           employee_count   = EXCLUDED.employee_count,
           used_marketplace = EXCLUDED.used_marketplace,
           used_hr          = EXCLUDED.used_hr,
           used_crm         = EXCLUDED.used_crm`,
        [
          tenant.tenant_id,
          date,
          parseInt(userRow[0]?.cnt     ?? '0', 10),
          parseInt(invoiceRow[0]?.cnt  ?? '0', 10),
          parseInt(productRow[0]?.cnt  ?? '0', 10),
          parseInt(movementRow[0]?.cnt ?? '0', 10),
          parseInt(leadRow[0]?.cnt     ?? '0', 10),
          parseInt(employeeRow[0]?.cnt ?? '0', 10),
          usedMarketplace,
          usedHr,
          usedCrm,
        ],
      );
    } catch (err) {
      this.logger.error(`Tenant metrik hatası: ${tenant.tenant_id}`, err);
      throw err;
    }
  }

  private async buildPlatformSnapshot(date: string): Promise<void> {
    // Abonelik bazlı tenant sayıları
    const [cohortRows, planRows, newRows, churnRows] = await Promise.all([
      this.controlPlane.query<{ status: string; cnt: string }[]>(
        `SELECT s.status, COUNT(*) AS cnt
         FROM subscriptions s
         GROUP BY s.status`,
      ),
      // Her aktif plan için toplam gelir
      this.controlPlane.query<{ plan_id: string; cnt: string }[]>(
        `SELECT s.plan_id, COUNT(*) AS cnt
         FROM subscriptions s
         WHERE s.status = 'active'
         GROUP BY s.plan_id`,
      ),
      // Bugün yeni kayıt olanlar
      this.controlPlane.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt FROM tenant_routing
         WHERE status = 'active' AND created_at::date = $1`,
        [date],
      ),
      // Bugün iptal edilenler
      this.controlPlane.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt FROM subscriptions
         WHERE status = 'cancelled' AND updated_at::date = $1`,
        [date],
      ),
    ]);

    // Plan fiyatlarını çek → MRR hesapla
    const planPrices = await this.controlPlane.query<PlanPriceRow[]>(
      'SELECT id, price_kurus FROM billing_plans',
    );
    const priceMap = new Map(planPrices.map((p) => [p.id, parseInt(p.price_kurus, 10)]));

    // Cohort sayıları
    const cohort: Record<string, number> = {};
    for (const row of cohortRows) {
      cohort[row.status] = parseInt(row.cnt, 10);
    }

    // Plan dağılımı + MRR
    let mrrKurus      = 0;
    let starterCount  = 0;
    let businessCount = 0;
    let enterpriseCount = 0;

    for (const row of planRows) {
      const cnt   = parseInt(row.cnt, 10);
      const price = priceMap.get(row.plan_id) ?? 0;
      mrrKurus += price * cnt;

      if (row.plan_id === 'starter')    starterCount    = cnt;
      if (row.plan_id === 'business')   businessCount   = cnt;
      if (row.plan_id === 'enterprise') enterpriseCount = cnt;
    }

    const totalTenants = Object.values(cohort).reduce((a, b) => a + b, 0);

    await this.controlPlane.query(
      `INSERT INTO platform_metrics_snapshots
         (snapshot_date, total_tenants, trialing_tenants, active_tenants,
          past_due_tenants, churned_tenants, new_tenants, churned_today,
          mrr_kurus, arr_kurus, starter_count, business_count, enterprise_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (snapshot_date) DO UPDATE SET
         total_tenants     = EXCLUDED.total_tenants,
         trialing_tenants  = EXCLUDED.trialing_tenants,
         active_tenants    = EXCLUDED.active_tenants,
         past_due_tenants  = EXCLUDED.past_due_tenants,
         churned_tenants   = EXCLUDED.churned_tenants,
         new_tenants       = EXCLUDED.new_tenants,
         churned_today     = EXCLUDED.churned_today,
         mrr_kurus         = EXCLUDED.mrr_kurus,
         arr_kurus         = EXCLUDED.arr_kurus,
         starter_count     = EXCLUDED.starter_count,
         business_count    = EXCLUDED.business_count,
         enterprise_count  = EXCLUDED.enterprise_count`,
      [
        date,
        totalTenants,
        cohort['trialing']  ?? 0,
        cohort['active']    ?? 0,
        cohort['past_due']  ?? 0,
        (cohort['cancelled'] ?? 0) + (cohort['expired'] ?? 0),
        parseInt(newRows[0]?.cnt   ?? '0', 10),
        parseInt(churnRows[0]?.cnt ?? '0', 10),
        mrrKurus,
        mrrKurus * 12,
        starterCount,
        businessCount,
        enterpriseCount,
      ],
    );

    this.logger.log(
      `Platform snapshot yazıldı: ${date}, ` +
      `MRR=${(mrrKurus / 100).toFixed(2)} TL, aktif=${cohort['active'] ?? 0}`,
    );
  }
}

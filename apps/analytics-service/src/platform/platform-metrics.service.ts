import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PlatformOverview {
  today: {
    totalTenants:    number;
    trialingTenants: number;
    activeTenants:   number;
    pastDueTenants:  number;
    churnedTenants:  number;
    mrrKurus:        number;
    arrKurus:        number;
    newTenants:      number;
    churnedToday:    number;
    starterCount:    number;
    businessCount:   number;
    enterpriseCount: number;
  };
  trend: {
    date:         string;
    activeTenants: number;
    mrrKurus:     number;
    newTenants:   number;
  }[];
}

export interface FeatureAdoptionRow {
  feature:       string;
  tenantCount:   number;
  adoptionPct:   number;
}

export interface TenantLeaderboard {
  tenantId:      string;
  schemaName:    string;
  tier:          string;
  planId:        string | null;
  invoiceCount:  number;
  userCount:     number;
  metricDate:    string;
}

/**
 * Platform yönetici dashboard metrikleri.
 *
 * Tüm sorgular control_plane veritabanına gider —
 * per-tenant şemalara dokunulmaz (anlık veriler usageCollector'dan).
 */
@Injectable()
export class PlatformMetricsService {
  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
  ) {}

  /**
   * Platform genel bakış.
   * Son 30 günlük MRR trendi + bugünkü sayılar.
   */
  async getOverview(): Promise<PlatformOverview> {
    const [todayRows, trendRows] = await Promise.all([
      this.controlPlane.query<PlatformOverview['today'][]>(
        `SELECT
           total_tenants, trialing_tenants, active_tenants,
           past_due_tenants, churned_tenants, new_tenants, churned_today,
           mrr_kurus, arr_kurus, starter_count, business_count, enterprise_count
         FROM platform_metrics_snapshots
         ORDER BY snapshot_date DESC LIMIT 1`,
      ),
      this.controlPlane.query<{ snapshot_date: string; active_tenants: string; mrr_kurus: string; new_tenants: string }[]>(
        `SELECT snapshot_date, active_tenants, mrr_kurus, new_tenants
         FROM platform_metrics_snapshots
         ORDER BY snapshot_date DESC LIMIT 30`,
      ),
    ]);

    const today = todayRows[0] ?? {
      totalTenants: 0, trialingTenants: 0, activeTenants: 0,
      pastDueTenants: 0, churnedTenants: 0, mrrKurus: 0, arrKurus: 0,
      newTenants: 0, churnedToday: 0, starterCount: 0, businessCount: 0, enterpriseCount: 0,
    };

    return {
      today,
      trend: trendRows.reverse().map((r) => ({
        date:          r.snapshot_date,
        activeTenants: parseInt(String(r.active_tenants), 10),
        mrrKurus:      parseInt(String(r.mrr_kurus), 10),
        newTenants:    parseInt(String(r.new_tenants), 10),
      })),
    };
  }

  /**
   * Özellik benimseme oranları.
   * Son 7 günde hangi özelliği kaç tenant kullandı.
   */
  async getFeatureAdoption(): Promise<FeatureAdoptionRow[]> {
    const rows = await this.controlPlane.query<{
      total_active: string;
      used_marketplace: string;
      used_ml: string;
      used_hr: string;
      used_crm: string;
    }[]>(
      `SELECT
         COUNT(DISTINCT tenant_id)                                    AS total_active,
         COUNT(DISTINCT CASE WHEN used_marketplace THEN tenant_id END) AS used_marketplace,
         COUNT(DISTINCT CASE WHEN used_ml         THEN tenant_id END) AS used_ml,
         COUNT(DISTINCT CASE WHEN used_hr         THEN tenant_id END) AS used_hr,
         COUNT(DISTINCT CASE WHEN used_crm        THEN tenant_id END) AS used_crm
       FROM tenant_usage_metrics
       WHERE metric_date >= CURRENT_DATE - INTERVAL '7 days'`,
    );

    if (!rows.length) return [];

    const r     = rows[0];
    const total = parseInt(r.total_active, 10);
    if (total === 0) return [];

    const pct = (n: string) =>
      parseFloat(((parseInt(n, 10) / total) * 100).toFixed(1));

    return [
      { feature: 'Marketplace',    tenantCount: parseInt(r.used_marketplace, 10), adoptionPct: pct(r.used_marketplace) },
      { feature: 'ML Tahminleme', tenantCount: parseInt(r.used_ml,          10), adoptionPct: pct(r.used_ml)          },
      { feature: 'İK/Bordro',     tenantCount: parseInt(r.used_hr,          10), adoptionPct: pct(r.used_hr)          },
      { feature: 'CRM',           tenantCount: parseInt(r.used_crm,         10), adoptionPct: pct(r.used_crm)         },
    ];
  }

  /**
   * En aktif tenant'lar (fatura + kullanıcı sayısına göre).
   * Platform yöneticisi için TOP-20 listesi.
   */
  async getLeaderboard(limit = 20): Promise<TenantLeaderboard[]> {
    return this.controlPlane.query<TenantLeaderboard[]>(
      `SELECT
         tum.tenant_id,
         tr.schema_name,
         tr.tier,
         s.plan_id,
         tum.invoice_count,
         tum.user_count,
         tum.metric_date::text
       FROM tenant_usage_metrics tum
       JOIN tenant_routing tr ON tr.tenant_id = tum.tenant_id
       LEFT JOIN subscriptions s ON s.tenant_id = tum.tenant_id
       WHERE tum.metric_date = (
         SELECT MAX(metric_date) FROM tenant_usage_metrics
       )
       ORDER BY tum.invoice_count DESC, tum.user_count DESC
       LIMIT $1`,
      [limit],
    );
  }

  /**
   * Tek tenant için kullanım geçmişi (son 90 gün).
   * Müşteri başarı (Customer Success) ekibi için.
   */
  async getTenantHistory(
    tenantId: string,
    days = 90,
  ): Promise<TenantUsageMetric[]> {
    return this.controlPlane.query<TenantUsageMetric[]>(
      `SELECT *
       FROM tenant_usage_metrics
       WHERE tenant_id = $1
         AND metric_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
       ORDER BY metric_date DESC`,
      [tenantId, days],
    );
  }

  /**
   * Cohort analizi: kayıt ayına göre tenant grupları ve 90 günlük retention.
   */
  async getCohortRetention(): Promise<CohortRow[]> {
    return this.controlPlane.query<CohortRow[]>(
      `WITH cohorts AS (
         SELECT
           DATE_TRUNC('month', created_at)::date AS cohort_month,
           tenant_id
         FROM tenant_routing
         WHERE status = 'active'
       ),
       retention AS (
         SELECT
           c.cohort_month,
           COUNT(DISTINCT c.tenant_id)                                          AS cohort_size,
           COUNT(DISTINCT CASE WHEN s.status = 'active'   THEN c.tenant_id END) AS still_active,
           COUNT(DISTINCT CASE WHEN s.status = 'cancelled' THEN c.tenant_id END) AS churned
         FROM cohorts c
         LEFT JOIN subscriptions s ON s.tenant_id = c.tenant_id
         GROUP BY c.cohort_month
       )
       SELECT
         cohort_month::text,
         cohort_size,
         still_active,
         churned,
         ROUND(still_active::numeric / NULLIF(cohort_size, 0) * 100, 1) AS retention_pct
       FROM retention
       ORDER BY cohort_month DESC
       LIMIT 12`,
    );
  }
}

export interface TenantUsageMetric {
  tenantId:       string;
  metricDate:     string;
  userCount:      number;
  invoiceCount:   number;
  productCount:   number;
  stockMovements: number;
  leadCount:      number;
  employeeCount:  number;
}

export interface CohortRow {
  cohort_month:   string;
  cohort_size:    number;
  still_active:   number;
  churned:        number;
  retention_pct:  number;
}

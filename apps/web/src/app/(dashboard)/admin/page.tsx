'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter }  from 'next/navigation';
import {
  Building2, Users, TrendingUp, AlertTriangle,
  RefreshCw, ChevronRight, Zap, Activity, Crown, Sparkles,
} from 'lucide-react';
import { adminApi, type PlatformOverview, type FeatureAdoption, TIER_LABELS } from '@/services/admin';
import { formatCurrency, kurusToTl } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

// ─── KPI Kartı ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 flex items-start gap-3">
        <div className="p-2 rounded bg-muted flex items-center justify-center shrink-0">
          <Icon size={15} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className="text-lg font-bold text-foreground tabular-nums leading-none">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Özellik Benimseme Çubuğu ─────────────────────────────────────────────────

function AdoptionBar({ item }: { item: FeatureAdoption }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-muted-foreground capitalize">{item.feature.replace('_', ' ')}</span>
        <span className="text-xs font-medium tabular-nums text-foreground">
          {item.adoptionPct.toFixed(0)}%
          <span className="text-muted-foreground font-normal ml-1">
            ({item.usedCount}/{item.totalCount})
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700"
          style={{ width: `${item.adoptionPct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();

  const [overview,    setOverview]    = useState<PlatformOverview | null>(null);
  const [adoption,    setAdoption]    = useState<FeatureAdoption[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ tenantId: string; tenantSlug: string; invoiceCount: number }[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    const roles = (session?.user as { roles?: string[] })?.roles ?? [];
    if (!roles.includes('sistem_admin')) {
      router.replace('/');
    }
  }, [session, status, router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ovRes, adRes, lbRes] = await Promise.allSettled([
          adminApi.metrics.overview(),
          adminApi.metrics.featureAdoption(),
          adminApi.metrics.leaderboard(10),
        ]);
        if (ovRes.status === 'fulfilled') setOverview(ovRes.value.data);
        if (adRes.status === 'fulfilled') setAdoption(Array.isArray(adRes.value.data) ? adRes.value.data : []);
        if (lbRes.status === 'fulfilled') setLeaderboard(Array.isArray(lbRes.value.data) ? lbRes.value.data : []);
      } catch {
        setError(t('admin.dataLoadError'));
      } finally {
        setLoading(false);
      }
    }
    if (status === 'authenticated') void load();
  }, [status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const mrr = overview?.mrrKurus ? formatCurrency(kurusToTl(overview.mrrKurus)) : '—';

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('admin.platformAdmin')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('admin.platformMetricsAndTenantManagement')}
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/admin/tenantlar">
            {t('admin.allCompanies')}
            <ChevronRight size={13} />
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle size={14} />
          <AlertDescription>
            {error} — {t('admin.isAnalyticsServiceRunning')}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={t('admin.totalCompanies')}
          value={overview?.totalTenants ?? '—'}
          sub={`${t('admin.thisMonth')} +${overview?.newThisMonth ?? 0} ${t('admin.new')}`}
          icon={Building2}
        />
        <KpiCard
          label={t('admin.activeTenants')}
          value={overview?.activeTenants ?? '—'}
          sub={`${overview?.provisioningCount ?? 0} ${t('admin.preparing')}`}
          icon={Users}
        />
        <KpiCard
          label={t('admin.monthlyRevenue')}
          value={mrr}
          icon={TrendingUp}
        />
        <KpiCard
          label={t('admin.suspended')}
          value={overview?.suspendedCount ?? '—'}
          sub={t('admin.mayRequireReview')}
          icon={AlertTriangle}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Özellik Benimseme */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <Activity size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('admin.featureAdoption')}
            </CardTitle>
            <span className="text-[10px] text-muted-foreground ml-auto">{t('admin.last7Days')}</span>
          </CardHeader>
          <CardContent>
            {adoption.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t('admin.noData')}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {adoption.map((a) => <AdoptionBar key={a.feature} item={a} />)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* En Aktif Firmalar */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <Zap size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('admin.mostActiveCompanies')}
            </CardTitle>
            <span className="text-[10px] text-muted-foreground ml-auto">{t('admin.byInvoiceCount')}</span>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t('admin.noData')}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {leaderboard.map((item, i) => (
                  <Link
                    key={item.tenantId}
                    href={`/admin/tenantlar/${item.tenantId}`}
                    className="flex items-center gap-3 px-2 py-1.5 rounded transition-colors hover:bg-muted/50"
                  >
                    <span className="text-[10px] text-muted-foreground tabular-nums w-4">{i + 1}</span>
                    <span className="text-xs text-foreground flex-1">{item.tenantSlug}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {item.invoiceCount} {t('admin.invoices')}
                    </span>
                    <ChevronRight size={11} className="text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plan Hızlı Erişim */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center gap-2">
          <Crown size={14} className="text-muted-foreground" />
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('admin.quickAccess')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(['starter', 'business', 'enterprise'] as const).map((tier) => (
              <Link
                key={tier}
                href={`/admin/tenantlar?tier=${tier}`}
                className="flex items-center gap-2 px-3 py-2 rounded border border-border transition-colors hover:bg-muted/50"
              >
                {tier === 'starter'    && <Sparkles size={13} className="text-muted-foreground" />}
                {tier === 'business'   && <Zap       size={13} className="text-primary" />}
                {tier === 'enterprise' && <Crown     size={13} className="text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">
                  {TIER_LABELS[tier]} {t('admin.companies')}
                </span>
                <ChevronRight size={11} className="text-muted-foreground ml-auto" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

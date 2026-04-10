import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { serverFetch } from '@/lib/api-client';
import { formatCurrency, kurusToTl } from '@/lib/format';
import {
  BarChart3, Activity, Trophy, Grid3x3,
  Building2, Users, TrendingUp, TrendingDown, Crown,
} from 'lucide-react';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata = { title: 'Platform Analitik — Enkap' };

// ─── Tipler ─────────────────────────────────────────────────────────────────

interface PlatformOverview {
  totalTenants:      number;
  activeTenants:     number;
  mrr:               number;
  arr:               number;
  churnRate:         number;
  avgSessionsPerDay: number;
}

interface FeatureAdoption {
  feature:      string;
  usageCount:   number;
  tenantCount:  number;
  adoptionRate: number;
}

interface TenantLeaderboard {
  tenantId:   string;
  tenantSlug: string;
  score:      number;
  sessions:   number;
}

interface CohortRetention {
  cohortMonth: string;
  month0:  number;
  month1:  number;
  month2:  number;
  month3:  number;
  month6:  number;
  month12: number;
}

async function fetchAnalyticsData(token: string) {
  const [overview, features, leaderboard, cohort] = await Promise.allSettled([
    serverFetch<PlatformOverview>('analytics', '/admin/overview', token),
    serverFetch<FeatureAdoption[]>('analytics', '/admin/feature-adoption', token),
    serverFetch<TenantLeaderboard[]>('analytics', '/admin/leaderboard', token),
    serverFetch<CohortRetention[]>('analytics', '/admin/cohort-retention', token),
  ]);

  return {
    overview:    overview.status    === 'fulfilled' ? overview.value    : null,
    features:    features.status    === 'fulfilled' ? (features.value    ?? []) : [],
    leaderboard: leaderboard.status === 'fulfilled' ? (leaderboard.value ?? []) : [],
    cohort:      cohort.status      === 'fulfilled' ? (cohort.value      ?? []) : [],
  };
}

// Cohort hücre rengi (retention yüzdesine göre)
function getCohortCellClass(value: number): string {
  if (!value || value === 0) return "text-muted-foreground/30";
  if (value >= 70) return "bg-primary/20 text-primary";
  if (value >= 50) return "bg-primary/10 text-primary/70";
  if (value >= 30) return "bg-muted text-foreground";
  return "bg-destructive/10 text-destructive";
}

function getMonthNames(t: (key: string) => string): string[] {
  return [t('analytics.jan'), t('analytics.feb'), t('analytics.mar'), t('analytics.apr'),
          t('analytics.may'), t('analytics.jun'), t('analytics.jul'), t('analytics.aug'),
          t('analytics.sep'), t('analytics.oct'), t('analytics.nov'), t('analytics.dec')];
}

function formatCohortMonth(raw: string | undefined, monthNames: string[]): string {
  if (!raw) return '—';
  const [year, month] = raw.split('-');
  const idx = parseInt(month ?? '1', 10) - 1;
  return `${monthNames[idx] ?? month} ${year}`;
}

// ─── Sayfa ───────────────────────────────────────────────────────────────────

export default async function AnalitikPage() {
  const t = createTranslator(DEFAULT_LOCALE);
  const monthNames = getMonthNames(t);
  const session = await getServerSession(authOptions);
  const { overview, features, leaderboard, cohort } = await fetchAnalyticsData(
    session?.user.accessToken ?? '',
  );

  // null-safe değerler
  const totalTenants      = overview?.totalTenants      ?? 0;
  const activeTenants     = overview?.activeTenants     ?? 0;
  const mrr               = overview?.mrr               ?? 0;
  const churnRate         = overview?.churnRate         ?? 0;

  const sortedFeatures = [...features]
    .sort((a, b) => (b.adoptionRate ?? 0) - (a.adoptionRate ?? 0))
    .slice(0, 8);

  const topTenants = leaderboard.slice(0, 10);
  const isHighChurn = churnRate > 5;

  return (
    <div className="flex flex-col gap-6">

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
          <BarChart3 size={18} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('analytics.platformAnalytics')}</h1>
        </div>
      </div>

      {/* KPI Kart Şeridi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Building2, label: t('analytics.totalTenants'), value: totalTenants.toLocaleString('tr-TR'), sub: undefined },
          { icon: Users, label: t('analytics.activeTenants'), value: activeTenants.toLocaleString('tr-TR'),
            sub: totalTenants > 0 ? `${((activeTenants / totalTenants) * 100).toFixed(1)}${t('analytics.activeTenantsPercent')}` : undefined },
          { icon: TrendingUp, label: t('analytics.mrr'), value: formatCurrency(kurusToTl(mrr)), sub: undefined },
          { icon: isHighChurn ? TrendingDown : TrendingUp,
            label: t('analytics.churnRate'), value: `${churnRate.toFixed(1)}%`, sub: t('analytics.churnRateSub') },
        ].map(({ icon: Icon, label, value, sub }) => (
          <Card key={label} className="shadow-sm">
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
        ))}
      </div>

      {/* İki sütun */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Özellik Kullanımı */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <Activity size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('analytics.featureUsage')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {sortedFeatures.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Activity size={28} className="text-muted-foreground opacity-30" />
                <p className="text-xs text-muted-foreground">{t('common.noData')}</p>
              </div>
            ) : sortedFeatures.map((f) => (
              <div key={f.feature}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">{f.feature}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {f.tenantCount ?? 0} {t('analytics.featureTenantCount')}
                    </span>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] tabular-nums">
                      {(f.adoptionRate ?? 0).toFixed(1)}%
                    </Badge>
                  </div>
                </div>
                <Progress value={f.adoptionRate ?? 0} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* En Aktif Tenantlar */}
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <Trophy size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('analytics.mostActiveTenants')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-12 text-center">#</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t('analytics.tenant')}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">{t('analytics.sessions')}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">{t('analytics.score')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topTenants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Trophy size={28} className="text-muted-foreground opacity-30" />
                        <p className="text-xs text-muted-foreground">{t('common.noData')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : topTenants.map((tenant, i) => (
                  <TableRow key={tenant.tenantId} className="hover:bg-muted/50">
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        {i === 0 ? <Crown size={14} className="text-muted-foreground" />
                         : i === 1 ? <Crown size={12} className="text-muted-foreground opacity-60" />
                         : <span className="text-xs tabular-nums text-muted-foreground">{i + 1}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-foreground">{tenant.tenantSlug}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {(tenant.sessions ?? 0).toLocaleString('tr-TR')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-xs tabular-nums text-foreground font-medium">
                        {(tenant.score ?? 0).toLocaleString('tr-TR')}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Cohort Retention */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Grid3x3 size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('analytics.cohortRetentionAnalysis')}
            </CardTitle>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {t('analytics.cohortRetentionDesc')}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider py-3 pl-6 min-w-[140px]">{t('analytics.cohort')}</TableHead>
                  {[t('analytics.month0'), t('analytics.month1'), t('analytics.month2'), t('analytics.month3'), t('analytics.month6'), t('analytics.month12')].map(col => (
                    <TableHead key={col} className="text-xs font-semibold uppercase tracking-wider py-3 px-2 text-center">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohort.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Grid3x3 size={28} className="text-muted-foreground opacity-30" />
                        <p className="text-xs text-muted-foreground">{t('analytics.noCohortData')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : cohort.map((row) => (
                  <TableRow key={row.cohortMonth} className="hover:bg-muted/50">
                    <TableCell className="py-3 pl-6">
                      <span className="text-xs text-muted-foreground">
                        {formatCohortMonth(row.cohortMonth, monthNames)}
                      </span>
                    </TableCell>
                    {[row.month0, row.month1, row.month2, row.month3, row.month6, row.month12].map((val, idx) => (
                      <TableCell key={idx} className="p-1 px-2 text-center">
                        <div className={cn(
                          "h-10 w-full flex items-center justify-center rounded-lg text-xs tabular-nums font-medium",
                          getCohortCellClass(val ?? 0)
                        )}>
                          {(val ?? 0) > 0 ? `${val}%` : '—'}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Renk anahtarı */}
          <div className="px-6 py-4 border-t border-border flex flex-wrap items-center gap-3">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('analytics.colorLegend')}</span>
            {[
              { label: '≥ 70%', cls: "bg-primary/20 text-primary border-transparent" },
              { label: '50–70%', cls: "bg-primary/10 text-primary/70 border-transparent" },
              { label: '30–50%', cls: "bg-muted text-foreground border-transparent" },
              { label: '< 30%', cls: "bg-destructive/10 text-destructive border-transparent" },
            ].map(({ label, cls }) => (
              <Badge key={label} variant="outline" className={cn("text-[10px] px-2.5 h-6", cls)}>
                {label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

'use client';

import { useEffect, useState, useMemo } from 'react';
import Link         from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2, Search, RefreshCw, ChevronRight,
  CheckCircle2, Clock, XCircle, Loader,
} from 'lucide-react';
import {
  adminApi, type TenantListItem, type TenantStatus, type TenantTier,
  STATUS_LABELS, TIER_LABELS,
} from '@/services/admin';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const STATUS_ICONS: Record<TenantStatus, React.ReactNode> = {
  active:         <CheckCircle2 size={11} />,
  provisioning:   <Loader       size={11} className="animate-spin" />,
  suspended:      <XCircle      size={11} />,
  deprovisioning: <Clock        size={11} />,
};

function getStatusBadgeProps(status: TenantStatus): {
  variant: 'outline' | 'secondary' | 'default' | 'destructive';
  className?: string;
} {
  const map: Record<TenantStatus, { variant: 'outline' | 'secondary' | 'default' | 'destructive'; className?: string }> = {
    active:         { variant: 'secondary', className: 'bg-primary/10 text-primary border-transparent' },
    provisioning:   { variant: 'secondary' },
    suspended:      { variant: 'destructive' },
    deprovisioning: { variant: 'outline' },
  };
  return map[status] ?? { variant: 'outline' };
}

function getTierBadgeProps(tier: TenantTier): {
  variant: 'outline' | 'secondary' | 'default' | 'destructive';
  className?: string;
} {
  const map: Record<TenantTier, { variant: 'outline' | 'secondary' | 'default' | 'destructive'; className?: string }> = {
    starter:    { variant: 'outline' },
    business:   { variant: 'secondary', className: 'bg-primary/10 text-primary border-transparent' },
    enterprise: { variant: 'default' },
  };
  return map[tier] ?? { variant: 'outline' };
}

export default function AdminTenantsPage() {
  const { data: session, status } = useSession();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const [tenants,      setTenants]      = useState<TenantListItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState<TenantStatus | 'all'>('all');
  const [filterTier,   setFilterTier]   = useState<TenantTier | 'all'>(
    (searchParams.get('tier') as TenantTier) ?? 'all',
  );

  useEffect(() => {
    if (status === 'loading') return;
    const roles = (session?.user as { roles?: string[] })?.roles ?? [];
    if (!roles.includes('sistem_admin')) router.replace('/');
  }, [session, status, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.tenants.list();
      setTenants(res.data.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (status === 'authenticated') void load(); }, [status]);

  const filtered = useMemo(() => {
    return tenants.filter((tenant) => {
      const matchSearch = !search ||
        (tenant.companyName ?? '').toLowerCase().includes(search.toLowerCase()) ||
        tenant.tenantSlug.toLowerCase().includes(search.toLowerCase()) ||
        (tenant.vkn ?? '').includes(search);
      const matchStatus = filterStatus === 'all' || tenant.status === filterStatus;
      const matchTier   = filterTier   === 'all' || tenant.tier   === filterTier;
      return matchSearch && matchStatus && matchTier;
    });
  }, [tenants, search, filterStatus, filterTier]);

  return (
    <div className="flex flex-col gap-4">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('admin.registeredCompanies')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {loading ? '…' : `${tenants.length} ${t('admin.company')}`} · {filtered.length} {t('admin.shown')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          title={t('admin.refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            className="pl-8 h-8 text-xs"
            placeholder={t('admin.companyNameSlugVkn')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select
          value={filterStatus}
          onValueChange={(v) => setFilterStatus(v as TenantStatus | 'all')}
        >
          <SelectTrigger className="h-8 text-xs w-auto min-w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.allStatuses')}</SelectItem>
            {(Object.keys(STATUS_LABELS) as TenantStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterTier}
          onValueChange={(v) => setFilterTier(v as TenantTier | 'all')}
        >
          <SelectTrigger className="h-8 text-xs w-auto min-w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.allPlans')}</SelectItem>
            {(Object.keys(TIER_LABELS) as TenantTier[]).map((tier) => (
              <SelectItem key={tier} value={tier}>{TIER_LABELS[tier]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tablo */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Building2 size={28} className="text-muted-foreground opacity-30" />
              <p className="text-xs text-muted-foreground">{t('admin.noCompaniesFound')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t('admin.company')}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden sm:table-cell">{t('admin.slug')}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t('admin.plan')}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t('admin.status')}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">{t('admin.registrationDate')}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tenant) => {
                  const statusProps = getStatusBadgeProps(tenant.status);
                  const tierProps   = getTierBadgeProps(tenant.tier);
                  return (
                    <TableRow key={tenant.tenantId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0 text-[10px] font-semibold text-primary">
                            {(tenant.companyName ?? tenant.tenantSlug)[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{tenant.companyName ?? '—'}</p>
                            {tenant.city && <p className="text-[10px] text-muted-foreground">{tenant.city}</p>}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="hidden sm:table-cell tabular-nums text-sm text-muted-foreground">
                        {tenant.tenantSlug}
                      </TableCell>

                      <TableCell>
                        <Badge variant={tierProps.variant} className={tierProps.className}>
                          {TIER_LABELS[tenant.tier]}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <Badge variant={statusProps.variant} className={`${statusProps.className ?? ''} flex items-center gap-1 w-fit`}>
                          {STATUS_ICONS[tenant.status]}
                          {STATUS_LABELS[tenant.status]}
                        </Badge>
                      </TableCell>

                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {formatDate(tenant.createdAt)}
                      </TableCell>

                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-7" asChild>
                          <Link href={`/admin/tenantlar/${tenant.tenantId}`}>
                            <ChevronRight size={13} />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, ShieldCheck, Users, CheckCircle, XCircle } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Tenant {
  tenantId:       string;
  tenantSlug:     string;
  tier:           string;
  status:         string;
  companyName:    string | null;
  city:           string | null;
  vkn:            string | null;
  onboardingDone: boolean;
  createdAt:      string;
}

function getTierBadgeProps(tier: string): {
  variant: 'outline' | 'secondary' | 'default' | 'destructive';
  className?: string;
} {
  if (tier === 'enterprise') return { variant: 'default' };
  if (tier === 'business') return { variant: 'secondary', className: 'bg-primary/10 text-primary border-transparent' };
  return { variant: 'outline' };
}

export default function PlatformTenantlarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/platform-giris');
    } else if (status === 'authenticated' && !session?.isPlatformAdmin) {
      router.replace('/');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.isPlatformAdmin) return;

    async function load() {
      try {
        const res = await fetch('/api/tenant/admin/tenants', {
          headers: { Authorization: `Bearer ${session!.user.accessToken}` },
        });
        if (!res.ok) throw new Error('Tenant listesi alınamadı.');
        const json = await res.json() as { data: Tenant[]; total: number };
        setTenants(json.data);
        setTotal(json.total);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [status, session]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <ShieldCheck size={24} className="text-muted-foreground animate-pulse opacity-25" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="max-w-lg">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
          <ShieldCheck size={18} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Platform Yönetimi
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tüm tenant firmalar · {total} kayıt
          </p>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardContent className="pt-4 flex items-center gap-3">
            <Building2 size={18} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Toplam Tenant</p>
              <p className="text-xl font-bold text-foreground tabular-nums">{total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle size={18} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Aktif</p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {tenants.filter((t) => t.status === 'active').length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-4 flex items-center gap-3">
            <Users size={18} className="text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Onboarding Tamam</p>
              <p className="text-xl font-bold text-foreground tabular-nums">
                {tenants.filter((t) => t.onboardingDone).length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant tablosu */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {['Firma', 'Slug', 'Plan', 'Durum', 'VKN', 'Şehir', 'Kayıt'].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => {
                  const tierProps = getTierBadgeProps(tenant.tier);
                  return (
                    <TableRow key={tenant.tenantId}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/platform/tenantlar/${tenant.tenantId}`}
                          className="text-foreground hover:text-primary transition-colors"
                        >
                          {tenant.companyName ?? (
                            <span className="text-muted-foreground italic">isimsiz</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded tabular-nums">
                          {tenant.tenantSlug}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tierProps.variant} className={tierProps.className}>
                          {tenant.tier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {tenant.status === 'active' ? (
                          <span className="flex items-center gap-1.5 text-xs text-primary">
                            <CheckCircle size={12} /> Aktif
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs text-destructive">
                            <XCircle size={12} /> {tenant.status}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-muted-foreground">
                        {tenant.vkn ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tenant.city ?? '—'}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-muted-foreground">
                        {formatDate(tenant.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {tenants.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Henüz kayıtlı tenant yok.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

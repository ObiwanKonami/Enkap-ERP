'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Building2, CheckCircle, XCircle,
  Clock, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const t = createTranslator(DEFAULT_LOCALE);

interface ProvisionStep {
  step:      string;
  status:    string;
  createdAt: string;
}

interface TenantDetail {
  tenantId:       string;
  tenantSlug:     string;
  tier:           string;
  status:         string;
  companyName:    string | null;
  city:           string | null;
  vkn:            string | null;
  email:          string | null;
  phone:          string | null;
  address:        string | null;
  invoicePrefix:  string | null;
  onboardingStep: string | null;
  onboardingDone: boolean;
  createdAt:      string;
  provisionLog:   ProvisionStep[];
}

const TIERS    = ['starter', 'business', 'enterprise'] as const;
const STATUSES = ['active', 'suspended'] as const;

export default function TenantDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [tenant, setTenant]   = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [newTier,   setNewTier]   = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [saving,    setSaving]    = useState<'tier' | 'status' | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/platform-giris');
    else if (status === 'authenticated' && !session?.isPlatformAdmin) router.replace('/');
  }, [status, session, router]);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.isPlatformAdmin) return;

    async function load() {
      try {
        const res = await fetch(`/api/tenant/admin/tenants/${id}`, {
          headers: { Authorization: `Bearer ${session!.user.accessToken}` },
        });
        if (!res.ok) throw new Error('Tenant bulunamadı.');
        const data = await res.json() as TenantDetail;
        setTenant(data);
        setNewTier(data.tier);
        setNewStatus(data.status);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [status, session, id]);

  async function changeTier() {
    if (!tenant || newTier === tenant.tier) return;
    setSaving('tier');
    try {
      const res = await fetch(`/api/tenant/admin/tenants/${id}/tier`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session!.user.accessToken}`,
        },
        body: JSON.stringify({ tier: newTier }),
      });
      if (!res.ok) throw new Error('Plan güncellenemedi.');
      setTenant((prev) => prev ? { ...prev, tier: newTier } : prev);
      toast.success('Plan güncellendi.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function changeStatus() {
    if (!tenant || newStatus === tenant.status) return;
    setSaving('status');
    try {
      const res = await fetch(`/api/tenant/admin/tenants/${id}/status`, {
        method:  'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${session!.user.accessToken}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Durum güncellenemedi.');
      setTenant((prev) => prev ? { ...prev, status: newStatus } : prev);
      toast.success('Durum güncellendi.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (loading || status === 'loading') {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground text-sm">
        <Loader2 size={16} className="animate-spin" /> Yükleniyor…
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive text-sm">
        {error ?? 'Tenant bulunamadı.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl">

      {/* Geri + başlık */}
      <div className="flex items-center gap-3">
        <Link href="/platform/tenantlar" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          <Building2 size={18} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {tenant.companyName ?? tenant.tenantSlug}
          </h1>
          <p className="text-xs text-muted-foreground">
            <code className="text-primary">{tenant.tenantSlug}</code>
            {' · '}
            {tenant.tenantId}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">

        {/* Firma bilgileri */}
        <Card className="shadow-sm">
          <CardContent className="p-5 flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Firma Bilgileri
            </p>
            <Row label="VKN"        value={tenant.vkn} />
            <Row label="E-posta"    value={tenant.email} />
            <Row label="Telefon"    value={tenant.phone} />
            <Row label="Şehir"      value={tenant.city} />
            <Row label="Adres"      value={tenant.address} />
            <Row label="Fatura No"  value={tenant.invoicePrefix} />
            <Row label="Onboarding" value={tenant.onboardingDone
              ? 'Tamamlandı'
              : (tenant.onboardingStep ?? 'Devam ediyor')} />
            <Row label="Kayıt"      value={formatDate(tenant.createdAt)} />
          </CardContent>
        </Card>

        {/* Yönetim işlemleri */}
        <div className="flex flex-col gap-4">

          {/* Plan değiştir */}
          <Card className="shadow-sm">
            <CardContent className="p-5 flex flex-col gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Abonelik Planı
              </p>
              <div className="flex gap-2">
                <Select value={newTier} onValueChange={setNewTier}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={changeTier}
                  disabled={newTier === tenant.tier || saving === 'tier'}
                  isLoading={saving === 'tier'}
                  size="sm"
                >
                  Kaydet
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Durum değiştir */}
          <Card className="shadow-sm">
            <CardContent className="p-5 flex flex-col gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Hesap Durumu
              </p>
              <div className="flex gap-2">
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === 'active' ? 'Aktif' : 'Askıya Alındı'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={changeStatus}
                  disabled={newStatus === tenant.status || saving === 'status'}
                  isLoading={saving === 'status'}
                  variant={newStatus === 'suspended' ? 'destructive' : 'default'}
                  size="sm"
                >
                  Kaydet
                </Button>
              </div>
              {/* Mevcut durum göstergesi */}
              <div className="flex items-center gap-1.5 text-xs">
                {tenant.status === 'active'
                  ? <><CheckCircle size={12} className="text-primary" /><span className="text-primary">Aktif</span></>
                  : <><XCircle    size={12} className="text-destructive" /><span className="text-destructive">Askıya Alındı</span></>}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Provizyon logu */}
      {tenant.provisionLog.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-5 flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Provizyon Logu
            </p>
            <div className="flex flex-col gap-2">
              {tenant.provisionLog.map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  {step.status === 'completed'
                    ? <CheckCircle size={13} className="text-primary shrink-0" />
                    : step.status === 'failed'
                      ? <XCircle size={13} className="text-destructive shrink-0" />
                      : <Clock   size={13} className="text-muted-foreground shrink-0" />}
                  <span className="text-foreground font-medium w-48 shrink-0">{step.step}</span>
                  <span className="text-muted-foreground ">
                    {formatDateTime(step.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground ">
        {value ?? <span className="text-muted-foreground/50 italic">—</span>}
      </span>
    </div>
  );
}

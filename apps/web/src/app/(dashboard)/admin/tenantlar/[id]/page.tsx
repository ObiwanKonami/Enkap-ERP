'use client';

import { useEffect, useState, type ElementType } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession }            from 'next-auth/react';
import Link                      from 'next/link';
import {
  ArrowLeft, Building2, Hash, MapPin, Mail, Phone,
  RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Zap, Crown, Sparkles, Shield,
} from 'lucide-react';
import {
  adminApi, type TenantDetail, type TenantTier,
  STATUS_LABELS, TIER_LABELS,
} from '@/services/admin';
import { formatDate, formatDateTime } from '@/lib/format';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

const t = createTranslator(DEFAULT_LOCALE);

// ─── Provizyon Log Adımı ──────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  control_plane_entry: 'Kontrol düzlemi kaydı',
  schema_creation:     'Veritabanı şeması',
  migration:           'Tablo migrasyonları',
  rls_policies:        'Güvenlik politikaları',
  seeding:             'Başlangıç verileri',
  activation:          'Aktivasyon',
};

function ProvisionStep({ step, status, createdAt }: { step: string; status: string; createdAt: string }) {
  const ok = status === 'completed';
  return (
    <div className="flex items-center gap-3">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${ok ? 'bg-primary/20' : 'bg-destructive/20'}`}>
        {ok
          ? <CheckCircle2 size={10} className="text-primary" />
          : <XCircle      size={10} className="text-destructive" />}
      </div>
      <span className="text-xs text-muted-foreground flex-1">{STEP_LABELS[step] ?? step}</span>
      <span className="text-[10px] text-muted-foreground/60 ">{formatDateTime(createdAt)}</span>
    </div>
  );
}

// ─── Bilgi Satırı ─────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border">
      <Icon size={12} className="text-muted-foreground/60 shrink-0" />
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-xs text-foreground">{value}</span>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const { data: session, status } = useSession();

  const [tenant,  setTenant]  = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [confirm, setConfirm] = useState<null | 'suspend' | 'activate' | TenantTier>(null);

  useEffect(() => {
    if (status === 'loading') return;
    const roles = (session?.user as { roles?: string[] })?.roles ?? [];
    if (!roles.includes('sistem_admin')) router.replace('/');
  }, [session, status, router]);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.tenants.get(id);
      setTenant(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (status === 'authenticated') void load(); }, [status, id]);

  async function handleConfirm() {
    if (!confirm || !tenant) return;
    setSaving(true);
    setConfirm(null);
    try {
      if (confirm === 'suspend' || confirm === 'activate') {
        const newStatus = confirm === 'suspend' ? 'suspended' : 'active';
        await adminApi.tenants.setStatus(tenant.tenantId, newStatus);
        setTenant(prev => prev ? { ...prev, status: newStatus } : prev);
        toast.success(`Tenant ${newStatus === 'active' ? 'aktifleştirildi' : 'askıya alındı'}.`);
      } else {
        await adminApi.tenants.setTier(tenant.tenantId, confirm);
        setTenant(prev => prev ? { ...prev, tier: confirm } : prev);
        toast.success(`Plan ${TIER_LABELS[confirm]} olarak güncellendi.`);
      }
    } catch {
      toast.error('İşlem başarısız.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-8 flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Firma bulunamadı.</p>
          <Link href="/admin/tenantlar">
            <Button variant="ghost" size="sm">Geri Dön</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const isDanger = confirm === 'suspend';

  return (
    <div className="flex flex-col gap-4 max-w-3xl">

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Link href="/admin/tenantlar">
          <Button variant="ghost" size="icon" className="size-8">
            <ArrowLeft size={15} />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-foreground">
            {tenant.companyName ?? tenant.tenantSlug}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ">{tenant.tenantSlug}</p>
        </div>
        <Badge variant={tenant.status === 'active' ? 'secondary' : 'outline'}>
          {STATUS_LABELS[tenant.status]}
        </Badge>
        <Badge variant={tenant.tier === 'enterprise' ? 'default' : 'outline'}>
          {TIER_LABELS[tenant.tier]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Firma Bilgileri */}
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={13} className="text-primary" />
              <h2 className="text-xs font-semibold text-foreground">Firma Bilgileri</h2>
            </div>
            <div>
              <InfoRow icon={Building2} label="Ticaret Ünvanı" value={tenant.companyName} />
              <InfoRow icon={Hash}      label="VKN"            value={tenant.vkn} />
              <InfoRow icon={MapPin}    label="Şehir"          value={tenant.city} />
              <InfoRow icon={Mail}      label="E-posta"        value={tenant.email} />
              <InfoRow icon={Phone}     label="Telefon"        value={tenant.phone} />
              <InfoRow icon={Hash}      label="Şema"           value={tenant.schemaName} />
              <InfoRow icon={Hash}      label="Fatura Prefix"  value={tenant.invoicePrefix} />
              <div className="pt-2">
                <span className="text-[10px] text-muted-foreground">
                  Kayıt: {formatDate(tenant.createdAt)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Eylemler */}
        <div className="flex flex-col gap-3">

          {/* Durum Değiştir */}
          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-muted-foreground" />
                <h2 className="text-xs font-semibold text-foreground">Hesap Durumu</h2>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => setConfirm('activate')}
                  disabled={saving || tenant.status === 'active'}
                >
                  <CheckCircle2 size={12} className="text-primary" />
                  Aktifleştir
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirm('suspend')}
                  disabled={saving || tenant.status === 'suspended'}
                >
                  <XCircle size={12} />
                  Askıya Al
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Plan Değiştir */}
          <Card className="shadow-sm">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Crown size={13} className="text-muted-foreground" />
                <h2 className="text-xs font-semibold text-foreground">Plan Değiştir</h2>
              </div>
              <div className="flex flex-col gap-1.5">
                {(['starter', 'business', 'enterprise'] as TenantTier[]).map(tier => {
                  const icons = { starter: Sparkles, business: Zap, enterprise: Crown };
                  const Icon  = icons[tier];
                  const active = tenant.tier === tier;
                  return (
                    <Button
                      key={tier}
                      variant={active ? 'secondary' : 'outline'}
                      size="sm"
                      className="w-full justify-start gap-2"
                      onClick={() => !active && setConfirm(tier)}
                      disabled={saving || active}
                    >
                      <Icon size={12} />
                      {TIER_LABELS[tier]}
                      {active && <span className="ml-auto text-[10px] text-muted-foreground">Mevcut</span>}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Provizyon Logu */}
      {tenant.provisionLog.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Provizyon Logu
            </p>
            <div className="flex flex-col gap-2">
              {tenant.provisionLog.map((l, i) => (
                <ProvisionStep key={i} {...l} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Onay Diyaloğu */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className={`p-2 rounded-lg w-fit mb-2 ${isDanger ? 'bg-destructive/10' : 'bg-muted'}`}>
              <AlertTriangle size={16} className={isDanger ? 'text-destructive' : 'text-muted-foreground'} />
            </div>
            <DialogTitle className="text-base font-semibold">
              {confirm === 'suspend'  ? 'Hesabı Askıya Al'    :
               confirm === 'activate' ? 'Hesabı Aktifleştir'  :
               'Plan Değiştir'}
            </DialogTitle>
            <DialogDescription>
              {confirm === 'suspend'
                ? `"${tenant.companyName ?? tenant.tenantSlug}" hesabını askıya almak istediğinize emin misiniz? Kullanıcılar sisteme giremez.`
                : confirm === 'activate'
                ? `"${tenant.companyName ?? tenant.tenantSlug}" hesabını aktifleştirmek istiyor musunuz?`
                : confirm
                ? `Planı ${TIER_LABELS[confirm as TenantTier]} olarak değiştirmek istiyor musunuz?`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>İptal</Button>
            <Button
              variant={isDanger ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={saving}
              isLoading={saving}
            >
              Onayla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

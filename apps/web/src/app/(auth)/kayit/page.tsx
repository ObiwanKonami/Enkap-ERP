'use client';

import { useState, useEffect } from 'react';
import { PhoneInput } from '@/components/ui/phone-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Building2, Mail, Lock, Eye, EyeOff,
  Phone, MapPin, Hash, ChevronRight, ChevronLeft,
  Check, AlertCircle, Sparkles, Zap, Crown,
  User, ArrowRight,
} from 'lucide-react';

interface CityOption  { id: number; name: string; plateCode: number; }
interface DistrictOption { name: string; }

interface FormData {
  companyName: string;
  vkn: string;
  phone: string;
  cityId: number | null;
  cityName: string;
  district: string;
  adminEmail: string;
  adminPassword: string;
  confirmPass: string;
  planId: 'starter' | 'business' | 'enterprise';
}

const PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    price: '₺2.490',
    period: '/ ay',
    icon: Sparkles,
    features: ['Muhasebe & e-Fatura', 'Stok Yönetimi', 'CRM & İK', '5 Kullanıcı', '10 GB Depolama'],
  },
  {
    id: 'business' as const,
    name: 'Business',
    price: '₺5.990',
    period: '/ ay',
    icon: Zap,
    badge: 'Önerilen',
    features: ['Starter\'ın tamamı', 'AI Satış Tahmini', 'Marketplace Entegrasyon', '25 Kullanıcı', '100 GB Depolama'],
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 'Teklif',
    period: ' alın',
    icon: Crown,
    features: ['Business\'ın tamamı', 'White Label', 'Sınırsız Kullanıcı', 'Öncelikli Destek', 'Özel Entegrasyon'],
  },
] as const;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center rounded-full text-[10px] font-semibold transition-all duration-300 ${
              i < current
                ? 'bg-primary text-white'
                : i === current
                  ? 'bg-primary/20 text-primary border border-primary'
                  : 'bg-muted text-muted-foreground border border-border'
            }`}
            style={{ width: 22, height: 22 }}
          >
            {i < current ? <Check size={10} strokeWidth={3} /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-px flex-1 transition-all duration-300 ${
                i < current ? 'bg-primary' : 'bg-border'
              }`}
              style={{ width: 20 }}
            />
          )}
        </div>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">
        {current + 1} / {total}
      </span>
    </div>
  );
}

function Step1({
  data, onChange, onNext,
}: {
  data: FormData;
  onChange: (k: keyof FormData, v: string | number | null) => void;
  onNext: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [cities, setCities]     = useState<CityOption[]>([]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  useEffect(() => {
    fetch('/api/tenant/reference/cities')
      .then(r => r.json())
      .then((list: CityOption[]) => setCities(list))
      .catch(() => { /* statik listeye düşülür */ });
  }, []);

  useEffect(() => {
    if (!data.cityId) { setDistricts([]); return; }
    setLoadingDistricts(true);
    fetch(`/api/tenant/reference/cities/${data.cityId}/districts`)
      .then(r => r.json())
      .then((list: DistrictOption[]) => setDistricts(list))
      .catch(() => setDistricts([]))
      .finally(() => setLoadingDistricts(false));
  }, [data.cityId]);

  function handleCityChange(idStr: string) {
    const id   = Number(idStr);
    const city = cities.find(c => c.id === id);
    onChange('cityId',   id);
    onChange('cityName', city?.name ?? '');
    onChange('district', '');
  }

  function validate() {
    if (!data.companyName.trim()) { setErr('Şirket adı zorunludur.'); return; }
    if (!data.vkn.trim()) { setErr('VKN / TCKN zorunludur.'); return; }
    if (data.vkn.length !== 10 && data.vkn.length !== 11) {
      setErr('VKN 10, TCKN 11 haneli olmalıdır.'); return;
    }
    setErr(null);
    onNext();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Şirket / Ticaret Unvanı <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            className="pl-8"
            placeholder="Örnek Teknoloji A.Ş."
            value={data.companyName}
            onChange={e => onChange('companyName', e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          VKN (şirket) veya TCKN (şahıs) <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            className="pl-8"
            placeholder="1234567890"
            value={data.vkn}
            onChange={e => onChange('vkn', e.target.value.replace(/\D/g, '').slice(0, 11))}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">VKN: 10 hane (B2B) · TCKN: 11 hane (B2C)</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Telefon</label>
        <PhoneInput
          value={data.phone}
          onChange={v => onChange('phone', v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">İl</label>
          <Select
            value={data.cityId ? String(data.cityId) : ''}
            onValueChange={handleCityChange}
          >
            <SelectTrigger className="w-full">
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-muted-foreground shrink-0" />
                <SelectValue placeholder="Seçin…" />
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {cities.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">İlçe</label>
          <Select
            value={data.district}
            onValueChange={v => onChange('district', v)}
            disabled={!data.cityId || loadingDistricts}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={loadingDistricts ? 'Yükleniyor…' : 'Seçin…'} />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {districts.map(d => (
                <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertCircle size={12} />
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <Button onClick={validate} className="w-full">
        Devam Et
        <ChevronRight size={14} />
      </Button>
    </div>
  );
}

function Step2({
  data, onChange, onNext, onBack,
}: {
  data: FormData;
  onChange: (k: keyof FormData, v: string | number | null) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const [showCp, setShowCp] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pwRules = [
    { label: 'En az 8 karakter', ok: data.adminPassword.length >= 8 },
    { label: 'Büyük harf içeriyor', ok: /[A-Z]/.test(data.adminPassword) },
    { label: 'Rakam içeriyor', ok: /\d/.test(data.adminPassword) },
  ];
  const pwStrength = pwRules.filter(r => r.ok).length;

  function validate() {
    if (!data.adminEmail.trim() || !data.adminEmail.includes('@')) {
      setErr('Geçerli bir e-posta adresi girin.'); return;
    }
    if (pwStrength < 3) {
      setErr('Şifre güvenlik gereksinimlerini karşılamıyor.'); return;
    }
    if (data.adminPassword !== data.confirmPass) {
      setErr('Şifreler eşleşmiyor.'); return;
    }
    setErr(null);
    onNext();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Admin E-posta <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            className="pl-8"
            placeholder="ad@sirketiniz.com"
            value={data.adminEmail}
            onChange={e => onChange('adminEmail', e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Şifre <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={showPw ? 'text' : 'password'}
            className="pl-8 pr-10"
            placeholder="••••••••"
            value={data.adminPassword}
            onChange={e => onChange('adminPassword', e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPw(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {data.adminPassword && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className={`h-0.5 flex-1 rounded-full transition-all duration-300 ${
                    i < pwStrength
                      ? pwStrength === 1 ? 'bg-destructive' : pwStrength === 2 ? 'bg-amber-500' : 'bg-primary'
                      : 'bg-border'
                  }`}
                />
              ))}
            </div>
            <div className="space-y-0.5">
              {pwRules.map(r => (
                <div key={r.label} className={`flex items-center gap-1.5 text-[10px] ${r.ok ? 'text-primary' : 'text-muted-foreground'}`}>
                  <Check size={9} strokeWidth={3} style={{ opacity: r.ok ? 1 : 0.3 }} />
                  {r.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Şifre Tekrar <span className="text-destructive">*</span>
        </label>
        <div className="relative">
          <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type={showCp ? 'text' : 'password'}
            className="pl-8 pr-10"
            placeholder="••••••••"
            value={data.confirmPass}
            onChange={e => onChange('confirmPass', e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowCp(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showCp ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {data.confirmPass && data.adminPassword !== data.confirmPass && (
          <p className="text-[10px] text-destructive mt-1">Şifreler eşleşmiyor</p>
        )}
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertCircle size={12} />
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 mt-2">
        <Button variant="ghost" onClick={onBack} className="px-3">
          <ChevronLeft size={14} />
        </Button>
        <Button onClick={validate} className="flex-1">
          Devam Et
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function Step3({
  data, onChange, onSubmit, onBack, loading,
}: {
  data: FormData;
  onChange: (k: keyof FormData, v: string | number | null) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground -mt-1">
        14 gün ücretsiz deneme · Kredi kartı gerekmez
      </p>

      {PLANS.map(plan => {
        const Icon = plan.icon;
        const active = data.planId === plan.id;
        return (
          <button
            key={plan.id}
            type="button"
            onClick={() => onChange('planId', plan.id)}
            className={`w-full text-left rounded-md p-3 transition-all duration-200 relative ${
              active ? 'bg-primary/10 border-primary/40' : 'bg-muted border-border'
            } border`}
          >
            {'badge' in plan && (
              <span className="absolute top-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                {(plan as typeof plan & { badge: string }).badge}
              </span>
            )}
            <div className="flex items-start gap-2.5">
              <div
                className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                  active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xs font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {plan.name}
                  </span>
                  <span className="text-sm font-bold text-primary tabular-nums">{plan.price}</span>
                  <span className="text-[10px] text-muted-foreground">{plan.period}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
                  {plan.features.map(f => (
                    <span key={f} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Check size={8} strokeWidth={3} className="text-primary" style={{ opacity: 0.7 }} />
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`w-4 h-4 rounded-full border-2 shrink-0 mt-1 flex items-center justify-center ${
                  active ? 'border-primary' : 'border-border'
                }`}
              >
                {active && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </div>
            </div>
          </button>
        );
      })}

      <div className="flex gap-2 pt-1">
        <Button variant="ghost" onClick={onBack} className="px-3">
          <ChevronLeft size={14} />
        </Button>
        <Button onClick={onSubmit} isLoading={loading} className="flex-1">
          {!loading && (
            <>
              Ücretsiz Başla
              <ArrowRight size={14} />
            </>
          )}
          {loading && 'Hesap oluşturuluyor…'}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Kaydolarak{' '}
        <a href="#" className="text-muted-foreground hover:text-primary transition-colors">Kullanım Koşullarını</a>
        {' '}ve{' '}
        <a href="#" className="text-muted-foreground hover:text-primary transition-colors">KVKK Aydınlatma Metnini</a>
        {' '}kabul etmiş olursunuz.
      </p>
    </div>
  );
}

function Step4({ tenantSlug }: { tenantSlug: string }) {
  const router = useRouter();
  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 bg-primary/10 border-2 border-primary/30">
        <Check size={24} className="text-primary" strokeWidth={2.5} />
      </div>

      <h2 className="text-sm font-semibold text-foreground mb-1">
        Hesabınız Oluşturuldu!
      </h2>
      <p className="text-xs text-muted-foreground mb-1">
        14 günlük ücretsiz deneme süreniz başladı.
      </p>
      <p className="text-xs text-muted-foreground mb-5">
        Firma kodunuz:{' '}
        <span className="text-foreground font-medium tabular-nums">{tenantSlug}</span>
      </p>

      <div className="rounded-md p-3 mb-4 text-left space-y-1.5 bg-muted border border-border">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
          Giriş Bilgileri
        </p>
        <div className="flex items-center gap-2 text-xs">
          <Hash size={11} className="text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Firma kodu:</span>
          <span className="text-foreground tabular-nums font-medium ml-auto">{tenantSlug}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Mail size={11} className="text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">E-posta:</span>
          <span className="text-foreground ml-auto">kayıt e-postanız</span>
        </div>
      </div>

      <div className="space-y-2">
        <Button onClick={() => router.replace('/giris')} className="w-full">
          <User size={13} />
          Giriş Yap
        </Button>
        <p className="text-[10px] text-muted-foreground">
          E-posta adresinize doğrulama maili gönderildi.
        </p>
      </div>
    </div>
  );
}

const INIT: FormData = {
  companyName: '',
  vkn: '',
  phone: '',
  cityId: null,
  cityName: '',
  district: '',
  adminEmail: '',
  adminPassword: '',
  confirmPass: '',
  planId: 'starter',
};

export default function KayitPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState('');

  function onChange(key: keyof FormData, value: string | number | null) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch('/api/tenant/onboarding/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName.trim(),
          adminEmail: form.adminEmail.trim().toLowerCase(),
          adminPassword: form.adminPassword,
          planId: form.planId,
          vkn: form.vkn.length === 10 ? form.vkn : undefined,
          tckn: form.vkn.length === 11 ? form.vkn : undefined,
          phone: form.phone || undefined,
          city: form.cityName || undefined,
          district: form.district || undefined,
        }),
      });

      const data = await resp.json() as { tenantSlug?: string; message?: string };

      if (!resp.ok) {
        setError(
          resp.status === 409
            ? 'Bu e-posta adresiyle kayıtlı bir hesap zaten mevcut.'
            : (data.message ?? 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.'),
        );
        return;
      }

      setTenantSlug(data.tenantSlug ?? '');
      setStep(3);
    } catch {
      setError('Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.');
    } finally {
      setLoading(false);
    }
  }

  const titles = [
    'Şirket Bilgileri',
    'Hesap Oluştur',
    'Plan Seç',
  ];

  return (
    <div className="-mx-4 sm:-mx-8 w-[calc(100%+2rem)] sm:w-[480px] sm:mx-auto">
      <Card className="p-6 animate-slide-up">
        {step < 3 && (
          <>
            <StepIndicator current={step} total={3} />
            <h1 className="text-sm font-semibold text-foreground mb-1">
              {titles[step]}
            </h1>
            <p className="text-xs text-muted-foreground mb-5">
              {step === 0 && 'Firma bilgilerinizi girin'}
              {step === 1 && 'Yönetici hesabı oluşturun'}
              {step === 2 && '14 gün ücretsiz deneyin, istediğiniz zaman iptal edin'}
            </p>
          </>
        )}

        {step === 0 && (
          <Step1 data={form} onChange={onChange} onNext={() => setStep(1)} />
        )}
        {step === 1 && (
          <Step2 data={form} onChange={onChange} onNext={() => setStep(2)} onBack={() => setStep(0)} />
        )}
        {step === 2 && (
          <>
            <Step3
              data={form}
              onChange={onChange}
              onSubmit={handleSubmit}
              onBack={() => setStep(1)}
              loading={loading}
            />
            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle size={12} />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </>
        )}
        {step === 3 && <Step4 tenantSlug={tenantSlug} />}

        {step < 3 && (
          <p className="text-center text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
            Zaten hesabınız var mı?{' '}
            <Link href="/giris" className="text-primary hover:text-primary/80 transition-colors">
              Giriş yap
            </Link>
          </p>
        )}
      </Card>
    </div>
  );
}

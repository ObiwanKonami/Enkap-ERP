'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Settings, Save } from 'lucide-react';
import { platformSettingsApi } from '@/services/billing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function PlatformSistemAyarlariPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [trialDays, setTrialDays] = useState<number>(14);
  const [dunning1,  setDunning1]  = useState<number>(3);
  const [dunning2,  setDunning2]  = useState<number>(7);
  const [dunning3,  setDunning3]  = useState<number>(14);

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

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
        const res = await platformSettingsApi.get();
        setTrialDays(res.data.trialDays);
        const [d1, d2, d3] = res.data.dunningDelays;
        if (d1 !== undefined) setDunning1(d1);
        if (d2 !== undefined) setDunning2(d2);
        if (d3 !== undefined) setDunning3(d3);
      } catch {
        showToast('Ayarlar yüklenemedi.', false);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [status, session]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await platformSettingsApi.update({
        trialDays,
        dunningDelays: [dunning1, dunning2, dunning3],
      });
      showToast('Ayarlar kaydedildi.', true);
    } catch {
      showToast('Kayıt başarısız, tekrar deneyin.', false);
    } finally {
      setSaving(false);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Settings size={24} className="text-muted-foreground animate-pulse opacity-25" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
          <Settings size={18} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sistem Ayarları</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Platform genelinde geçerli billing ve deneme süresi ayarları
          </p>
        </div>
      </div>

      {/* Deneme Süresi */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Deneme Süresi
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Yeni kayıt olan tenant&apos;ların ücretsiz deneme süresi
          </p>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
              className="tabular-nums w-28"
            />
            <span className="text-sm text-muted-foreground">gün</span>
          </div>
        </CardContent>
      </Card>

      {/* Dunning Gecikme Günleri */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dunning Gecikme Günleri
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Başarısız ödeme sonrası yeniden tahsilat denemeleri
          </p>
          <div className="flex flex-col gap-3">
            {([
              { label: '1. Deneme', value: dunning1, setter: setDunning1 },
              { label: '2. Deneme', value: dunning2, setter: setDunning2 },
              { label: '3. Deneme', value: dunning3, setter: setDunning3 },
            ] as const).map(({ label, value, setter }) => (
              <div key={label} className="flex items-center gap-3">
                <Label className="text-xs text-muted-foreground w-20 shrink-0">{label}</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  className="tabular-nums w-28"
                />
                <span className="text-sm text-muted-foreground">gün sonra</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Kaydet */}
      <div className="flex flex-col gap-3">
        <Button
          onClick={() => void handleSave()}
          disabled={saving}
          isLoading={saving}
          className="gap-2 w-fit"
        >
          <Save size={13} />
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>

        {toast && (
          <Alert
            variant={toast.ok ? 'default' : 'destructive'}
            className={toast.ok ? 'border-primary/30 bg-primary/10 text-primary' : undefined}
          >
            <AlertDescription>{toast.msg}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}

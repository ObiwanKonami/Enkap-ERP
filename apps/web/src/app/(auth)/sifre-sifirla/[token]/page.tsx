'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import axios from 'axios';

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const checks = [
    { label: 'En az 8 karakter', ok: password.length >= 8 },
    { label: 'Büyük harf', ok: /[A-Z]/.test(password) },
    { label: 'Küçük harf', ok: /[a-z]/.test(password) },
    { label: 'Rakam veya sembol', ok: /[\d\W]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['bg-destructive', 'bg-amber-500', 'bg-amber-500', 'bg-primary', 'bg-primary'];
  const labels = ['', 'Zayıf', 'Orta', 'Orta', 'Güçlü'];

  return (
    <div className="mt-2">
      <div className="flex gap-0.75 mb-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-0.75 flex-1 rounded-sm transition-colors ${
              i < score ? colors[score] : 'bg-border'
            }`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map(c => (
          <span
            key={c.label}
            className={`flex items-center gap-1 text-[10px] ${c.ok ? 'text-primary' : 'text-muted-foreground'}`}
          >
            {c.ok ? <CheckCircle2 size={9} /> : <span className="w-2.25 h-2.25 rounded-full border border-border inline-block" />}
            {c.label}
          </span>
        ))}
        {score > 0 && (
          <span className={`text-[10px] font-semibold ml-auto ${
            score === 1 ? 'text-destructive' : score < 4 ? 'text-amber-500' : 'text-primary'
          }`}>
            {labels[score]}
          </span>
        )}
      </div>
    </div>
  );
}

type Stage = 'form' | 'success' | 'error';

export default function SifreSifirlaTokenPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>('form');
  const [errorMsg, setErrorMsg] = useState('');

  const isStrong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[\d\W]/.test(password);
  const matches = password === confirm;
  const canSubmit = isStrong && matches && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setErrorMsg('');

    try {
      await axios.post('/api/auth-svc/auth/reset-password', {
        token,
        newPassword: password,
      });
      setStage('success');
      setTimeout(() => router.push('/giris'), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg ?? 'Bağlantı geçersiz veya süresi dolmuş. Lütfen yeni bir sıfırlama isteği gönderin.');
      setStage('error');
    } finally {
      setLoading(false);
    }
  }

  if (stage === 'success') {
    return (
      <Card className="p-7">
        <div className="text-center py-3">
          <div className="w-13 h-13 rounded-full mx-auto mb-4 bg-primary/10 border border-primary/25 flex items-center justify-center">
            <CheckCircle2 size={24} className="text-primary" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground mb-2">
            Şifre Güncellendi
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-5">
            Şifreniz başarıyla değiştirildi. Giriş sayfasına yönlendiriliyorsunuz…
          </p>
          <div className="flex justify-center">
            <div className="w-8 h-1 rounded-sm bg-primary/30 overflow-hidden relative">
              <div className="absolute inset-0 bg-primary animate-[progressBar_3s_linear_forwards]" />
            </div>
          </div>
        </div>
        <style>{`@keyframes progressBar { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); } }`}</style>
      </Card>
    );
  }

  if (stage === 'error') {
    return (
      <Card className="p-7">
        <div className="text-center py-3">
          <div className="w-13 h-13 rounded-full mx-auto mb-4 bg-destructive/10 border border-destructive/25 flex items-center justify-center">
            <AlertCircle size={24} className="text-destructive" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground mb-2">
            Bağlantı Geçersiz
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            {errorMsg}
          </p>
          <Button asChild>
            <Link href="/sifre-sifirla" className="min-w-[200px] justify-center">
              Yeni Bağlantı İste
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-7">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
          <KeyRound size={14} className="text-primary" />
        </div>
        <h1 className="text-[15px] font-semibold text-foreground">
          Yeni Şifre Belirle
        </h1>
      </div>
      <p className="text-xs text-muted-foreground mb-6 ml-10">
        Hesabınız için güçlü bir şifre belirleyin.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Yeni Şifre
          </label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              className="pr-10"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Şifre Tekrar
          </label>
          <div className="relative">
            <Input
              type={showCf ? 'text' : 'password'}
              className={`pr-10 ${confirm && !matches ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowCf(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showCf ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {confirm && !matches && (
            <p className="text-[11px] text-destructive mt-1.5">Şifreler eşleşmiyor</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={!canSubmit}
          isLoading={loading}
          className="w-full mt-1"
        >
          {!loading && (
            <>
              <KeyRound size={13} />
              Şifremi Güncelle
            </>
          )}
          {loading && 'Kaydediliyor…'}
        </Button>
      </form>

      <div className="mt-5 pt-4 border-t border-border text-center">
        <Link
          href="/giris"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} />
          Giriş sayfasına dön
        </Link>
      </div>
    </Card>
  );
}

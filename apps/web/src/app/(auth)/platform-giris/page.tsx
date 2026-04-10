'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';

export default function PlatformGirisPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('platform', {
      redirect: false,
      email: form.email,
      password: form.password,
    });

    setLoading(false);

    if (result?.error) {
      setError('E-posta veya şifre hatalı.');
      return;
    }

    router.replace('/platform/tenantlar');
  }

  return (
    <div className="p-7 animate-slide-up">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-7 h-7 rounded flex items-center justify-center bg-muted border border-border">
          <ShieldCheck size={14} className="text-muted-foreground" />
        </div>
        <h1 className="text-base font-semibold text-foreground">
          Platform Yönetimi
        </h1>
      </div>
      <p className="text-xs text-muted-foreground mb-6 ml-9">
        Enkap SaaS yönetici girişi
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">E-posta</label>
          <Input
            type="email"
            placeholder="admin@enkap.com.tr"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
            autoComplete="email"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Şifre</label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              className="pr-10"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle size={13} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" isLoading={loading} className="w-full mt-2">
          {!loading && (
            <span className="flex items-center gap-2">
              <ShieldCheck size={14} />
              Yönetici Girişi
            </span>
          )}
          {loading && 'Giriş yapılıyor…'}
        </Button>
      </form>

      <div className="mt-5 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          Firma hesabınıza mı giriş yapacaksınız?{' '}
          <Link href="/giris" className="text-primary hover:text-primary/80 transition-colors font-medium">
            Kullanıcı Girişi
          </Link>
        </p>
      </div>
    </div>
  );
}

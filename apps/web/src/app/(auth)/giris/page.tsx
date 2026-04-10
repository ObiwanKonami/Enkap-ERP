'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn, AlertCircle, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function GirisPage() {
  const router = useRouter();
  const [form, setForm]       = useState({ tenantSlug: '', email: '', password: '' });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('credentials', {
      redirect:   false,
      email:      form.email,
      password:   form.password,
      tenantSlug: form.tenantSlug,
    });

    setLoading(false);

    if (result?.error) {
      setError('E-posta, şifre veya firma kodu hatalı. Lütfen kontrol edin.');
      return;
    }

    router.replace('/');
  }

  return (
    <div className="animate-slide-up w-full max-w-md mx-auto">
      <Card className="border-border/50 bg-card/40 backdrop-blur-md shadow-2xl">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
            Giriş Yap
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs md:text-sm">
            Hesabınıza erişmek için bilgilerinizi girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Firma Kodu */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tenantSlug" className="text-xs font-semibold">Firma Kodu</Label>
                <span className="text-xs text-muted-foreground">(opsiyonel)</span>
              </div>
              <Input
                id="tenantSlug"
                type="text"
                placeholder="ornek-sirket"
                value={form.tenantSlug}
                onChange={(e) => setForm((f) => ({ ...f, tenantSlug: e.target.value }))}
                autoComplete="organization"
                spellCheck={false}
                className="bg-background/50"
              />
              <p className="text-[11px] text-muted-foreground">
                Birden fazla firmada hesabınız varsa firma kodunu girin.
              </p>
            </div>

            {/* E-posta */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold">E-posta</Label>
              <Input
                id="email"
                type="email"
                placeholder="ad@firma.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                autoComplete="email"
                className="bg-background/50"
              />
            </div>

            {/* Şifre */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold">Şifre</Label>
                <Link
                  href="/sifre-sifirla"
                  className="text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                >
                  Şifremi Unuttum
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                  autoComplete="current-password"
                  className="pr-10 bg-background/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPw ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive" className="py-3 items-center flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <AlertDescription className="text-xs leading-none">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2 font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Giriş yapılıyor…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Giriş Yap
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col border-t border-border/40 pt-6">
          <p className="text-xs text-center text-muted-foreground">
            Hesabınız yok mu?{' '}
            <Link href="/kayit" className="text-primary hover:text-primary/80 font-semibold transition-colors">
              Ücretsiz deneyin
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

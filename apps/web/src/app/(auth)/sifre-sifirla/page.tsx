'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

type Stage = 'form' | 'sent';

export default function SifreSifirlaPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await axios.post('/api/auth-svc/auth/forgot-password', {
        email: email.trim().toLowerCase(),
        tenantSlug: tenantSlug.trim().toLowerCase(),
      });
    } catch {
      // Sessiz hata — bilgi sızdırma önleme
    } finally {
      setLoading(false);
      setStage('sent');
    }
  }

  if (stage === 'sent') {
    return (
      <Card className="p-7">
        <div className="text-center py-3">
          <div className="w-13 h-13 rounded-full mx-auto mb-4 bg-primary/10 border border-primary/25 flex items-center justify-center">
            <CheckCircle2 size={24} className="text-primary" />
          </div>
          <h2 className="text-[15px] font-semibold text-foreground mb-2">
            E-posta Gönderildi
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-1">
            <span className="text-foreground font-medium">{email}</span> adresine
            şifre sıfırlama bağlantısı gönderdik.
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-6">
            E-posta birkaç dakika içinde gelmezse spam klasörünü kontrol edin.
            Bağlantı <strong className="text-muted-foreground">15 dakika</strong> geçerlidir.
          </p>
          <Button asChild>
            <Link href="/giris" className="min-w-[180px] justify-center">
              Giriş Sayfasına Dön
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
          <Mail size={14} className="text-primary" />
        </div>
        <h1 className="text-[15px] font-semibold text-foreground">
          Şifremi Unuttum
        </h1>
      </div>
      <p className="text-xs text-muted-foreground mb-6 ml-10">
        Firma kodunuzu ve e-postanızı girin, size sıfırlama bağlantısı gönderelim.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Firma Kodu
          </label>
          <Input
            type="text"
            placeholder="ornek-sirket"
            value={tenantSlug}
            onChange={e => setTenantSlug(e.target.value)}
            required
            autoComplete="organization"
            spellCheck={false}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            E-posta Adresi
          </label>
          <Input
            type="email"
            placeholder="ad@firma.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <Button
          type="submit"
          isLoading={loading}
          disabled={!tenantSlug.trim() || !email.trim()}
          className="w-full mt-1"
        >
          {!loading && (
            <>
              <Send size={13} />
              Sıfırlama Bağlantısı Gönder
            </>
          )}
          {loading && 'Gönderiliyor…'}
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

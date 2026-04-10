'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useI18n } from '@/hooks/use-i18n';
import { gibSettingsSchema } from '@/lib/validations/gib-settings.schema';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Check, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Tenant GİB Ayarları Sayfası
 *
 * Kullanıcı kendi GİB gönderici/posta kutusu etiketlerini ayarlar.
 * Zod validasyonlu form.
 */
export default function GibSettingsPage() {
  const { t } = useI18n();
  const { data: session } = useSession();

  const [gibGbAlias, setGibGbAlias] = useState('');
  const [gibPkAlias, setGibPkAlias] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');

  // ─── Mevcut Ayarları Yükle ────────────────────────────────────────────────
  useEffect(() => {
    // Placeholder: API'den tenant ayarlarını çek
    // await tenantApi.getGibSettings(tenantId)
    // Şimdilik boş bırak
  }, []);

  // ─── Mutation ──────────────────────────────────────────────────────────────
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      setValidationErrors({});
      setSuccessMessage('');

      // ─── Zod Validasyon ───────────────────────────────────────────────
      const formData = {
        gib_gb_alias: gibGbAlias,
        gib_pk_alias: gibPkAlias,
      };

      const validationResult = gibSettingsSchema.safeParse(formData);
      if (!validationResult.success) {
        const errors: Record<string, string> = {};
        validationResult.error.errors.forEach((err) => {
          const path = err.path.join('.');
          errors[path] = err.message;
        });
        setValidationErrors(errors);
        throw new Error('Validasyon hatası');
      }

      // ─── API'ye Gönder ────────────────────────────────────────────────
      // await tenantApi.updateGibSettings(tenantId, validationResult.data);
      // Şimdilik mock response
      console.log('GİB Ayarları kaydedildi:', validationResult.data);
      return { success: true };
    },
    onSuccess: () => {
      setSuccessMessage('GİB ayarları başarıyla kaydedildi.');
      setTimeout(() => setSuccessMessage(''), 5000);
    },
    onError: () => {
      // Hata zaten validationErrors'de ayarlanmış
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
          <Link href="/ayarlar">
            <ArrowLeft size={15} />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          e-Fatura GİB Ayarları
        </h1>
      </div>

      {/* İçerik */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sol — Form */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Başarı Mesajı */}
          {successMessage && (
            <Alert className="border-emerald-500/20 bg-emerald-50/30">
              <Check size={14} className="text-emerald-600" />
              <AlertDescription className="text-emerald-700">
                {successMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Gönderici Birim Etiketi */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Gönderici Birim Etiketi (GB)
              </CardTitle>
              <CardDescription className="text-xs">
                Fatura gönderenin GİB'deki kimliği. urn:mail: ile başlayan e-posta adresi formatında olmalıdır.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gib-gb" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  GB Etiketi
                </Label>
                <Input
                  id="gib-gb"
                  className={`h-9 bg-muted/40 font-mono text-sm ${
                    validationErrors.gib_gb_alias ? 'border-destructive' : ''
                  }`}
                  placeholder="urn:mail:gb@company.com.tr"
                  value={gibGbAlias}
                  onChange={(e) => setGibGbAlias(e.target.value)}
                />
                {validationErrors.gib_gb_alias && (
                  <div className="flex items-start gap-2 text-destructive text-xs">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>{validationErrors.gib_gb_alias}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Örnek: <code className="bg-muted px-2 py-1 rounded text-xs">urn:mail:gonderici@example.com.tr</code>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Posta Kutusu Etiketi */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Posta Kutusu Etiketi (PK)
              </CardTitle>
              <CardDescription className="text-xs">
                Fatura alıcısının GİB posta kutusu. urn:mail: ile başlayan e-posta adresi formatında olmalıdır.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gib-pk" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  PK Etiketi
                </Label>
                <Input
                  id="gib-pk"
                  className={`h-9 bg-muted/40 font-mono text-sm ${
                    validationErrors.gib_pk_alias ? 'border-destructive' : ''
                  }`}
                  placeholder="urn:mail:pk@company.com.tr"
                  value={gibPkAlias}
                  onChange={(e) => setGibPkAlias(e.target.value)}
                />
                {validationErrors.gib_pk_alias && (
                  <div className="flex items-start gap-2 text-destructive text-xs">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>{validationErrors.gib_pk_alias}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Örnek: <code className="bg-muted px-2 py-1 rounded text-xs">urn:mail:postakulusu@example.com.tr</code>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Kaydet Düğmesi */}
          <Button
            className="h-10 gap-2 shadow-sm"
            onClick={() => mutate()}
            disabled={!gibGbAlias || !gibPkAlias}
            isLoading={isPending}
          >
            <Check size={14} /> Ayarları Kaydet
          </Button>
        </div>

        {/* Sağ — Bilgi Kartları */}
        <div className="flex flex-col gap-4">
          {/* Bilgi 1 */}
          <Card className="shadow-sm bg-blue-50/30 border-blue-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-blue-900">
                ℹ️ GİB Nedir?
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-blue-800">
              <p>
                Gümrük ve Ticaret Bakanlığı (GİB) e-Fatura sistemine fatura göndermek için
                gönderici ve alıcı etiketleri gereklidir.
              </p>
            </CardContent>
          </Card>

          {/* Bilgi 2 */}
          <Card className="shadow-sm bg-amber-50/30 border-amber-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-amber-900">
                ⚠️ Format Kuralı
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-amber-800">
              <p className="mb-2">Her iki etiket de şu formatı izlemelidir:</p>
              <code className="block bg-white/50 px-2 py-1 rounded border border-amber-200 text-xs font-mono">
                urn:mail:eposta@domain.com.tr
              </code>
            </CardContent>
          </Card>

          {/* Bilgi 3 */}
          <Card className="shadow-sm bg-emerald-50/30 border-emerald-500/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-emerald-900">
                ✓ Doğrulama
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-emerald-800">
              <p>
                Sistem otomatik olarak e-posta ve format doğrulaması yapar.
                Hatalı girişler kabul edilmez.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

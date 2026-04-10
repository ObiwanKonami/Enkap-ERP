/**
 * Sektörel GİB Alanlar Formu
 * Seçilen profile göre dinamik olarak gerekli alanları gösterir.
 *
 * Profiller:
 * - SGK: IBAN (26 hane, TR başlı)
 * - ENERJI: Araç Kimliği (Plaka veya Şasi)
 * - IDIS: Sevkiyat Numarası (SE- ile başlayan)
 * - STANDART: Ek alan yok
 */

'use client';

import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { INVOICE_PROFILE_ID } from '@/lib/validations/invoice.schema';

interface SectorialFieldsFormProps {
  profileId: string;
  values: {
    iban?: string;
    vehicleId?: string;
    shipmentNumber?: string;
  };
  onChange: (field: 'iban' | 'vehicleId' | 'shipmentNumber', value: string) => void;
  errors?: {
    iban?: string;
    vehicleId?: string;
    shipmentNumber?: string;
  };
}

export function SectorialFieldsForm({
  profileId,
  values,
  onChange,
  errors,
}: SectorialFieldsFormProps) {
  const { t } = useI18n();

  // ─── SGK Profili ──────────────────────────────────────────────────────────
  if (profileId === INVOICE_PROFILE_ID.SGK) {
    return (
      <Card className="shadow-sm border-amber-500/20 bg-amber-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            🏥 SGK Profili — IBAN Bilgileri
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sgk-iban" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              IBAN (26 Hane)
            </Label>
            <Input
              id="sgk-iban"
              className="font-mono h-9 bg-muted/40"
              placeholder="TR000000000000000000000000"
              value={values.iban ?? ''}
              onChange={(e) => onChange('iban', e.target.value.toUpperCase())}
              maxLength={26}
            />
            {errors?.iban && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle size={14} />
                <AlertDescription className="text-xs ml-2">{errors.iban}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Türkiye'de SGK kayıtlı kuruluşlar için IBAN zorunludur. TR ile başlayıp 26 hanedir.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── ENERJI Profili ───────────────────────────────────────────────────────
  if (profileId === INVOICE_PROFILE_ID.ENERJI) {
    return (
      <Card className="shadow-sm border-emerald-500/20 bg-emerald-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            ⚡ ENERJI Profili — Araç Kimliği
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="energy-vehicle" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Araç Kimliği (Plaka veya Şasi No)
            </Label>
            <Input
              id="energy-vehicle"
              className="h-9 bg-muted/40"
              placeholder="Örn: 34 ABC 0001 veya WBA..."
              value={values.vehicleId ?? ''}
              onChange={(e) => onChange('vehicleId', e.target.value.toUpperCase())}
              maxLength={50}
            />
            {errors?.vehicleId && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle size={14} />
                <AlertDescription className="text-xs ml-2">{errors.vehicleId}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Enerji şirketi faturaları için araç plakası veya şasi numarası gereklidir.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── IDIS Profili ─────────────────────────────────────────────────────────
  if (profileId === INVOICE_PROFILE_ID.IDIS) {
    return (
      <Card className="shadow-sm border-sky-500/20 bg-sky-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            📦 IDIS Profili — Sevkiyat Numarası
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idis-shipment" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sevkiyat Numarası (SE- ile başlayan)
            </Label>
            <Input
              id="idis-shipment"
              className="font-mono h-9 bg-muted/40"
              placeholder="SE-0000001"
              value={values.shipmentNumber ?? ''}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                onChange('shipmentNumber', v.startsWith('SE-') ? v : 'SE-' + v);
              }}
              maxLength={50}
            />
            {errors?.shipmentNumber && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle size={14} />
                <AlertDescription className="text-xs ml-2">{errors.shipmentNumber}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              IDIS (Kimya Sektörü) faturaları için sevkiyat numarası SE- ön eki ile başlamalıdır.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── STANDART Profili (boş) ───────────────────────────────────────────────
  return null;
}

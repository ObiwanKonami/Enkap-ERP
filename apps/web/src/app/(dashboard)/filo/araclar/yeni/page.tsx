'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Truck, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fleetApi, VEHICLE_TYPE_LABELS, type VehicleType } from '@/services/fleet';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DateInput } from '@/components/ui/date-input';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

export default function YeniAracPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState({
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    type: 'KAMYON' as VehicleType,
    capacityKg: '',
    volumeM3: '',
    currentKm: 0,
    vin: '',
    inspectionExpires: '',
    insuranceExpires: '',
    registrationExpires: '',
    trafficInsuranceExpires: '',
    gpsDeviceId: '',
  });

  const f = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => fleetApi.vehicles.create({
      ...form,
      type: form.type as VehicleType,
      capacityKg: form.capacityKg ? Number(form.capacityKg) : undefined,
      volumeM3: form.volumeM3 ? Number(form.volumeM3) : undefined,
      vin: form.vin || undefined,
      inspectionExpires: form.inspectionExpires || undefined,
      insuranceExpires: form.insuranceExpires || undefined,
      registrationExpires: form.registrationExpires || undefined,
      trafficInsuranceExpires: form.trafficInsuranceExpires || undefined,
      gpsDeviceId: form.gpsDeviceId || undefined,
    }),
    onSuccess: () => router.push('/filo/araclar'),
  });

  const canSave = form.plate && form.brand && form.model;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href="/filo/araclar"
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} /> {t('fleet.vehicles')}
        </Link>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Truck size={20} className="text-primary" /> {t('fleet.newVehicle')}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('fleet.basicInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t('fleet.araclar.plate')} required>
                  <Input
                    className="uppercase"
                    placeholder={t('fleet.araclar.platePlaceholder')}
                    value={form.plate}
                    onChange={e => f('plate', e.target.value.toUpperCase())}
                  />
                </Field>
                <Field label={t('fleet.araclar.type')} required>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.type}
                    onChange={e => f('type', e.target.value)}
                  >
                    {(['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'] as const).map(tp => (
                      <option key={tp} value={tp}>{VEHICLE_TYPE_LABELS[tp]}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('fleet.vehicleDetail.year')}>
                  <Input
                    type="number"
                    className="tabular-nums"
                    min={1990}
                    max={2030}
                    value={form.year}
                    onChange={e => f('year', Number(e.target.value))}
                  />
                </Field>
                <Field label={t('fleet.vehicleDetail.brand')} required>
                  <Input
                    placeholder={t('fleet.araclar.brandPlaceholder')}
                    value={form.brand}
                    onChange={e => f('brand', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.vehicleDetail.model')} required>
                  <Input
                    placeholder={t('fleet.araclar.modelPlaceholder')}
                    value={form.model}
                    onChange={e => f('model', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.araclar.currentKm')}>
                  <Input
                    type="number"
                    className="tabular-nums"
                    min={0}
                    value={form.currentKm}
                    onChange={e => f('currentKm', Number(e.target.value))}
                  />
                </Field>
                <Field label={t('fleet.vehicleDetail.capacityKg')}>
                  <Input
                    type="number"
                    className="tabular-nums"
                    min={0}
                    placeholder={t('fleet.araclar.capacityPlaceholder')}
                    value={form.capacityKg}
                    onChange={e => f('capacityKg', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.vehicleDetail.volumeM3')}>
                  <Input
                    type="number"
                    className="tabular-nums"
                    min={0}
                    step={0.1}
                    placeholder={t('fleet.araclar.volumePlaceholder')}
                    value={form.volumeM3}
                    onChange={e => f('volumeM3', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.vehicleDetail.vin')}>
                  <Input
                    className="tabular-nums"
                    placeholder={t('fleet.araclar.vinPlaceholder')}
                    value={form.vin}
                    onChange={e => f('vin', e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('fleet.documentDates')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('fleet.araclar.inspectionExpires')}>
                  <DateInput
                    value={form.inspectionExpires}
                    onChange={e => f('inspectionExpires', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.araclar.insuranceExpires')}>
                  <DateInput
                    value={form.insuranceExpires}
                    onChange={e => f('insuranceExpires', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.araclar.registrationExpires')}>
                  <DateInput
                    value={form.registrationExpires}
                    onChange={e => f('registrationExpires', e.target.value)}
                  />
                </Field>
                <Field label={t('fleet.araclar.trafficInsuranceExpires')}>
                  <DateInput
                    value={form.trafficInsuranceExpires}
                    onChange={e => f('trafficInsuranceExpires', e.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('fleet.gpsTracking')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Field label={t('fleet.araclar.gpsDeviceId')}>
                <Input
                  className="max-w-[300px] tabular-nums"
                  placeholder={t('fleet.araclar.gpsDeviceIdPlaceholder')}
                  value={form.gpsDeviceId}
                  onChange={e => f('gpsDeviceId', e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="sticky top-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('common.summary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {[
                { label: t('fleet.araclar.summary.plate'), value: form.plate || '—' },
                { label: t('fleet.araclar.summary.brand'), value: form.brand ? `${form.brand} ${form.model}` : '—' },
                { label: t('fleet.araclar.summary.type'), value: VEHICLE_TYPE_LABELS[form.type as keyof typeof VEHICLE_TYPE_LABELS] },
                { label: t('fleet.araclar.summary.year'), value: String(form.year) },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="text-foreground font-medium">{row.value}</span>
                </div>
              ))}

              {mutation.error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertDescription>{t('fleet.createVehicleError')}</AlertDescription>
                </Alert>
              )}

              <Button
                className="w-full gap-1.5 mt-4"
                onClick={() => mutation.mutate()}
                disabled={!canSave || mutation.isPending}
                isLoading={mutation.isPending}
              >
                {!mutation.isPending && <Save size={14} />}
                {t('fleet.addVehicle')}
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/filo/araclar">
                  {t('common.cancel')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

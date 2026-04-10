'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Truck, ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { fleetApi, VEHICLE_TYPE_LABELS, type Vehicle } from '@/services/fleet';
import { useI18n } from '@/hooks/use-i18n';
import { DateInput } from '@/components/ui/date-input';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}{required && <span style={{ color: '#F87171' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

type FormState = {
  plate:                   string;
  brand:                   string;
  model:                   string;
  year:                    number;
  type:                    string;
  capacityKg:              string;
  volumeM3:                string;
  currentKm:               number;
  vin:                     string;
  status:                  string;
  inspectionExpires:       string;
  insuranceExpires:        string;
  registrationExpires:     string;
  trafficInsuranceExpires: string;
  gpsDeviceId:             string;
};

function toForm(v: Vehicle): FormState {
  return {
    plate:                   v.plate,
    brand:                   v.brand,
    model:                   v.model,
    year:                    v.year ?? new Date().getFullYear(),
    type:                    v.type,
    capacityKg:              v.capacityKg != null ? String(v.capacityKg) : '',
    volumeM3:                v.volumeM3   != null ? String(v.volumeM3)   : '',
    currentKm:               v.currentKm,
    vin:                     v.vin                     ?? '',
    status:                  v.status,
    inspectionExpires:       v.inspectionExpires       ? v.inspectionExpires.slice(0, 10) : '',
    insuranceExpires:        v.insuranceExpires         ? v.insuranceExpires.slice(0, 10)  : '',
    registrationExpires:     v.registrationExpires      ? v.registrationExpires.slice(0, 10) : '',
    trafficInsuranceExpires: v.trafficInsuranceExpires  ? v.trafficInsuranceExpires.slice(0, 10) : '',
    gpsDeviceId:             v.gpsDeviceId             ?? '',
  };
}

export default function AracDuzenle() {
  const router   = useRouter();
  const { id }   = useParams<{ id: string }>();
  const [form, setForm] = useState<FormState | null>(null);
  const { t } = useI18n();

  const { data: vehicle, isLoading, isError } = useQuery({
    queryKey: ['fleet-vehicle', id],
    queryFn:  () => fleetApi.vehicles.get(id).then(r => r.data),
    enabled:  !!id,
  });

  useEffect(() => {
    if (vehicle) setForm(toForm(vehicle));
  }, [vehicle]);

  const f = (k: keyof FormState, v: unknown) =>
    setForm(p => p ? { ...p, [k]: v } : p);

  const mutation = useMutation({
    mutationFn: () => fleetApi.vehicles.update(id, {
      ...form!,
      capacityKg:              form!.capacityKg              ? Number(form!.capacityKg)  : undefined,
      volumeM3:                form!.volumeM3                ? Number(form!.volumeM3)    : undefined,
      vin:                     form!.vin                     || undefined,
      inspectionExpires:       form!.inspectionExpires       || undefined,
      insuranceExpires:        form!.insuranceExpires        || undefined,
      registrationExpires:     form!.registrationExpires     || undefined,
      trafficInsuranceExpires: form!.trafficInsuranceExpires || undefined,
      gpsDeviceId:             form!.gpsDeviceId             || undefined,
      status:                  form!.status as Vehicle['status'],
      type:                    form!.type   as Vehicle['type'],
    }),
    onSuccess: () => router.push('/filo/araclar'),
  });

  if (isLoading || !form) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)' }}>
        <Loader2 size={24} className="animate-spin"/>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#F87171', fontSize: 13 }}>
        {t('fleet.vehicleLoadError')}
      </div>
    );
  }

  const canSave = form.plate && form.brand && form.model;

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/filo/araclar" style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          background: 'rgba(30,58,95,0.3)', border: '1px solid rgba(30,58,95,0.5)',
          borderRadius: 6, padding: '6px 10px', color: 'var(--text-2)', textDecoration: 'none',
        }}>
          <ArrowLeft size={13}/> {t('fleet.vehicles')}
        </Link>
        <h1 className="text-xl font-bold text-text-1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={20} style={{ color: '#38BDF8' }}/> {t('fleet.editVehicle')}
          <span className="num" style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)', marginLeft: 4 }}>
            {vehicle?.plate}
          </span>
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Temel bilgiler */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
              {t('fleet.basicInfo')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="Plaka" required>
                <input className="input" style={{ width: '100%', textTransform: 'uppercase' }}
                  value={form.plate} onChange={e => f('plate', e.target.value.toUpperCase())}/>
              </Field>
              <Field label="Araç Tipi" required>
                <select className="input" style={{ width: '100%' }} value={form.type} onChange={e => f('type', e.target.value)}>
                  {(['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'] as const).map(t => (
                    <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Durum">
                <select className="input" style={{ width: '100%' }} value={form.status} onChange={e => f('status', e.target.value)}>
                  <option value="AKTIF">Aktif</option>
                  <option value="PASIF">Pasif</option>
                  <option value="BAKIMDA">Bakımda</option>
                </select>
              </Field>
              <Field label="Marka" required>
                <input className="input" style={{ width: '100%' }}
                  value={form.brand} onChange={e => f('brand', e.target.value)}/>
              </Field>
              <Field label="Model" required>
                <input className="input" style={{ width: '100%' }}
                  value={form.model} onChange={e => f('model', e.target.value)}/>
              </Field>
              <Field label="Yıl">
                <input type="number" className="input num" style={{ width: '100%' }} min={1990} max={2030}
                  value={form.year} onChange={e => f('year', Number(e.target.value))}/>
              </Field>
              <Field label="Güncel KM">
                <input type="number" className="input num" style={{ width: '100%' }} min={0}
                  value={form.currentKm} onChange={e => f('currentKm', Number(e.target.value))}/>
              </Field>
              <Field label="Kapasite (kg)">
                <input type="number" className="input num" style={{ width: '100%' }} min={0}
                  value={form.capacityKg} onChange={e => f('capacityKg', e.target.value)}/>
              </Field>
              <Field label="Hacim (m³)">
                <input type="number" className="input num" style={{ width: '100%' }} min={0} step={0.1}
                  value={form.volumeM3} onChange={e => f('volumeM3', e.target.value)}/>
              </Field>
              <Field label="Şase No (VIN)">
                <input className="input num" style={{ width: '100%' }}
                  value={form.vin} onChange={e => f('vin', e.target.value)}/>
              </Field>
            </div>
          </div>

          {/* Belgeler */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
              {t('fleet.documentDates')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Muayene Bitiş">
                <DateInput className="input" style={{ width: '100%' }}
                  value={form.inspectionExpires} onChange={e => f('inspectionExpires', e.target.value)}/>
              </Field>
              <Field label="Kasko Bitiş">
                <DateInput className="input" style={{ width: '100%' }}
                  value={form.insuranceExpires} onChange={e => f('insuranceExpires', e.target.value)}/>
              </Field>
              <Field label="Ruhsat Bitiş">
                <DateInput className="input" style={{ width: '100%' }}
                  value={form.registrationExpires} onChange={e => f('registrationExpires', e.target.value)}/>
              </Field>
              <Field label="Trafik Sigortası Bitiş">
                <DateInput className="input" style={{ width: '100%' }}
                  value={form.trafficInsuranceExpires} onChange={e => f('trafficInsuranceExpires', e.target.value)}/>
              </Field>
            </div>
          </div>

          {/* GPS */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
              {t('fleet.gpsTracking')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="GPS Cihaz ID">
                <input className="input num" style={{ width: '100%' }}
                  value={form.gpsDeviceId} onChange={e => f('gpsDeviceId', e.target.value)}/>
              </Field>
              {vehicle?.lastLat && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Son Konum</div>
                  <div className="num" style={{ fontSize: 12, color: '#34D399' }}>
                    {vehicle.lastLat.toFixed(5)}, {vehicle.lastLng?.toFixed(5)}
                    {vehicle.lastSpeedKmh != null && (
                      <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{vehicle.lastSpeedKmh} km/s</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sağ: özet */}
        <div className="card" style={{ padding: 20, position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
            {t('common.summary')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Plaka',   value: form.plate  || '—' },
              { label: 'Marka',   value: form.brand  ? `${form.brand} ${form.model}` : '—' },
              { label: 'Tip',     value: VEHICLE_TYPE_LABELS[form.type as keyof typeof VEHICLE_TYPE_LABELS] ?? form.type },
              { label: 'Yıl',     value: String(form.year) },
              { label: 'Durum',   value: { AKTIF: 'Aktif', PASIF: 'Pasif', BAKIMDA: 'Bakımda' }[form.status] ?? form.status },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{row.label}</span>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>

          {mutation.error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 12, color: '#F87171' }}>
              {t('fleet.saveVehicleError')}
            </div>
          )}

          <button className="btn-primary h-9 px-4 text-sm"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
            <Save size={14}/>
            {mutation.isPending ? t('common.saving') : t('fleet.saveChanges')}
          </button>
          <Link href="/filo/araclar" className="btn-ghost h-9 px-4 text-sm"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, textDecoration: 'none' }}>
            {t('common.cancel')}
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Users, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fleetApi, type LicenseClass } from '@/services/fleet';
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

export default function YeniSurucuPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [form, setForm] = useState({
    firstName:      '',
    lastName:       '',
    phone:          '',
    licenseClass:   'CE',
    licenseNumber:  '',
    licenseExpires: '',
  });
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => fleetApi.drivers.create({
      ...form,
      licenseClass: form.licenseClass as LicenseClass,
      phone:          form.phone          || undefined,
      licenseNumber:  form.licenseNumber  || undefined,
      licenseExpires: form.licenseExpires || undefined,
    }),
    onSuccess: () => router.push('/filo/suruculer'),
  });

  const canSave = form.firstName && form.lastName && form.licenseClass;

  return (
    <div className="space-y-5">
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/filo/suruculer" style={{
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          background: 'rgba(30,58,95,0.3)', border: '1px solid rgba(30,58,95,0.5)',
          borderRadius: 6, padding: '6px 10px', color: 'var(--text-2)', textDecoration: 'none',
        }}>
          <ArrowLeft size={13}/> {t('fleet.drivers')}
        </Link>
        <h1 className="text-xl font-bold text-text-1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={20} style={{ color: '#34D399' }}/> {t('fleet.newDriver')}
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
            {t('fleet.personalInfo')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Ad" required>
              <input className="input" style={{ width: '100%' }} placeholder="Ahmet"
                value={form.firstName} onChange={e => f('firstName', e.target.value)}/>
            </Field>
            <Field label="Soyad" required>
              <input className="input" style={{ width: '100%' }} placeholder="Yılmaz"
                value={form.lastName} onChange={e => f('lastName', e.target.value)}/>
            </Field>
            <Field label="Telefon">
              <input className="input" style={{ width: '100%' }} placeholder="+90 532 123 45 67"
                value={form.phone} onChange={e => f('phone', e.target.value)}/>
            </Field>
            <Field label="Ehliyet Sınıfı" required>
              <select className="input" style={{ width: '100%' }} value={form.licenseClass} onChange={e => f('licenseClass', e.target.value)}>
                {(['B', 'C', 'CE', 'D', 'DE'] as const).map(cls => (
                  <option key={cls} value={cls}>Sınıf {cls}</option>
                ))}
              </select>
            </Field>
            <Field label="Ehliyet No">
              <input className="input num" style={{ width: '100%' }} placeholder="123456789"
                value={form.licenseNumber} onChange={e => f('licenseNumber', e.target.value)}/>
            </Field>
            <Field label="Ehliyet Bitiş">
              <DateInput className="input" style={{ width: '100%' }}
                value={form.licenseExpires} onChange={e => f('licenseExpires', e.target.value)}/>
            </Field>
          </div>
        </div>

        {/* Sağ özet */}
        <div className="card" style={{ padding: 20, position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
            {t('common.summary')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Ad Soyad',   value: form.firstName && form.lastName ? `${form.firstName} ${form.lastName}` : '—' },
              { label: 'Telefon',    value: form.phone          || '—' },
              { label: 'Ehliyet',    value: `Sınıf ${form.licenseClass}` },
              { label: 'Ehliyet No', value: form.licenseNumber  || '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{row.label}</span>
                <span style={{ color: 'var(--text-1)', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
          </div>

          {mutation.error && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 12, color: '#F87171' }}>
              {t('fleet.createDriverError')}
            </div>
          )}

          <button className="btn-primary h-9 px-4 text-sm"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending}>
            <Save size={14}/>
            {mutation.isPending ? t('common.saving') : t('fleet.addDriver')}
          </button>
          <Link href="/filo/suruculer" className="btn-ghost h-9 px-4 text-sm"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 8, textDecoration: 'none' }}>
            {t('common.cancel')}
          </Link>
        </div>
      </div>
    </div>
  );
}

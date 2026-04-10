'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { hrApi } from '@/services/hr';
import { PhoneInput } from '@/components/ui/phone-input';
import Link from 'next/link';
import {
  UserCheck, ArrowLeft, Save, AlertCircle,
  User, Mail, Phone, Building2, Briefcase,
  CalendarDays, DollarSign, Hash, Truck,
} from 'lucide-react';
import type { LicenseClass } from '@/services/hr';
import { useI18n } from '@/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateInput } from '@/components/ui/date-input';

// ─── TCKN Doğrulama ───────────────────────────────────────────────────────────

function validateTckn(v: string): boolean {
  if (v.length !== 11 || !/^\d{11}$/.test(v) || v[0] === '0') return false;
  const d = v.split('').map(Number);
  const sum10 = (d[0]+d[2]+d[4]+d[6]+d[8])*7 - (d[1]+d[3]+d[5]+d[7]);
  if (((sum10 % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

// ─── Departman Listesi ────────────────────────────────────────────────────────

const DEPARTMENTS = [
  'Yönetim', 'Muhasebe & Finans', 'Satış & Pazarlama', 'Bilgi Teknolojileri',
  'İnsan Kaynakları', 'Üretim & Operasyon', 'Lojistik & Depo', 'Hukuk',
  'Ar-Ge', 'Müşteri Hizmetleri', 'Diğer',
];

// ─── Alan Bileşeni ────────────────────────────────────────────────────────────

function Field({ label, icon, required, children, hint, error: fieldError }: {
  label:    string;
  icon:     React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  hint?:    string;
  error?:   string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {fieldError ? (
        <p className="text-[11px] text-destructive">{fieldError}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function YeniCalisanPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [firstName,  setFirstName ] = useState('');
  const [lastName,   setLastName  ] = useState('');
  const [tckn,       setTckn      ] = useState('');
  const [email,      setEmail     ] = useState('');
  const [phone,      setPhone     ] = useState('');

  const [sicilNo, setSicilNo] = useState(() => {
    const d = new Date();
    const rand = String(Math.floor(100 + Math.random() * 900));
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${rand}`;
  });

  const [department,     setDepartment    ] = useState('');
  const [title,          setTitle         ] = useState('');
  const [startDate,      setStartDate     ] = useState(() => new Date().toISOString().slice(0, 10));
  const [salaryTl,       setSalaryTl      ] = useState('');
  const [licenseClass,   setLicenseClass  ] = useState<LicenseClass | ''>('');
  const [licenseNumber,  setLicenseNumber ] = useState('');
  const [licenseExpires, setLicenseExpires] = useState('');
  const [error,          setError         ] = useState('');

  const tcknValid = tckn === '' || validateTckn(tckn);
  const tcknError = tckn.length === 11 && !tcknValid ? 'Geçersiz TCKN.' : undefined;
  const tcknOk    = tckn.length === 11 && tcknValid;

  const canSubmit =
    sicilNo.trim().length >= 3 &&
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    (tckn === '' || tcknValid);

  const { mutate, isPending } = useMutation({
    mutationFn: () => hrApi.employees.create({
      sicilNo:         sicilNo.trim(),
      firstName:       firstName.trim(),
      lastName:        lastName.trim(),
      tckn:            tckn || undefined,
      email:           email  || undefined,
      phone:           phone  || undefined,
      department:      department || undefined,
      title:           title  || undefined,
      startDate,
      status:          'ACTIVE',
      baseSalaryKurus: salaryTl ? Math.round(parseFloat(salaryTl) * 100) : 0,
      licenseClass:    licenseClass   || undefined,
      licenseNumber:   licenseNumber  || undefined,
      licenseExpires:  licenseExpires || undefined,
    }),
    onSuccess: (res) => {
      router.push(`/calisanlar/${res.data.id}`);
    },
    onError: () => setError(t('common.error')),
  });

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">

      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
          <Link href="/calisanlar">
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
            <UserCheck size={15} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('hr.newEmployee')}</h1>
            <p className="text-xs text-muted-foreground">{t('hr.newEmployeeHint')}</p>
          </div>
        </div>
      </div>

      {/* Kişisel Bilgiler */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <User size={14} className="text-muted-foreground" />
            {t('hr.personalInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">

            <div className="col-span-2">
              <Field label={t('hr.employeeNumber')} icon={<Hash size={11} />} required hint={t('hr.employeeNumberHint')}>
                <Input
                  className="tabular-nums"
                  value={sicilNo}
                  onChange={e => setSicilNo(e.target.value)}
                  placeholder="202603001"
                />
                {sicilNo.trim().length < 3 && sicilNo.length > 0 && (
                  <p className="text-[11px] text-destructive mt-0.5">{t('hr.minChars3')}</p>
                )}
              </Field>
            </div>

            <Field label={t('hr.firstName')} icon={<User size={11} />} required>
              <Input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Ahmet"
                autoFocus
              />
              {firstName.length > 0 && firstName.trim().length < 2 && (
                <p className="text-[11px] text-destructive mt-0.5">{t('hr.minChars2')}</p>
              )}
            </Field>

            <Field label={t('hr.lastName')} icon={<User size={11} />} required>
              <Input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Yılmaz"
              />
              {lastName.length > 0 && lastName.trim().length < 2 && (
                <p className="text-[11px] text-destructive mt-0.5">{t('hr.minChars2')}</p>
              )}
            </Field>

            <Field
              label={t('hr.tckn')}
              icon={<Hash size={11} />}
              hint={t('hr.tcknHint')}
              error={tcknError}
            >
              <div className="relative">
                <Input
                  className={[
                    "tabular-nums",
                    tcknError ? "border-destructive/50" : "",
                    tcknOk    ? "border-primary/40 pr-8" : "",
                  ].filter(Boolean).join(" ")}
                  value={tckn}
                  onChange={e => setTckn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="11 hane rakam"
                  maxLength={11}
                />
                {tcknOk && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary">✓</span>
                )}
              </div>
            </Field>

            <Field label={t('hr.email')} icon={<Mail size={11} />} hint={t('hr.emailHint')}>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ahmet.yilmaz@sirket.com"
              />
            </Field>

            <Field label={t('hr.phone')} icon={<Phone size={11} />}>
              <PhoneInput
                value={phone}
                onChange={setPhone}
              />
            </Field>

          </div>
        </CardContent>
      </Card>

      {/* İş Bilgileri */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Briefcase size={14} className="text-muted-foreground" />
            {t('hr.jobInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">

            <Field label={t('hr.department')} icon={<Building2 size={11} />}>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.selectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('hr.position')} icon={<Briefcase size={11} />}>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Örn: Kıdemli Yazılım Mühendisi"
              />
            </Field>

            <Field label={t('hr.startDate')} icon={<CalendarDays size={11} />} required>
              <DateInput
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </Field>

            <Field
              label={t('hr.baseSalary')}
              icon={<DollarSign size={11} />}
              hint={t('hr.minWageHint')}
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">₺</span>
                <Input
                  className="pl-7 tabular-nums"
                  type="number"
                  min={0}
                  step={0.01}
                  value={salaryTl}
                  onChange={e => setSalaryTl(e.target.value)}
                  placeholder="22104.67"
                />
              </div>
              {salaryTl && parseFloat(salaryTl) > 0 && parseFloat(salaryTl) < 22104.67 && (
                <p className="text-[11px] text-destructive mt-0.5">{t('hr.belowMinWage')}</p>
              )}
            </Field>

          </div>
        </CardContent>
      </Card>

      {/* Ehliyet Bilgileri */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Truck size={14} className="text-muted-foreground" />
            {t('hr.licenseInfo')}
            <span className="normal-case font-normal ml-1">— {t('hr.licenseInfoHint')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!licenseClass && (
            <p className="text-xs text-muted-foreground mb-4">{t('hr.licenseClassNote')}</p>
          )}

          <div className="grid grid-cols-3 gap-4">

            <Field label={t('hr.licenseClass')} icon={<Truck size={11} />}>
              <Select
                value={licenseClass || "_none"}
                onValueChange={(v) => setLicenseClass(v === "_none" ? '' : v as LicenseClass)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('common.selectOptional')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t('common.selectOptional')}</SelectItem>
                  <SelectItem value="B">B — {t('hr.licenseClassB')}</SelectItem>
                  <SelectItem value="C">C — {t('hr.licenseClassC')}</SelectItem>
                  <SelectItem value="CE">CE — {t('hr.licenseClassCE')}</SelectItem>
                  <SelectItem value="D">D — {t('hr.licenseClassD')}</SelectItem>
                  <SelectItem value="DE">DE — {t('hr.licenseClassDE')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('hr.licenseNumber')} icon={<Hash size={11} />}>
              <Input
                className="tabular-nums"
                placeholder="AA123456"
                value={licenseNumber}
                onChange={e => setLicenseNumber(e.target.value)}
                disabled={!licenseClass}
              />
            </Field>

            <Field label={t('hr.licenseExpires')} icon={<CalendarDays size={11} />}>
              <DateInput
                value={licenseExpires}
                onChange={e => setLicenseExpires(e.target.value)}
                disabled={!licenseClass}
              />
            </Field>

          </div>

          {licenseClass && (
            <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
              <Truck size={12} />
              {t('hr.licenseAutoAdd')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hata */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle size={14} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Aksiyon Butonları */}
      <div className="flex gap-3 justify-end pb-6">
        <Button variant="outline" asChild>
          <Link href="/calisanlar">{t('common.cancel')}</Link>
        </Button>
        <Button
          onClick={() => mutate()}
          disabled={!canSubmit}
          isLoading={isPending}
        >
          <Save size={14} />
          {t('hr.createEmployee')}
        </Button>
      </div>

    </div>
  );
}

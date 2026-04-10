'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { hrApi } from '@/services/hr';
import { PhoneInput } from '@/components/ui/phone-input';
import Link from 'next/link';
import {
  UserCog, ArrowLeft, Save, AlertCircle,
  User, Mail, Phone, Building2, Briefcase,
  CalendarDays, DollarSign, Hash, ShieldCheck,
} from 'lucide-react';
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DateInput } from '@/components/ui/date-input';

const t = createTranslator(DEFAULT_LOCALE);

function validateTckn(v: string): boolean {
  if (v.length !== 11 || !/^\d{11}$/.test(v) || v[0] === '0') return false;
  const d = v.split('').map(Number);
  const sum10 = (d[0]+d[2]+d[4]+d[6]+d[8])*7 - (d[1]+d[3]+d[5]+d[7]);
  if (((sum10 % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

const DEPARTMENTS = [
  'Yönetim', 'Muhasebe & Finans', 'Satış & Pazarlama', 'Bilgi Teknolojileri',
  'İnsan Kaynakları', 'Üretim & Operasyon', 'Lojistik & Depo', 'Hukuk',
  'Ar-Ge', 'Müşteri Hizmetleri', 'Diğer',
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'hr.active' },
  { value: 'ON_LEAVE', label: 'hr.onLeave' },
  { value: 'TERMINATED', label: 'hr.terminated' },
];

function Field({ label, icon, required, children, hint, error }: {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function CalisanDuzenlePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: employee, isLoading, isError } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => hrApi.employees.get(id).then(r => r.data),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [tckn, setTckn] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [salaryTl, setSalaryTl] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (employee && !initialized) {
      setFirstName(employee.firstName);
      setLastName(employee.lastName);
      setTckn(employee.tckn ?? '');
      setEmail(employee.email ?? '');
      setPhone(employee.phone ?? '');
      setDepartment(employee.department ?? '');
      setTitle(employee.title ?? '');
      setStartDate(employee.startDate);
      setSalaryTl(employee.baseSalaryKurus > 0 ? (employee.baseSalaryKurus / 100).toFixed(2) : '');
      setStatus(employee.status);
      setInitialized(true);
    }
  }, [employee, initialized]);

  const tcknValid = tckn === '' || validateTckn(tckn);
  const tcknError = tckn.length === 11 && !tcknValid ? t('hr.invalidTckn') : undefined;
  const tcknOk = tckn.length === 11 && tcknValid;

  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    (tckn === '' || tcknValid);

  const { mutate, isPending } = useMutation({
    mutationFn: () => hrApi.employees.update(id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      tckn: tckn || undefined,
      email: email || undefined,
      phone: phone || undefined,
      department: department || undefined,
      title: title || undefined,
      startDate,
      status: status as 'ACTIVE' | 'TERMINATED' | 'ON_LEAVE',
      baseSalaryKurus: salaryTl ? Math.round(parseFloat(salaryTl) * 100) : 0,
    }),
    onSuccess: () => {
      router.push(`/calisanlar/${id}`);
    },
    onError: () => setError(t('hr.updateFailed')),
  });

  if (isLoading) {
    return (
      <div className="max-w-[780px] mx-auto px-1">
        <div className="flex flex-col gap-4">
          {[140, 200, 200].map((h, i) => (
            <div key={i} className="bg-muted animate-pulse rounded-lg" style={{ height: h }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-[780px] mx-auto px-1 py-6">
        <Alert variant="destructive">
          <AlertCircle size={14} />
          <AlertDescription className="flex items-center gap-2">
            {t('hr.loadFailed')}
            <Link href={`/calisanlar/${id}`} className="text-destructive underline">{t('common.back')}</Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-[780px] mx-auto px-1">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/calisanlar/${id}`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-muted border border-border flex items-center justify-center">
            <UserCog size={15} className="text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{t('hr.editEmployee')}</h1>
            <p className="text-xs text-muted-foreground">
              {employee ? `${employee.firstName} ${employee.lastName}` : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User size={14} className="text-muted-foreground" />
              {t('hr.personalInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label={t('hr.firstName')} icon={<User size={11}/>} required>
              <Input
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Ahmet"
                autoFocus
              />
              {firstName.length > 0 && firstName.trim().length < 2 && (
                <p className="text-[11px] text-destructive">{t('hr.minChars')}</p>
              )}
            </Field>

            <Field label={t('hr.lastName')} icon={<User size={11}/>} required>
              <Input
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Yılmaz"
              />
              {lastName.length > 0 && lastName.trim().length < 2 && (
                <p className="text-[11px] text-destructive">{t('hr.minChars')}</p>
              )}
            </Field>

            <Field label={t('hr.tckn')} icon={<Hash size={11}/>} hint={t('hr.tcknHint')} error={tcknError}>
              <div className="relative">
                <Input
                  className={tcknError ? "border-destructive" : tcknOk ? "border-primary/50" : ""}
                  value={tckn}
                  onChange={e => setTckn(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="11 hane rakam"
                  maxLength={11}
                />
                {tcknOk && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-primary text-xs">✓</span>
                )}
              </div>
            </Field>

            <Field label={t('hr.email')} icon={<Mail size={11}/>} hint={t('hr.emailHint')}>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="ahmet.yilmaz@sirket.com"
              />
            </Field>

            <Field label={t('hr.phone')} icon={<Phone size={11}/>}>
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Briefcase size={14} className="text-muted-foreground" />
              {t('hr.jobInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label={t('hr.department')} icon={<Building2 size={11}/>}>
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

            <Field label={t('hr.position')} icon={<Briefcase size={11}/>}>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Örn: Kıdemli Yazılım Mühendisi"
              />
            </Field>

            <Field label={t('hr.startDate')} icon={<CalendarDays size={11}/>} required>
              <DateInput
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </Field>

            <Field label={t('hr.baseSalary')} icon={<DollarSign size={11}/>} hint={t('hr.minWageHint')}>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₺</span>
                <Input
                  className="pl-7"
                  type="number"
                  min={0}
                  step={0.01}
                  value={salaryTl}
                  onChange={e => setSalaryTl(e.target.value)}
                  placeholder="22104.67"
                />
              </div>
              {salaryTl && parseFloat(salaryTl) > 0 && parseFloat(salaryTl) < 22104.67 && (
                <p className="text-[11px] text-amber-500">{t('hr.belowMinWage')}</p>
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck size={14} className="text-muted-foreground" />
              {t('hr.employmentStatus')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map(opt => {
                const selected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`px-3 py-2.5 rounded-lg border text-sm transition-all text-center ${
                      selected
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t(opt.label)}
                  </button>
                );
              })}
            </div>
            {status === 'TERMINATED' && (
              <Alert variant="destructive" className="text-xs">
                <AlertDescription>{t('hr.terminatedWarning')}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle size={14} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pb-6">
          <Button variant="outline" asChild>
            <Link href={`/calisanlar/${id}`}>{t('common.cancel')}</Link>
          </Button>
          <Button onClick={() => mutate()} disabled={isPending || !canSubmit} isLoading={isPending}>
            <Save size={14} className="mr-1.5" />
            {t('hr.saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  );
}
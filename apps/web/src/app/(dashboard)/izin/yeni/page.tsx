'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, XCircle, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { hrApi } from '@/services/hr';
import type { LeaveType } from '@/services/hr';
import type { AxiosError } from 'axios';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DateInput } from '@/components/ui/date-input';

const LEAVE_TYPES = (t: ReturnType<typeof useI18n>['t']): { type: LeaveType; label: string }[] => [
  { type: 'annual',         label: t('leave.annual') },
  { type: 'sick',           label: t('leave.sick') },
  { type: 'maternity',      label: t('leave.maternity') },
  { type: 'paternity',      label: t('leave.paternity') },
  { type: 'unpaid',         label: t('leave.unpaid') },
  { type: 'administrative', label: t('leave.administrative') },
];

export default function IzinYeniPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [employeeId,  setEmployeeId]  = useState('');
  const [leaveType,   setLeaveType]   = useState<LeaveType>('annual');
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [reason,      setReason]      = useState('');
  const [toast,       setToast]       = useState<{ text: string; ok: boolean } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const leaveTypes = LEAVE_TYPES(t);

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => hrApi.employees.list({ limit: 200 }).then(r => r.data.data),
    staleTime: 60_000,
  });
  const employees = empData ?? [];
  const selectedEmp = employees.find(e => e.id === employeeId);

  const days = (() => {
    if (!startDate || !endDate) return 0;
    const diff = Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000,
    ) + 1;
    return diff > 0 ? diff : 0;
  })();

  const isValid = !!(employeeId && startDate && endDate && days > 0);

  const mutation = useMutation({
    mutationFn: () =>
      hrApi.leave.create({
        employeeId,
        leaveType,
        startDate,
        endDate,
        notes: reason || undefined,
      }),
    onSuccess: () => {
      setInlineError(null);
      setToast({ text: t('leave.createdSuccess'), ok: true });
      setTimeout(() => router.push('/izin'), 1200);
    },
    onError: (e: unknown) => {
      const axiosErr = e as AxiosError<{ message?: string | string[] }>;
      const raw = axiosErr.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : (raw ?? (e as Error).message ?? t('leave.createFailed'));
      setInlineError(msg);
      setToast({ text: msg, ok: false });
      setTimeout(() => setToast(null), 5000);
    },
  });

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 640 }}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/izin">
            <ArrowLeft size={16}/>
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <CalendarDays size={20} className="text-muted-foreground"/> {t('leave.newRequest')}
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">{t('leave.requestInfo')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">{t('leave.employee')} *</Label>
            {empLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={13} className="animate-spin"/> {t('leave.employeesLoading')}
              </div>
            ) : (
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={employeeId}
                onChange={e => setEmployeeId(e.target.value)}
              >
                <option value="">{t('leave.selectEmployee')}</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName}
                    {e.department ? ` — ${e.department}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">{t('leave.type')} *</Label>
            <div className="grid grid-cols-3 gap-2">
              {leaveTypes.map(({ type, label }) => {
                const active = leaveType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setLeaveType(type)}
                    className={`px-3 py-2 rounded-md text-xs font-medium transition-all text-center ${
                      active
                        ? "bg-primary/10 border border-primary/30 text-primary"
                        : "border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">{t('leave.startDate')} *</Label>
              <DateInput
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">{t('leave.endDate')} *</Label>
              <DateInput
                min={startDate || undefined}
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {days > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 text-sm text-primary">
              <CheckCircle2 size={13}/>
              <span>{days} {t('leave.daysWillRequestSuffix')}</span>
            </div>
          )}

          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              {t('leave.reason')} <span className="text-[10px] text-muted-foreground/50">({t('common.optional')})</span>
            </Label>
            <Textarea
              rows={3}
              placeholder={t('leave.reasonPlaceholder')}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {inlineError && (
        <Alert variant="destructive">
          <XCircle size={14} />
          <AlertDescription>{inlineError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href="/izin">{t('common.cancel')}</Link>
        </Button>
        <Button
          disabled={!isValid || mutation.isPending}
          onClick={() => { setInlineError(null); mutation.mutate(); }}
          isLoading={mutation.isPending}
        >
          <CalendarDays size={13} className="mr-1.5" />
          {t('leave.createRequest')}
        </Button>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm ${
          toast.ok
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {toast.ok ? <CheckCircle2 size={15}/> : <XCircle size={15}/>}
          {toast.text}
          <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => setToast(null)}>
            <X size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}
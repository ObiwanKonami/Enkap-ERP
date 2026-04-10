'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Receipt, Plus, X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { expenseApi, EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/services/expense';
import { hrApi } from '@/services/hr';
import { formatCurrency } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import type { AxiosError } from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DateInput } from '@/components/ui/date-input';

const CATEGORIES: ExpenseCategory[] = [
  'YEMEK', 'ULASIM', 'YAKIT', 'KONAKLAMA', 'TEMSIL', 'KIRTASIYE', 'TEKNIK', 'EGITIM', 'DIGER',
];

const currentPeriod = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

type LineForm = {
  _key: number;
  category: ExpenseCategory;
  description: string;
  expenseDate: string;
  amountTl: string;
  kdvTl: string;
};

const emptyLine = (): LineForm => ({
  _key: Date.now(),
  category: 'YEMEK',
  description: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  amountTl: '',
  kdvTl: '',
});

export default function MasrafYeniPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [employeeId, setEmployeeId] = useState('');
  const [period, setPeriod]         = useState(currentPeriod());
  const [notes, setNotes]           = useState('');
  const [lines, setLines]           = useState<LineForm[]>([emptyLine()]);
  const [toast, setToast]           = useState<{ text: string; ok: boolean } | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => hrApi.employees.list({ limit: 200 }).then(r => r.data.data),
    staleTime: 60_000,
  });
  const employees = empData ?? [];
  const selectedEmp = employees.find(e => e.id === employeeId);

  const addLine    = () => setLines(p => [...p, emptyLine()]);
  const removeLine = (key: number) => setLines(p => p.filter(l => l._key !== key));
  const updateLine = (key: number, field: keyof LineForm, val: string) =>
    setLines(p => p.map(l => l._key === key ? { ...l, [field]: val } : l));

  const totalTl = lines.reduce((s, l) => s + (parseFloat(l.amountTl) || 0), 0);

  const mutation = useMutation({
    mutationFn: () => expenseApi.create({
      employeeId,
      employeeName: selectedEmp ? `${selectedEmp.firstName} ${selectedEmp.lastName}` : employeeId,
      period,
      notes: notes || undefined,
      lines: lines.map(l => ({
        category:    l.category,
        description: l.description,
        expenseDate: l.expenseDate,
        amountKurus: Math.round((parseFloat(l.amountTl) || 0) * 100),
        kdvKurus:    Math.round((parseFloat(l.kdvTl)    || 0) * 100),
      })),
    }),
    onSuccess: () => {
      setInlineError(null);
      setToast({ text: t('expense.createdSuccess'), ok: true });
      setTimeout(() => router.push('/masraf'), 1200);
    },
    onError: (e: unknown) => {
      const axiosErr = e as AxiosError<{ message?: string | string[] }>;
      const raw = axiosErr.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(', ') : (raw ?? (e as Error).message ?? t('expense.createFailed'));
      setInlineError(msg);
      setToast({ text: msg, ok: false });
      setTimeout(() => setToast(null), 5000);
    },
  });

  const isValid = !!(employeeId && period && lines.every(l => l.description.trim() && l.amountTl && parseFloat(l.amountTl) > 0));

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: 720 }}>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/masraf">
            <ArrowLeft size={16}/>
          </Link>
        </Button>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Receipt size={20} className="text-muted-foreground"/> {t('expense.newReport')}
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold">{t('expense.generalInfo')}</CardTitle>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">{t('expense.period')} (YYYY-AA) *</Label>
              <Input
                placeholder="2026-03"
                value={period}
                onChange={e => setPeriod(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">{t('common.notes')}</Label>
              <Input
                placeholder={t('common.optionalExplanation')}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">{t('expense.items')}</CardTitle>
            <Button variant="outline" size="sm" onClick={addLine} className="h-8 gap-1.5">
              <Plus size={13}/> {t('expense.addItem')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {lines.map((line, idx) => (
            <div key={line._key} className="bg-muted/30 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t('expense.item')} {idx + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() => removeLine(line._key)}
                  className={`size-6 ${lines.length === 1 ? 'opacity-30' : 'text-destructive'}`}
                >
                  <X size={13}/>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('expense.category')}</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                    value={line.category}
                    onChange={e => updateLine(line._key, 'category', e.target.value)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('common.date')}</Label>
                  <DateInput
                    value={line.expenseDate}
                    onChange={e => updateLine(line._key, 'expenseDate', e.target.value)}
                  />
                </div>
                <div className="col-span-2 grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('common.description')} *</Label>
                  <Input
                    placeholder={t('expense.descriptionPlaceholder')}
                    value={line.description}
                    onChange={e => updateLine(line._key, 'description', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('expense.amountIncludingTax')} *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={line.amountTl}
                    onChange={e => updateLine(line._key, 'amountTl', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs text-muted-foreground">{t('expense.taxAmount')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={line.kdvTl}
                    onChange={e => updateLine(line._key, 'kdvTl', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}

          {lines.length > 1 && (
            <div className="flex justify-end pt-3 border-t border-border">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">{t('common.total')}:</span>
                <span className="font-bold text-primary tabular-nums">
                  {formatCurrency(totalTl)}
                </span>
              </div>
            </div>
          )}
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
          <Link href="/masraf">{t('common.cancel')}</Link>
        </Button>
        <Button
          disabled={!isValid || mutation.isPending}
          onClick={() => { setInlineError(null); mutation.mutate(); }}
          isLoading={mutation.isPending}
        >
          <Receipt size={13} className="mr-1.5" />
          {t('expense.createReport')}
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
'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/hooks/use-i18n';
import { financialApi } from '@/services/financial';
import type { PaymentPlan, Installment } from '@/services/financial';
import { formatCurrency, formatDate, kurusToTl } from '@/lib/format';
import { DateInput } from '@/components/ui/date-input';
import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, CheckCircle2, Clock,
  Loader2, AlertCircle, Plus, Trash2, CreditCard,
  ReceiptText,
} from 'lucide-react';

// ─── Taksit oluşturucu ────────────────────────────────────────────────────────

interface DraftInstallment {
  dueDate: string;
  amount:  number;   // kuruş
}

function generateInstallments(
  totalKurus:   number,
  count:        number,
  startDate:    string,
  freqMonths:   number,
): DraftInstallment[] {
  const base = Math.floor(totalKurus / count);
  const rem  = totalKurus - base * count;
  const result: DraftInstallment[] = [];

  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i * freqMonths);
    result.push({
      dueDate: d.toISOString().slice(0, 10),
      amount:  i === 0 ? base + rem : base,
    });
  }
  return result;
}

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function fmt(k: number) { return formatCurrency(kurusToTl(k)); }

function progressPercent(installments: Installment[]): number {
  if (!installments.length) return 0;
  const paid = installments.filter(i => i.isPaid).length;
  return Math.round((paid / installments.length) * 100);
}

// ─── Ödeme Planı Oluşturma Formu ──────────────────────────────────────────────

function CreatePlanForm({
  invoiceId,
  remainingKurus,
  onCreated,
}: {
  invoiceId:      string;
  remainingKurus: number;
  onCreated:      () => void;
}) {
  const { t } = useI18n();
  const [count,      setCount    ] = useState(3);
  const [startDate,  setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [freqMonths, setFreqMonths] = useState(1);
  const [drafts,     setDrafts    ] = useState<DraftInstallment[]>(() =>
    generateInstallments(remainingKurus, 3, new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().slice(0, 10), 1)
  );
  const [formError, setFormError] = useState('');

  function rebuild() {
    setDrafts(generateInstallments(remainingKurus, count, startDate, freqMonths));
  }

  function updateDraftAmount(idx: number, val: string) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, amount: Math.round(parseFloat(val || '0') * 100) } : d));
  }

  function updateDraftDate(idx: number, val: string) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, dueDate: val } : d));
  }

  function removeDraft(idx: number) {
    setDrafts(prev => prev.filter((_, i) => i !== idx));
  }

  function addDraft() {
    const last = drafts[drafts.length - 1];
    const d = last ? new Date(last.dueDate) : new Date();
    d.setMonth(d.getMonth() + freqMonths);
    setDrafts(prev => [...prev, { dueDate: d.toISOString().slice(0, 10), amount: 0 }]);
  }

  const totalDraftKurus = drafts.reduce((s, d) => s + d.amount, 0);
  const diff = totalDraftKurus - remainingKurus;

  const { mutate, isPending } = useMutation({
    mutationFn: () => financialApi.arAp.createPaymentPlan({
      invoiceId,
      installments: drafts.map(d => ({ dueDate: d.dueDate, amount: d.amount })),
    }),
    onSuccess: onCreated,
    onError: () => setFormError(t('arAp.paymentPlanCreateError')),
  });

  return (
    <div className="space-y-5">

      {/* Otomatik oluştur */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-text-1 mb-4 flex items-center gap-2">
          <CalendarDays size={14} className="text-sky-400"/>
          {t('arAp.autoInstallmentCreate')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>{t('arAp.installmentCount')}</label>
            <div style={{ position: 'relative' }}>
              <select
                className="input"
                style={{ width: '100%', appearance: 'none', paddingRight: 28 }}
                value={count}
                onChange={e => setCount(Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6, 9, 12].map(n => (
                  <option key={n} value={n}>{n} {t('arAp.installment')}</option>
                ))}
              </select>
              <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#475569' }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>{t('arAp.firstInstallmentDate')}</label>
            <DateInput
              className="input"
              style={{ width: '100%' }}
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 5 }}>{t('arAp.frequency')}</label>
            <div style={{ position: 'relative' }}>
              <select
                className="input"
                style={{ width: '100%', appearance: 'none', paddingRight: 28 }}
                value={freqMonths}
                onChange={e => setFreqMonths(Number(e.target.value))}
              >
                <option value={1}>{t('arAp.monthly')}</option>
                <option value={2}>{t('arAp.biMonthly')}</option>
                <option value={3}>{t('arAp.quarterly')}</option>
              </select>
              <svg style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#475569' }} width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </div>

        <button
          className="btn-ghost h-8 px-4 text-sm"
          onClick={rebuild}
        >
          {t('arAp.recreate')}
        </button>
      </div>

      {/* Taksit listesi düzenle */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-1 flex items-center gap-2">
            <CreditCard size={14} className="text-sky-400"/>
            {t('arAp.installmentPlan')}
          </h2>
          <button
            className="btn-ghost h-7 px-3 text-xs flex items-center gap-1.5"
            onClick={addDraft}
          >
            <Plus size={12}/> {t('arAp.addInstallment')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drafts.map((d, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr 1fr auto',
              alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 7,
              background: 'rgba(30,58,95,0.2)', border: '1px solid rgba(30,58,95,0.4)',
            }}>
              <span className="num text-xs text-text-3 text-center">{i + 1}</span>

              <div>
                <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 3 }}>{t('arAp.date')}</label>
                <DateInput
                  className="input"
                  style={{ width: '100%', fontSize: 12 }}
                  value={d.dueDate}
                  onChange={e => updateDraftDate(i, e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 10, color: '#475569', display: 'block', marginBottom: 3 }}>{t('arAp.amount')} (₺)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#475569', fontSize: 12 }}>₺</span>
                  <input
                    className="input num"
                    style={{ width: '100%', paddingLeft: 22, fontSize: 12 }}
                    type="number"
                    min={0}
                    step={0.01}
                    value={(d.amount / 100).toFixed(2)}
                    onChange={e => updateDraftAmount(i, e.target.value)}
                  />
                </div>
              </div>

              <button
                onClick={() => removeDraft(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 4, display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
              >
                <Trash2 size={14}/>
              </button>
            </div>
          ))}
        </div>

        {/* Kontrol satırı */}
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 7,
          background: diff === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${diff === 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {t('arAp.total')}: {' '}
            <span className="num font-semibold text-text-1">{fmt(totalDraftKurus)}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: '#475569' }}>
              / {t('arAp.remaining')}: <span className="num">{fmt(remainingKurus)}</span>
            </span>
          </div>
          {diff !== 0 && (
            <span style={{ fontSize: 11, color: '#FCA5A5' }}>
              {diff > 0 ? `+${fmt(diff)} ${t('arAp.excess')}` : `${fmt(Math.abs(diff))} ${t('arAp.shortage')}`}
            </span>
          )}
          {diff === 0 && (
            <span style={{ fontSize: 11, color: '#34D399' }}>✓ {t('arAp.amountMatches')}</span>
          )}
        </div>

        {formError && (
          <div style={{
            marginTop: 10, display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#FCA5A5', fontSize: 12,
          }}>
            <AlertCircle size={13}/>{formError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            className="btn-primary"
            onClick={() => mutate()}
            disabled={isPending || drafts.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}
          >
            {isPending
              ? <><Loader2 size={13} className="animate-spin"/> {t('arAp.creating')}</>
              : <><CreditCard size={13}/> {t('arAp.createPaymentPlan')}</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mevcut Planı Göster ──────────────────────────────────────────────────────

function ExistingPlan({ plan }: { plan: PaymentPlan }) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const { mutate: markPaid, isPending, variables } = useMutation({
    mutationFn: (id: string) => financialApi.arAp.markInstallmentPaid(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-plan', plan.invoiceId] }),
  });

  const pct          = progressPercent(plan.installments);
  const paidCount    = plan.installments.filter(i => i.isPaid).length;
  const totalAmount  = plan.installments.reduce((s, i) => s + i.amount, 0);
  const paidAmount   = plan.installments.filter(i => i.isPaid).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-5">

      {/* İlerleme */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-1 flex items-center gap-2">
            <CreditCard size={14} className="text-sky-400"/>
            {t('arAp.paymentProgress')}
          </h2>
          <span className="num text-sm font-bold text-text-1">
            {paidCount} / {plan.installments.length} {t('arAp.installment')}
          </span>
        </div>

        <div className="h-2 rounded-full bg-ink-700 mb-2">
          <div
            className="h-2 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex justify-between text-xs text-text-3">
          <span>{t('arAp.paid')}: <span className="num text-emerald-400 font-semibold">{fmt(paidAmount)}</span></span>
          <span>{t('arAp.remaining')}: <span className="num text-amber-400 font-semibold">{fmt(totalAmount - paidAmount)}</span></span>
        </div>
      </div>

      {/* Taksit listesi */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-text-1 mb-3 flex items-center gap-2">
          <CalendarDays size={14} className="text-sky-400"/>
          {t('arAp.installmentCalendar')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plan.installments.map((inst, i) => {
            const isOverdue = !inst.isPaid && new Date(inst.dueDate) < new Date();
            const loading   = isPending && variables === inst.id;
            return (
              <div key={inst.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: 7,
                background: inst.isPaid
                  ? 'rgba(16,185,129,0.06)'
                  : isOverdue
                    ? 'rgba(239,68,68,0.06)'
                    : 'rgba(30,58,95,0.2)',
                border: `1px solid ${inst.isPaid ? 'rgba(16,185,129,0.25)' : isOverdue ? 'rgba(239,68,68,0.25)' : 'rgba(30,58,95,0.4)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Sıra numarası */}
                  <span className="num" style={{ fontSize: 11, color: '#475569', minWidth: 20, textAlign: 'center' }}>{i + 1}</span>

                  {/* Durum ikonu */}
                  {inst.isPaid
                    ? <CheckCircle2 size={15} style={{ color: '#34D399', flexShrink: 0 }}/>
                    : isOverdue
                      ? <AlertCircle size={15} style={{ color: '#F87171', flexShrink: 0 }}/>
                      : <Clock size={15} style={{ color: '#64748B', flexShrink: 0 }}/>
                  }

                  <div>
                    <p className="num text-sm font-semibold text-text-1">{fmt(inst.amount)}</p>
                    <p className={`num text-xs ${isOverdue ? 'text-rose-400' : 'text-text-3'}`}>
                      {isOverdue ? '⚠ ' : ''}{formatDate(new Date(inst.dueDate))}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {inst.isPaid && inst.paidAt && (
                    <span style={{ fontSize: 11, color: '#34D399' }}>
                      {formatDate(new Date(inst.paidAt))} ödendi
                    </span>
                  )}
                  {!inst.isPaid && (
                    <button
                      onClick={() => markPaid(inst.id)}
                      disabled={isPending}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 12px', borderRadius: 5, fontSize: 12,
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                        color: '#34D399', cursor: 'pointer', transition: 'all 0.15s',
                        opacity: isPending ? 0.5 : 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.1)')}
                    >
                      {loading
                        ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }}/>
                        : <CheckCircle2 size={12}/>
                      }
                      {t('arAp.markPaid')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function OdemePlaniPage() {
  const { t } = useI18n();
  const params    = useParams<{ invoiceId: string }>();
  const invoiceId = params.invoiceId;
  const qc        = useQueryClient();

  const { data: plan, isLoading, isError } = useQuery({
    queryKey: ['payment-plan', invoiceId],
    queryFn: async () => {
      try {
        const r = await financialApi.arAp.getPaymentPlan(invoiceId);
        return r.data as PaymentPlan | null;
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });

  const onCreated = useCallback(
    () => qc.invalidateQueries({ queryKey: ['payment-plan', invoiceId] }),
    [qc, invoiceId],
  );

  const displayPlan = plan ?? null;

  // Alacak faturasından kalan tutarı hesapla — gerçek uygulamada invoice fetch'den gelir
  const remainingKurus = 0;

  return (
    <div className="space-y-5" style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* ─── Başlık ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/ar-ap/alacaklar"
            style={{ color: '#475569', display: 'flex', padding: 4, borderRadius: 5, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
          >
            <ArrowLeft size={16}/>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CreditCard size={15} style={{ color: '#0EA5E9' }}/>
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{t('arAp.paymentPlan')}</h1>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }} className="num">{t('invoice.invoice')}: {invoiceId}</p>
            </div>
          </div>
        </div>
        <Link
          href={`/faturalar/${invoiceId}`}
          className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5"
          style={{ textDecoration: 'none' }}
        >
          <ReceiptText size={13}/> {t('arAp.goToInvoice')}
        </Link>
      </div>

      {/* ─── Durum ─── */}
      {isLoading && (
        <div className="flex items-center gap-2 text-text-3 text-sm">
          <Loader2 size={15} className="animate-spin"/> {t('common.loading')}
        </div>
      )}

      {/* ─── İçerik: plan varsa göster, yoksa oluştur ─── */}
      {!isLoading && (
        displayPlan && displayPlan.installments.length > 0
          ? <ExistingPlan plan={displayPlan}/>
          : (
            <>
              <div className="card px-4 py-3 flex items-center gap-3">
                <AlertCircle size={14} className="text-amber-400 shrink-0"/>
                <p className="text-sm text-text-2">
                  {t('arAp.noPaymentPlanCreated')}{' '}
                  <span className="text-text-3">{t('arAp.remainingAmount')}:</span>{' '}
                  <span className="num font-semibold text-text-1">{fmt(remainingKurus)}</span>
                </p>
              </div>
              <CreatePlanForm
                invoiceId={invoiceId}
                remainingKurus={remainingKurus}
                onCreated={onCreated}
              />
            </>
          )
      )}
    </div>
  );
}


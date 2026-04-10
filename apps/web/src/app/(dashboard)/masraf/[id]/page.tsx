'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Receipt, AlertCircle, Loader2,
  Send, ThumbsUp, ThumbsDown, CreditCard, User, Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  expenseApi,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_VARIANTS,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseStatus,
} from '@/services/expense';
import { formatCurrency, formatDate, kurusToTl } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from '@/components/ui/table';

const fmt = (k: number) => formatCurrency(kurusToTl(Number(k)));

/* ─── Reject Modal ───────────────────────────────────────────────── */
function RejectModal({
  open,
  expenseId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  expenseId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => expenseApi.reject(expenseId, reason),
    onSuccess: () => {
      setReason('');
      onSuccess();
    },
    onError: () => toast.error(t('expense.rejectError')),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-destructive/10 w-fit mb-2">
            <ThumbsDown size={16} className="text-destructive" />
          </div>
          <DialogTitle className="text-base font-semibold">{t('expense.rejectTitle')}</DialogTitle>
          <DialogDescription>{t('expense.rejectReason')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t('expense.rejectReason')}</Label>
          <Textarea
            rows={4}
            placeholder={t('expense.rejectReasonPlaceholder')}
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="resize-vertical"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending}
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t('expense.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Status Actions ─────────────────────────────────────────────── */
function StatusActions({
  id,
  status,
  onReject,
}: {
  id: string;
  status: ExpenseStatus;
  onReject: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();

  const mutOpts = (msg: string) => ({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense', id] });
      toast.success(msg);
    },
    onError: () => toast.error(t('common.errorOccurred')),
  });

  const submitMut  = useMutation({ mutationFn: () => expenseApi.submit(id),  ...mutOpts(t('expense.submitSuccess')) });
  const approveMut = useMutation({ mutationFn: () => expenseApi.approve(id), ...mutOpts(t('expense.approveSuccess')) });
  const payMut     = useMutation({ mutationFn: () => expenseApi.pay(id),     ...mutOpts(t('expense.paySuccess')) });

  const busy = submitMut.isPending || approveMut.isPending || payMut.isPending;

  return (
    <div className="flex gap-2 flex-wrap">
      {status === 'TASLAK' && (
        <Button disabled={busy} isLoading={submitMut.isPending} onClick={() => submitMut.mutate()} className="gap-1.5">
          <Send size={13} /> {t('expense.submitForApproval')}
        </Button>
      )}
      {status === 'ONAY_BEKLIYOR' && (
        <>
          <Button disabled={busy} isLoading={approveMut.isPending} onClick={() => approveMut.mutate()} className="gap-1.5">
            <ThumbsUp size={13} /> {t('expense.approve')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onReject} className="gap-1.5">
            <ThumbsDown size={13} /> {t('expense.reject')}
          </Button>
        </>
      )}
      {status === 'ONAYLANDI' && (
        <Button disabled={busy} isLoading={payMut.isPending} onClick={() => payMut.mutate()} className="gap-1.5">
          <CreditCard size={13} /> {t('expense.markAsPaid')}
        </Button>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function MasrafDetayPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();
  const { t }   = useI18n();

  const [showRejectModal, setShowRejectModal] = useState(false);

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['expense', id],
    queryFn: () => expenseApi.get(id).then(r => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-10 flex flex-col items-center gap-3 text-destructive">
          <AlertCircle size={28} />
          <p className="text-sm">{t('expense.reportNotFound')}</p>
          <Button variant="ghost" onClick={() => router.push('/masraf')}>{t('common.goBack')}</Button>
        </CardContent>
      </Card>
    );
  }

  const byCategory = report.lines.reduce<Record<string, number>>((acc, l) => {
    const label = EXPENSE_CATEGORY_LABELS[l.category] ?? l.category;
    acc[label] = (acc[label] ?? 0) + l.amountKurus;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* Üst başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/masraf">
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowLeft size={15} />
            </Button>
          </Link>
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Receipt size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">{t('expense.expenseReport')}</h1>
              <Badge variant={EXPENSE_STATUS_VARIANTS[report.status] || 'outline'}>
                {EXPENSE_STATUS_LABELS[report.status]}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><User size={11} /> {report.employeeName}</span>
              <span className="flex items-center gap-1"><Calendar size={11} /> {report.period}</span>
            </div>
          </div>
        </div>

        <StatusActions
          id={id}
          status={report.status}
          onReject={() => setShowRejectModal(true)}
        />
      </div>

      {/* KPI satırı */}
      <div className="flex gap-3 flex-wrap">
        <Card className="shadow-sm flex-1 min-w-[150px]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('common.totalAmount')}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{fmt(report.totalKurus)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{report.lines.length} {t('expense.items')}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1 min-w-[150px]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('expense.taxTotal')}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">
              {fmt(report.lines.reduce((s, l) => s + Number(l.kdvKurus), 0))}
            </p>
          </CardContent>
        </Card>
        {report.submittedAt && (
          <Card className="shadow-sm flex-1 min-w-[150px]">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('expense.submittedDate')}</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatDate(report.submittedAt)}</p>
            </CardContent>
          </Card>
        )}
        {report.approvedAt && (
          <Card className="shadow-sm flex-1 min-w-[150px]">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('expense.approvedDate')}</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatDate(report.approvedAt)}</p>
              {report.approvedBy && <p className="text-[11px] text-muted-foreground mt-1">{report.approvedBy}</p>}
            </CardContent>
          </Card>
        )}
        {report.paidAt && (
          <Card className="shadow-sm flex-1 min-w-[150px]">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('expense.paidDate')}</p>
              <p className="text-base font-bold text-foreground tabular-nums">{formatDate(report.paidAt)}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Red sebebi */}
      {report.status === 'REDDEDILDI' && report.rejectedReason && (
        <Card className="shadow-sm border-destructive/25 bg-destructive/5">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-destructive mb-2">{t('expense.rejectionReason')}</p>
            <p className="text-sm text-foreground leading-relaxed">{report.rejectedReason}</p>
          </CardContent>
        </Card>
      )}

      {/* Kategori özeti */}
      {Object.keys(byCategory).length > 1 && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t('expense.categoryBreakdown')}</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(byCategory).map(([cat, total]) => {
                const pct = report.totalKurus > 0 ? Math.round((total / Number(report.totalKurus)) * 100) : 0;
                return (
                  <div key={cat} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border">
                    <span className="text-xs text-foreground font-medium">{cat}</span>
                    <span className="text-xs text-primary font-bold tabular-nums">{fmt(total)}</span>
                    <span className="text-[11px] text-muted-foreground">%{pct}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Masraf kalemleri tablosu */}
      <Card className="shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Receipt size={14} className="text-muted-foreground" />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t('expense.expenseItems')}</p>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{report.lines.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wider whitespace-nowrap">{t('common.date')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">{t('expense.category')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">{t('common.description')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">{t('expense.amount')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">{t('expense.tax')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wider text-right">{t('common.total')}</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">{t('expense.receipt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.lines.map(line => (
                <TableRow key={line.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDate(line.expenseDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                      {EXPENSE_CATEGORY_LABELS[line.category]}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="text-sm text-foreground truncate">{line.description}</p>
                    {line.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{line.notes}</p>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{fmt(line.amountKurus)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {Number(line.kdvKurus) > 0 ? fmt(line.kdvKurus) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {fmt(Number(line.amountKurus) + Number(line.kdvKurus))}
                  </TableCell>
                  <TableCell>
                    {line.receiptUrl ? (
                      <a href={line.receiptUrl} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline">
                        {t('common.view')}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/30">
                <TableCell colSpan={3} className="text-right text-xs text-muted-foreground font-medium">{t('common.total')}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmt(report.lines.reduce((s, l) => s + Number(l.amountKurus), 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-muted-foreground">
                  {fmt(report.lines.reduce((s, l) => s + Number(l.kdvKurus), 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums font-bold text-primary">
                  {fmt(report.totalKurus)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>

      {/* Notlar */}
      {report.notes && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t('common.notes')}</p>
            <p className="text-sm text-foreground leading-relaxed">{report.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Red modalı */}
      <RejectModal
        open={showRejectModal}
        expenseId={id}
        onClose={() => setShowRejectModal(false)}
        onSuccess={() => {
          setShowRejectModal(false);
          qc.invalidateQueries({ queryKey: ['expense', id] });
          toast.success(t('expense.rejectedSuccess'));
        }}
      />
    </div>
  );
}

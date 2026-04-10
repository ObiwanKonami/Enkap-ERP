'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Factory, Package, Wrench, Check, X,
  AlertCircle, ChevronDown, ChevronUp, Clock, PlayCircle,
  CheckCircle2, Circle, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  manufacturingApi,
  WO_STATUS_LABELS,
  WO_STATUS_CLS,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderOperation,
} from '@/services/manufacturing';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const fmtDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} dk`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} sa`;
};

/* ─── Complete Modal ─────────────────────────────────────────────── */
function CompleteModal({
  open,
  workOrder,
  onClose,
  onSuccess,
}: {
  open: boolean;
  workOrder: WorkOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useI18n();
  const remaining = workOrder.targetQuantity - workOrder.producedQuantity;
  const [producedQty, setProducedQty] = useState(remaining);

  const mutation = useMutation({
    mutationFn: () => manufacturingApi.workOrder.complete(workOrder.id, producedQty),
    onSuccess,
    onError: () => toast.error(t('manufacturing.completeError')),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-muted w-fit mb-2">
            <CheckCircle2 size={16} className="text-primary" />
          </div>
          <DialogTitle className="text-base font-semibold">{t('manufacturing.completeProduction')}</DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">{workOrder.productName}</strong>
            <span className="block mt-1 text-muted-foreground">
              {t('manufacturing.target')}: {workOrder.targetQuantity} · {t('manufacturing.produced')}: {workOrder.producedQuantity} · {t('manufacturing.remaining')}: {remaining}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{t('manufacturing.thisTimesQuantity')} *</Label>
          <Input
            type="number"
            min={1}
            max={remaining}
            value={producedQty}
            onChange={e => setProducedQty(Math.min(remaining, Math.max(1, Number(e.target.value))))}
            className=""
          />
          <p className="text-[11px] text-muted-foreground">{t('manufacturing.maximum')}: {remaining}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            disabled={producedQty < 1 || mutation.isPending}
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate()}
            className="gap-1.5"
          >
            <Check size={14} />
            {t('manufacturing.complete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── MRP Panel ──────────────────────────────────────────────────── */
function MrpPanel({ bomId, quantity }: { bomId: string; quantity: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['mrp-requirements', bomId, quantity],
    queryFn: () => manufacturingApi.mrp.requirements(bomId, quantity).then(r => r.data),
    enabled: open,
  });

  return (
    <Card className="shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3.5 bg-transparent hover:bg-muted/50 transition-colors',
          open && 'border-b border-border',
        )}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Package size={15} className="text-muted-foreground" />
          {t('manufacturing.mrpPlanning')}
        </div>
        {open
          ? <ChevronUp size={15} className="text-muted-foreground" />
          : <ChevronDown size={15} className="text-muted-foreground" />}
      </button>

      {open && (
        <div>
          {isLoading && (
            <div className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> {t('common.calculating')}
            </div>
          )}
          {!isLoading && requirements.length === 0 && (
            <p className="px-4 py-3.5 text-sm text-muted-foreground">{t('manufacturing.noMaterialRequirements')}</p>
          )}
          {requirements.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wider">{t('manufacturing.material')}</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">{t('manufacturing.sku')}</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-right">{t('manufacturing.requiredQuantity')}</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider">{t('manufacturing.warehouse')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/50 transition-colors">
                    <TableCell className="text-sm text-foreground">{r.materialName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground ">{r.sku ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-primary">{r.requiredQuantity}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.warehouseId ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </Card>
  );
}

/* ─── Operations Timeline ────────────────────────────────────────── */
function OperationStatusIcon({ status }: { status: WorkOrderOperation['status'] }) {
  if (status === 'TAMAMLANDI') return <CheckCircle2 size={16} className="text-primary shrink-0" />;
  if (status === 'DEVAM')      return <PlayCircle   size={16} className="text-primary shrink-0" />;
  return <Circle size={16} className="text-muted-foreground shrink-0" />;
}

function OperationsSection({ operations }: { operations: WorkOrderOperation[] }) {
  const { t } = useI18n();
  if (operations.length === 0) return null;

  const totalPlanned = operations.reduce((s, o) => s + o.plannedDurationMinutes, 0);
  const totalActual  = operations.reduce((s, o) => s + (o.actualDurationMinutes ?? 0), 0);
  const doneCount    = operations.filter(o => o.status === 'TAMAMLANDI').length;

  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Wrench size={15} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{t('manufacturing.operations')}</span>
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{doneCount}/{operations.length}</Badge>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock size={11} />{t('manufacturing.plan')}: {fmtDuration(totalPlanned)}</span>
          {totalActual > 0 && (
            <span className={totalActual > totalPlanned ? 'text-destructive' : 'text-primary'}>
              {t('manufacturing.actual')}: {fmtDuration(totalActual)}
            </span>
          )}
        </div>
      </div>

      <div>
        {operations.map((op, idx) => (
          <div key={op.id} className={cn('flex items-start gap-3 px-4 py-3.5', idx < operations.length - 1 && 'border-b border-border')}>
            <div className="flex flex-col items-center pt-0.5">
              <OperationStatusIcon status={op.status} />
              {idx < operations.length - 1 && (
                <div className="w-px flex-grow min-h-4 bg-border mt-1.5" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-semibold">#{op.sequence}</span>
                  <span className={cn('text-sm font-semibold', op.status === 'TAMAMLANDI' ? 'text-muted-foreground' : 'text-foreground')}>
                    {op.operationName}
                  </span>
                  {op.workCenter && (
                    <span className="text-[11px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                      {op.workCenter}
                    </span>
                  )}
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground whitespace-nowrap">
                  <span className="flex items-center gap-1"><Clock size={11} />{t('manufacturing.plan')}: {fmtDuration(op.plannedDurationMinutes)}</span>
                  {op.actualDurationMinutes != null && (
                    <span className={op.actualDurationMinutes > op.plannedDurationMinutes ? 'text-destructive' : 'text-primary'}>
                      {t('manufacturing.actual')}: {fmtDuration(op.actualDurationMinutes)}
                    </span>
                  )}
                </div>
              </div>
              {op.completedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('manufacturing.completedAt')}: {formatDate(op.completedAt)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ─── Status Actions ─────────────────────────────────────────────── */
function StatusActions({
  workOrder,
  onComplete,
}: {
  workOrder: WorkOrder;
  onComplete: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const id = workOrder.id;
  const [confirmCancel, setConfirmCancel] = useState(false);

  const mutOpts = (msg: string) => ({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-order', id] });
      toast.success(msg);
    },
    onError: () => toast.error(t('common.errorOccurred')),
  });

  const confirmMut = useMutation({ mutationFn: () => manufacturingApi.workOrder.confirm(id), ...mutOpts(t('manufacturing.workOrderConfirmed')) });
  const startMut   = useMutation({ mutationFn: () => manufacturingApi.workOrder.start(id),   ...mutOpts(t('manufacturing.productionStarted')) });
  const cancelMut  = useMutation({
    mutationFn: () => manufacturingApi.workOrder.cancel(id),
    ...mutOpts(t('manufacturing.workOrderCancelled')),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-order', id] });
      setConfirmCancel(false);
      toast.success(t('manufacturing.workOrderCancelled'));
    },
  });

  const { status } = workOrder;
  const busy = confirmMut.isPending || startMut.isPending || cancelMut.isPending;
  const remaining = workOrder.targetQuantity - workOrder.producedQuantity;

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {status === 'TASLAK' && (
          <Button disabled={busy} isLoading={confirmMut.isPending} onClick={() => confirmMut.mutate()} className="gap-1.5">
            <Check size={14} /> {t('manufacturing.confirm')}
          </Button>
        )}
        {status === 'PLANLI' && (
          <Button disabled={busy} isLoading={startMut.isPending} onClick={() => startMut.mutate()} className="gap-1.5">
            <PlayCircle size={14} /> {t('manufacturing.startProduction')}
          </Button>
        )}
        {status === 'URETIMDE' && remaining > 0 && (
          <Button onClick={onComplete} className="gap-1.5">
            <CheckCircle2 size={14} /> {t('manufacturing.enterProduction')}
          </Button>
        )}
        {(status === 'TASLAK' || status === 'PLANLI') && (
          <Button variant="destructive" disabled={busy} onClick={() => setConfirmCancel(true)} className="gap-1.5">
            <X size={13} /> {t('manufacturing.cancel')}
          </Button>
        )}
      </div>

      <Dialog open={confirmCancel} onOpenChange={(v) => !v && setConfirmCancel(false)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">{t('manufacturing.cancel')}</DialogTitle>
            <DialogDescription>{t('manufacturing.cancelConfirmation')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{t('common.cancel')}</Button>
            <Button variant="destructive" isLoading={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
              {t('manufacturing.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function UretimDetayPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();

  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const { data: workOrder, isLoading, isError } = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => manufacturingApi.workOrder.get(id).then(r => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <Card className="shadow-sm h-32 animate-pulse" />
        <Card className="shadow-sm h-72 animate-pulse" />
      </div>
    );
  }

  if (isError || !workOrder) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-8 flex flex-col items-center gap-3 text-destructive">
          <AlertCircle size={32} />
          <p className="text-sm">{t('manufacturing.workOrderNotFound')}</p>
          <Button variant="ghost" onClick={() => router.push('/uretim')}>{t('common.goBack')}</Button>
        </CardContent>
      </Card>
    );
  }

  const progressPct = workOrder.targetQuantity > 0
    ? Math.round((workOrder.producedQuantity / workOrder.targetQuantity) * 100)
    : 0;

  const isOverdue = workOrder.status !== 'TAMAMLANDI'
    && workOrder.status !== 'IPTAL'
    && new Date(workOrder.plannedEndDate) < new Date();

  return (
    <div className="flex flex-col gap-5">
      {/* Üst başlık */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/uretim">
            <Button variant="ghost" size="icon" className="size-8">
              <ArrowLeft size={15} />
            </Button>
          </Link>
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Factory size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground tabular-nums">{workOrder.woNumber}</h1>
              <span className={WO_STATUS_CLS[workOrder.status]}>{WO_STATUS_LABELS[workOrder.status]}</span>
              {isOverdue && (
                <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                  {t('manufacturing.overdue')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{workOrder.productName}</p>
          </div>
        </div>
        <StatusActions
          workOrder={workOrder}
          onComplete={() => setShowCompleteModal(true)}
        />
      </div>

      {/* KPI satırı */}
      <div className="flex gap-3 flex-wrap">
        <Card className="shadow-sm flex-1 min-w-[130px]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('manufacturing.targetQuantity')}</p>
            <p className="text-xl font-bold text-foreground tabular-nums">{workOrder.targetQuantity}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t('manufacturing.pieces')}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1 min-w-[130px]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('manufacturing.produced')}</p>
            <p className={cn('text-xl font-bold tabular-nums', progressPct === 100 ? 'text-primary' : 'text-foreground')}>
              {workOrder.producedQuantity}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{t('manufacturing.remaining')}: {workOrder.targetQuantity - workOrder.producedQuantity}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1 min-w-[130px]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('manufacturing.plannedStart')}</p>
            <p className="text-base font-bold text-foreground tabular-nums">{formatDate(workOrder.plannedStartDate)}</p>
            {workOrder.actualStartDate && (
              <p className="text-[11px] text-primary mt-1">{t('manufacturing.started')}: {formatDate(workOrder.actualStartDate)}</p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm flex-1 min-w-[130px]">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{t('manufacturing.plannedEnd')}</p>
            <p className={cn('text-base font-bold tabular-nums', isOverdue ? 'text-destructive' : 'text-foreground')}>
              {formatDate(workOrder.plannedEndDate)}
            </p>
            {workOrder.actualEndDate && (
              <p className="text-[11px] text-primary mt-1">{t('manufacturing.completed')}: {formatDate(workOrder.actualEndDate)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Üretim ilerleme çubuğu */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">{t('manufacturing.productionProgress')}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {workOrder.producedQuantity} / {workOrder.targetQuantity} ({progressPct}%)
            </span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Operasyonlar */}
      <OperationsSection operations={workOrder.operations} />

      {/* MRP — Malzeme İhtiyacı */}
      <MrpPanel bomId={workOrder.bomId} quantity={workOrder.targetQuantity - workOrder.producedQuantity} />

      {/* Notlar */}
      {workOrder.notes && (
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t('manufacturing.notes')}</p>
            <p className="text-sm text-foreground leading-relaxed">{workOrder.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Tamamlama modalı */}
      <CompleteModal
        open={showCompleteModal}
        workOrder={workOrder}
        onClose={() => setShowCompleteModal(false)}
        onSuccess={() => {
          setShowCompleteModal(false);
          qc.invalidateQueries({ queryKey: ['work-order', id] });
          toast.success(t('manufacturing.productionQuantitySaved'));
        }}
      />
    </div>
  );
}

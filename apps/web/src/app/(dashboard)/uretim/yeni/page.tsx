'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { manufacturingApi, type Bom } from '@/services/manufacturing';
import { stockApi } from '@/services/stock';
import { useI18n } from '@/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DateInput } from '@/components/ui/date-input';
import {
  Factory, ArrowLeft, Save, AlertCircle,
  Search, Package, ChevronDown, Plus, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectedProduct { id: string; name: string; sku: string; }

function ProductSearch({ value, onChange }: { value: SelectedProduct | null; onChange: (p: SelectedProduct | null) => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['products-search-mfg', q],
    queryFn:  () => stockApi.products.list({ q: q || undefined, limit: 15 }),
    enabled:  open && q.length >= 1,
    select:   (r) => r.data.data,
  });

  if (value) {
    return (
      <div className="flex items-center gap-2.5 p-2.5 rounded-md border bg-primary/5 border-primary/20">
        <Package size={14} className="text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-foreground">{value.name}</div>
          <div className="text-[11px] tabular-nums text-primary">{value.sku}</div>
        </div>
        <button
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
      <Input
        className="pl-8"
        placeholder={t('manufacturing.searchProductNameOrSku')}
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && data && data.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden">
          {data.map(p => (
            <button
              key={p.id}
              onMouseDown={() => { onChange({ id: p.id, name: p.name, sku: p.sku }); setQ(''); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-muted transition-colors"
            >
              <Package size={13} className="text-primary shrink-0" />
              <div>
                <div className="text-[13px] text-foreground">{p.name}</div>
                <div className="text-[11px] tabular-nums text-muted-foreground">{p.sku}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface OpRow { sequence: number; operationName: string; workCenter: string; plannedDurationMinutes: number; }

function OperationRows({ ops, onChange }: { ops: OpRow[]; onChange: (ops: OpRow[]) => void }) {
  const { t } = useI18n();
  function add() {
    onChange([...ops, { sequence: ops.length + 1, operationName: '', workCenter: '', plannedDurationMinutes: 60 }]);
  }
  function remove(i: number) {
    onChange(ops.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, sequence: idx + 1 })));
  }
  function update(i: number, field: keyof OpRow, val: string | number) {
    onChange(ops.map((o, idx) => idx === i ? { ...o, [field]: val } : o));
  }

  return (
    <div className="flex flex-col gap-2">
      {ops.map((op, i) => (
        <div
          key={i}
          className="grid grid-cols-[32px_1fr_120px_100px_32px] gap-2 items-center p-2.5 rounded-md border bg-muted border-border"
        >
          <div className="text-[11px] tabular-nums text-muted-foreground text-center font-semibold">{op.sequence}</div>
          <Input
            placeholder={t('manufacturing.operationName')}
            value={op.operationName}
            onChange={e => update(i, 'operationName', e.target.value)}
          />
          <Input
            placeholder={t('manufacturing.workCenter')}
            value={op.workCenter}
            onChange={e => update(i, 'workCenter', e.target.value)}
          />
          <div className="relative">
            <Input
              className="tabular-nums pr-7"
              type="number"
              min={1}
              placeholder={t('manufacturing.duration')}
              value={op.plannedDurationMinutes}
              onChange={e => update(i, 'plannedDurationMinutes', Number(e.target.value))}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{t('manufacturing.minutes')}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => remove(i)}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="flex items-center gap-1.5 text-xs"
        onClick={add}
      >
        <Plus size={12} /> {t('manufacturing.addOperation')}
      </Button>
    </div>
  );
}

export default function UretimYeniPage() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();

  const [product,          setProduct]          = useState<SelectedProduct | null>(null);
  const [bomId,            setBomId]            = useState('');
  const [targetQuantity,   setTargetQuantity]   = useState('1');
  const [plannedStartDate, setPlannedStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [plannedEndDate,   setPlannedEndDate]   = useState('');
  const [warehouseId,      setWarehouseId]      = useState('');
  const [notes,            setNotes]            = useState('');
  const [operations,       setOperations]       = useState<OpRow[]>([]);
  const [formError,        setFormError]        = useState('');

  const { data: bomsResp } = useQuery({
    queryKey: ['boms-list'],
    queryFn:  () => manufacturingApi.bom.list().then(r => r.data),
  });
  const boms: Bom[] = Array.isArray(bomsResp) ? bomsResp : (bomsResp?.data ?? []);

  const selectedBom = boms.find(b => b.id === bomId);

  const { data: warehousesResp } = useQuery({
    queryKey: ['warehouses'],
    queryFn:  () => stockApi.warehouses.list(),
    select:   r => r.data.filter((w: { isActive: boolean }) => w.isActive),
  });
  const warehouses = warehousesResp ?? [];

  const canSubmit =
    !!(product || selectedBom) &&
    !!bomId &&
    parseFloat(targetQuantity) > 0 &&
    !!plannedStartDate &&
    !!plannedEndDate;

  const { mutate, isPending } = useMutation({
    mutationFn: () => manufacturingApi.workOrder.create({
      bomId,
      productId:         product?.id ?? selectedBom?.productId ?? '',
      productName:       product?.name ?? selectedBom?.productName ?? '',
      targetQuantity:    parseFloat(targetQuantity),
      plannedStartDate,
      plannedEndDate,
      warehouseId:       warehouseId || undefined,
      notes:             notes || undefined,
      operations:        operations.filter(o => o.operationName.trim()).map(o => ({
        ...o,
        workCenter: o.workCenter || undefined,
      })),
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      router.push(`/uretim/${res.data.id}`);
    },
    onError: () => setFormError(t('manufacturing.workOrderCreationFailed')),
  });

  function handleBomChange(id: string) {
    setBomId(id);
    const bom = boms.find(b => b.id === id);
    if (bom && !product) {
      setProduct({ id: bom.productId, name: bom.productName, sku: '' });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
            <ArrowLeft size={13} /> {t('common.back')}
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Factory size={20} className="text-primary" />
              {t('manufacturing.newWorkOrder')}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t('manufacturing.createBomWorkOrder')}</p>
          </div>
        </div>
        <Button
          onClick={() => mutate()}
          disabled={isPending || !canSubmit}
          isLoading={isPending}
          className="gap-1.5"
        >
          {!isPending && <Save size={13} />}
          {t('manufacturing.createWorkOrder')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('manufacturing.recipeAndProduct')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  {t('manufacturing.manufacturingBom')} <span className="text-destructive">*</span>
                </Label>
                <Select value={bomId} onValueChange={handleBomChange}>
                  <SelectTrigger>
                    <SelectValue placeholder={`— ${t('manufacturing.selectBom')} —`} />
                  </SelectTrigger>
                  <SelectContent>
                    {boms.filter(b => b.isActive).map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.productName} (Rev. {b.revisionNo})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {boms.length === 0 && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    {t('manufacturing.noBomsDefined')}{' '}
                    <Link href="/uretim/receteler/yeni" className="text-primary hover:underline">{t('manufacturing.createRecipe')} →</Link>
                  </p>
                )}
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  {t('manufacturing.finishedProduct')} <span className="text-destructive">*</span>
                </Label>
                <ProductSearch value={product} onChange={setProduct}/>
                {selectedBom && !product && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t('manufacturing.bomSelected')}: {selectedBom.productName}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('manufacturing.quantityAndPlanning')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('manufacturing.targetQuantity')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="tabular-nums"
                    type="number"
                    min={1}
                    value={targetQuantity}
                    onChange={e => setTargetQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('manufacturing.startDate')} <span className="text-destructive">*</span>
                  </Label>
                  <DateInput
                    value={plannedStartDate}
                    onChange={e => setPlannedStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('manufacturing.endDate')} <span className="text-destructive">*</span>
                  </Label>
                  <DateInput
                    className={cn(!plannedEndDate && 'border-destructive')}
                    value={plannedEndDate}
                    onChange={e => setPlannedEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  {t('manufacturing.outputWarehouse')} <span className="text-xs font-normal normal-case">({t('common.optional')})</span>
                </Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={`— ${t('manufacturing.selectWarehouse')} —`} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w: { id: string; name: string; city?: string }) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}{w.city ? ` (${w.city})` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">{t('manufacturing.outputWarehouseHint')}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('manufacturing.operationSteps')} <span className="text-xs font-normal normal-case text-muted-foreground">({t('common.optional')})</span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {operations.length > 0 && (
                <div className="grid grid-cols-[32px_1fr_120px_100px_32px] gap-2 px-3">
                  <div className="text-[10px] text-muted-foreground text-center">#</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('manufacturing.operation')}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('manufacturing.workCenter')}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('manufacturing.duration')}</div>
                  <div />
                </div>
              )}
              <OperationRows ops={operations} onChange={setOperations}/>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('manufacturing.notes')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={t('manufacturing.optionalNotes')}
              />
            </CardContent>
          </Card>

          {formError && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="sticky top-20">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('common.summary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {[
                { label: t('manufacturing.recipe'),   value: selectedBom?.productName ?? '—' },
                { label: t('manufacturing.product'),     value: product?.name ?? selectedBom?.productName ?? '—' },
                { label: t('manufacturing.quantity'),   value: targetQuantity ? `${targetQuantity} ${t('manufacturing.units')}` : '—', highlight: true },
                { label: t('manufacturing.startDate'), value: plannedStartDate || '—' },
                { label: t('manufacturing.endDate'),    value: plannedEndDate || '—', warn: !plannedEndDate },
                { label: t('manufacturing.warehouse'),     value: warehouses.find((w: { id: string; name: string }) => w.id === warehouseId)?.name ?? '—' },
                { label: t('manufacturing.operations'), value: `${operations.filter(o => o.operationName).length} ${t('manufacturing.steps')}` },
              ].map(({ label, value, highlight, warn }) => (
                <div key={label} className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cn(
                    "tabular-nums text-right",
                    warn ? "text-amber-500" : highlight ? "text-primary font-semibold" : "text-foreground"
                  )}>
                    {value}
                  </span>
                </div>
              ))}

              {selectedBom && selectedBom.lines?.length > 0 && (
                <div className="mt-2 pt-2.5 border-t border-border">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                    {t('manufacturing.recipe')} ({selectedBom.lines.length} {t('manufacturing.materials')})
                  </div>
                  {selectedBom.lines.map(l => (
                    <div key={l.id} className="flex justify-between text-[11px] text-muted-foreground py-0.5">
                      <span className="truncate">{l.materialName}</span>
                      <span className="tabular-nums">{l.quantity} {l.unitOfMeasure}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

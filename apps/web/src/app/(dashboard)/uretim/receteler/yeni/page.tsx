'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft, ClipboardList, Plus, Trash2, Save, Search,
  Check, AlertCircle, Package, X,
} from 'lucide-react';
import { manufacturingApi } from '@/services/manufacturing';
import { stockApi, type Product } from '@/services/stock';
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
import { cn } from '@/lib/utils';

interface BomLineInput {
  key: number;
  materialId: string;
  materialName: string;
  sku: string;
  quantity: number;
  scrapRate: number;
  unitOfMeasure: string;
  warehouseId: string;
}

function MaterialSearch({
  value,
  onSelect,
  placeholder,
}: {
  value: string;
  onSelect: (p: Product) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['stock-search', query],
    queryFn: () => stockApi.products.list({ q: query, limit: 10 }).then(r => {
      const d = r.data;
      return (Array.isArray(d) ? d : (d?.data ?? [])) as Product[];
    }),
    enabled: query.length >= 1,
  });

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          className="pl-7"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && data && data.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-[100] mt-0.5 bg-card border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
          {data.map(p => (
            <button
              key={p.id}
              type="button"
              className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
              onClick={() => { onSelect(p); setOpen(false); setQuery(p.name); }}
            >
              <Package size={12} className="text-muted-foreground shrink-0" />
              <span className="text-foreground">{p.name}</span>
              {p.sku && <span className="text-xs tabular-nums text-muted-foreground ml-auto">{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

let lineKey = 0;
const makeEmptyLine = (): BomLineInput => ({
  key: ++lineKey,
  materialId: '', materialName: '', sku: '',
  quantity: 1, scrapRate: 0,
  unitOfMeasure: 'ADET', warehouseId: '',
});

export default function YeniRecetePage() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();

  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [revisionNo, setRevisionNo] = useState('1.0');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<BomLineInput[]>([makeEmptyLine()]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: () => stockApi.warehouses.list().then(r => {
      const d = r.data;
      return (Array.isArray(d) ? d : ((d as { data?: unknown[] })?.data ?? [])) as Array<{ id: string; name: string; isActive: boolean }>;
    }),
  });
  const activeWarehouses = warehouses.filter(w => w.isActive);

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const validLines = lines.filter(l => l.materialId && l.materialName);
      if (!productName) { setError(t('manufacturing.productRequired')); return Promise.reject(); }
      if (!revisionNo) { setError(t('manufacturing.revisionRequired')); return Promise.reject(); }
      if (validLines.length === 0) { setError(t('manufacturing.addAtLeastOneMaterial')); return Promise.reject(); }

      return manufacturingApi.bom.create({
        productId: productId || undefined,
        productName,
        revisionNo,
        description: description || undefined,
        lines: validLines.map(l => ({
          materialId: l.materialId,
          materialName: l.materialName,
          sku: l.sku || undefined,
          quantity: l.quantity,
          scrapRate: l.scrapRate,
          unitOfMeasure: l.unitOfMeasure,
          warehouseId: l.warehouseId || undefined,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boms'] });
      router.push('/uretim/receteler');
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : t('manufacturing.recipeCreationFailed');
      setError(msg);
    },
  });

  const updateLine = (key: number, patch: Partial<BomLineInput>) => {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l));
  };

  const removeLine = (key: number) => {
    setLines(prev => prev.filter(l => l.key !== key));
  };

  const validLineCount = lines.filter(l => l.materialId && l.materialName).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/uretim/receteler"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} /> {t('common.back')}
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList size={20} className="text-primary" /> {t('manufacturing.newRecipe')}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t('manufacturing.createBomRecipe')}</p>
          </div>
        </div>
        <Button
          onClick={() => { setError(''); mutate(); }}
          disabled={isPending}
          isLoading={isPending}
          className="gap-1.5"
        >
          {!isPending && <Save size={14} />}
          {t('manufacturing.saveRecipe')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('manufacturing.generalInfo')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('manufacturing.finishedProduct')} *
                  </Label>
                  {productName ? (
                    <div className="flex items-center gap-2 p-2 rounded-md border bg-primary/5 border-primary/20">
                      <Package size={14} className="text-primary shrink-0" />
                      <span className="text-sm text-foreground flex-1">{productName}</span>
                      <button
                        type="button"
                        onClick={() => { setProductId(''); setProductName(''); }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <MaterialSearch
                      value=""
                      placeholder={t('manufacturing.searchProduct')}
                      onSelect={p => { setProductId(p.id); setProductName(p.name); }}
                    />
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {t('manufacturing.productSearchHint')}
                  </p>
                </div>

                {!productName && (
                  <div className="col-span-2">
                    <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                      {t('manufacturing.productNameFree')} *
                    </Label>
                    <Input
                      placeholder={t('manufacturing.enterProductName')}
                      value={productName}
                      onChange={e => setProductName(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('manufacturing.revisionNo')} *
                  </Label>
                  <Input
                    placeholder="1.0"
                    value={revisionNo}
                    onChange={e => setRevisionNo(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('manufacturing.description')}
                  </Label>
                  <textarea
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    placeholder={t('manufacturing.descriptionPlaceholder')}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('manufacturing.materialList')}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 h-8"
                  onClick={() => setLines(prev => [...prev, makeEmptyLine()])}
                >
                  <Plus size={13} /> {t('manufacturing.addLine')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="grid grid-cols-[2fr_80px_80px_90px_140px_32px] gap-2 pb-2 border-b border-border">
                {['Malzeme', 'Miktar', 'Fire %', 'Birim', 'Depo', ''].map(h => (
                  <div key={h} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</div>
                ))}
              </div>

              {lines.map((line, idx) => (
                <div key={line.key} className="grid grid-cols-[2fr_80px_80px_90px_140px_32px] gap-2 items-start pb-2 border-b border-border last:border-0">
                  <div>
                    {line.materialName ? (
                      <div className="flex items-center gap-1.5 p-1.5 rounded-md border bg-primary/5 border-primary/20 text-xs">
                        <Package size={11} className="text-primary shrink-0" />
                        <span className="flex-1 text-foreground truncate">{line.materialName}</span>
                        <button
                          type="button"
                          onClick={() => updateLine(line.key, { materialId: '', materialName: '', sku: '' })}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <MaterialSearch
                        value=""
                        placeholder={t('manufacturing.searchMaterial')}
                        onSelect={p => updateLine(line.key, {
                          materialId: p.id,
                          materialName: p.name,
                          sku: p.sku ?? '',
                          unitOfMeasure: p.unitCode ?? 'ADET',
                        })}
                      />
                    )}
                  </div>

                  <Input
                    type="number"
                    min={0.001}
                    step="any"
                    className="tabular-nums"
                    value={line.quantity}
                    onChange={e => updateLine(line.key, { quantity: Number(e.target.value) })}
                  />

                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="any"
                    className="tabular-nums"
                    value={line.scrapRate}
                    onChange={e => updateLine(line.key, { scrapRate: Number(e.target.value) })}
                  />

                  <Select value={line.unitOfMeasure} onValueChange={v => updateLine(line.key, { unitOfMeasure: v })}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['ADET', 'KG', 'GR', 'LT', 'ML', 'MT', 'CM', 'MM', 'M2', 'M3', 'TON', 'KUTU'].map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={line.warehouseId} onValueChange={v => updateLine(line.key, { warehouseId: v })}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="— Depo —" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeWarehouses.map(w => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", lines.length === 1 ? "text-muted-foreground" : "text-destructive hover:bg-destructive/10")}
                    disabled={lines.length === 1}
                    onClick={() => removeLine(line.key)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs gap-1 self-start"
                onClick={() => setLines(prev => [...prev, makeEmptyLine()])}
              >
                <Plus size={13} /> {t('manufacturing.addMaterialLine')}
              </Button>
            </CardContent>
          </Card>

          {error && (
            <Alert variant="destructive">
              <AlertCircle size={15} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="sticky top-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('common.summary')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t('manufacturing.product')}</span>
                <span className={cn("text-foreground", productName ? "font-medium" : "")}>
                  {productName || t('common.notSelected')}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t('manufacturing.revision')}</span>
                <span className="text-primary tabular-nums">{revisionNo || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t('manufacturing.materialCount')}</span>
                <span className={cn("tabular-nums font-semibold", validLineCount > 0 ? "text-primary" : "text-muted-foreground")}>
                  {validLineCount}
                </span>
              </div>

              {validLineCount > 0 && (
                <>
                  <div className="h-px bg-border my-2" />
                  <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                    {t('manufacturing.materials')}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {lines.filter(l => l.materialName).map(l => (
                      <div key={l.key} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Package size={11} className="text-muted-foreground shrink-0" />
                          <span className="text-foreground truncate">{l.materialName}</span>
                        </div>
                        <span className="text-foreground tabular-nums shrink-0">
                          {l.quantity} {l.unitOfMeasure}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="h-px bg-border my-2" />
              <Button
                className="w-full gap-1.5"
                disabled={isPending}
                onClick={() => { setError(''); mutate(); }}
                isLoading={isPending}
              >
                {!isPending && <Check size={14} />}
                {isPending ? t('common.saving') : t('manufacturing.saveRecipe')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm",
          toast.type === "success"
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {toast.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 hover:opacity-70">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

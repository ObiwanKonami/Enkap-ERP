'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ClipboardList, Plus, ArrowLeft, Search, ChevronRight,
  Check, X, AlertCircle, Package,
} from 'lucide-react';
import { manufacturingApi, type Bom } from '@/services/manufacturing';
import { formatDate } from '@/lib/format';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm",
      type === "success"
        ? "bg-primary/10 border-primary/30 text-primary"
        : "bg-destructive/10 border-destructive/30 text-destructive"
    )}>
      {type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 hover:opacity-70">
        <X size={13} />
      </button>
    </div>
  );
}

function BomRow({ bom, onDeactivate }: { bom: Bom; onDeactivate: (id: string) => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer transition-colors hover:bg-primary/5"
        onClick={() => setExpanded(v => !v)}
      >
        <TableCell className="w-6 py-3">
          <ChevronRight size={13} className={cn("text-muted-foreground transition-transform", expanded && "rotate-90")} />
        </TableCell>
        <TableCell className="py-3">
          <div className="text-[13px] font-semibold text-foreground">{bom.productName}</div>
        </TableCell>
        <TableCell className="py-3">
          <span className="text-xs tabular-nums text-primary">Rev. {bom.revisionNo}</span>
        </TableCell>
        <TableCell className="py-3">
          <span className="text-xs text-muted-foreground">{bom.lines?.length ?? 0} {t('manufacturing.materials')}</span>
        </TableCell>
        <TableCell className="py-3">
          <Badge variant={bom.isActive ? "secondary" : "outline"} className={cn(
            "text-[11px] font-medium",
            bom.isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
          )}>
            {bom.isActive ? t('common.active') : t('common.passive')}
          </Badge>
        </TableCell>
        <TableCell className="py-3">
          <span className="text-xs tabular-nums text-muted-foreground">{formatDate(bom.createdAt)}</span>
        </TableCell>
        <TableCell className="py-3" onClick={e => e.stopPropagation()}>
          <div className="flex gap-1 items-center">
            {bom.isActive && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                onClick={() => { if (confirm(t('manufacturing.deactivateRecipeConfirmation'))) onDeactivate(bom.id); }}
              >
                <X size={11} /> {t('manufacturing.deactivate')}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} className="p-0 bg-muted/50 border-b">
            <div className="p-3">
              {bom.description && (
                <div className="text-xs text-muted-foreground mb-2.5 italic">{bom.description}</div>
              )}
              <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                {t('manufacturing.materialList')}
              </div>
              {bom.lines?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold text-muted-foreground">{t('manufacturing.material')}</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">{t('manufacturing.sku')}</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-right">{t('manufacturing.quantity')}</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground">{t('manufacturing.unit')}</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground text-right">{t('manufacturing.scrapRate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bom.lines.map(line => (
                      <TableRow key={line.id} className="hover:bg-transparent">
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Package size={12} className="text-muted-foreground" />
                            {line.materialName}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-xs tabular-nums text-muted-foreground">{line.sku ?? '—'}</TableCell>
                        <TableCell className="py-2 text-xs tabular-nums font-semibold text-right">{line.quantity}</TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground">{line.unitOfMeasure}</TableCell>
                        <TableCell className={cn("py-2 text-xs tabular-nums text-right", line.scrapRate > 0 ? "text-amber-500" : "text-muted-foreground")}>
                          {line.scrapRate > 0 ? `%${line.scrapRate}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-xs text-muted-foreground">{t('manufacturing.noMaterialsDefined')}</div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function RecetelerPage() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const qc = useQueryClient();

  const { data: bomsResp, isLoading, isError } = useQuery({
    queryKey: ['boms'],
    queryFn: () => manufacturingApi.bom.list().then(r => r.data),
  });

  const boms: Bom[] = Array.isArray(bomsResp) ? bomsResp : (bomsResp?.data ?? []);
  const filtered = boms.filter(b =>
    !search || b.productName.toLowerCase().includes(search.toLowerCase())
  );

  const deactivate = useMutation({
    mutationFn: (id: string) => manufacturingApi.bom.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boms'] });
      setToast({ message: t('manufacturing.recipeDeactivated'), type: 'success' });
    },
    onError: () => setToast({ message: t('common.operationFailed'), type: 'error' }),
  });

  const active = boms.filter(b => b.isActive).length;
  const inactive = boms.filter(b => !b.isActive).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/uretim"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} /> {t('common.back')}
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList size={20} className="text-primary" /> {t('manufacturing.recipes')}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t('manufacturing.recipesDescription')}</p>
          </div>
        </div>
        <Button asChild className="h-9 gap-1.5">
          <Link href="/uretim/receteler/yeni">
            <Plus size={14} /> {t('manufacturing.newRecipe')}
          </Link>
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        {[
          { label: t('manufacturing.totalRecipes'), value: boms.length, color: 'text-foreground' },
          { label: t('common.active'), value: active, color: 'text-primary' },
          { label: t('common.passive'), value: inactive, color: 'text-muted-foreground' },
        ].map(k => (
          <Card key={k.label} className="p-4 flex-1 min-w-[120px]">
            <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">{k.label}</div>
            <div className={cn("text-[22px] font-bold", k.color)}>{k.value}</div>
          </Card>
        ))}
      </div>

      <div className="relative max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground z-10" />
        <Input
          className="pl-8"
          placeholder={t('manufacturing.searchByProductName')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <span className="inline-block animate-spin text-muted-foreground">⟳</span>
          </div>
        ) : isError ? (
          <div className="py-10 text-center text-destructive">
            <AlertCircle size={20} className="mx-auto mb-2" />
            <div>{t('manufacturing.recipesLoadError')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <ClipboardList size={32} className="mx-auto mb-3 opacity-30" />
            <div className="text-sm font-medium mb-1">{t('manufacturing.noRecipes')}</div>
            <div className="text-xs mb-4">{t('manufacturing.createFirstRecipe')}</div>
            <Button asChild className="inline-flex items-center gap-1.5 text-sm">
              <Link href="/uretim/receteler/yeni">
                <Plus size={14} /> {t('manufacturing.newRecipe')}
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-6" />
                {[
                  { key: 'product', label: t('manufacturing.product') },
                  { key: 'revision', label: t('manufacturing.revision') },
                  { key: 'materials', label: t('manufacturing.materialCount') },
                  { key: 'status', label: t('common.status') },
                  { key: 'created', label: t('manufacturing.created') },
                  { key: 'actions', label: t('common.actions') },
                ].map(h => (
                  <TableHead key={h.key} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(bom => (
                <BomRow key={bom.id} bom={bom} onDeactivate={id => deactivate.mutate(id)} />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

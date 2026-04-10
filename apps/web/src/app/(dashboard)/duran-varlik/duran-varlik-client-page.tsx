"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Layers,
  Package,
  BarChart3,
  CheckCircle2,
  TrendingDown,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
  Info,
  XCircle,
  ChevronsLeft,
  ChevronLeft,
  ChevronsRight,
} from "lucide-react";
import { assetApi } from "@/services/asset";
import { formatCurrency, formatDate, kurusToTl } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DateInput } from '@/components/ui/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  buildDuranVarlikColumns,
  CATEGORY_LABELS,
  type FixedAsset,
  type AssetDepreciation,
} from "./duran-varlik-table";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const deprPct = (asset: FixedAsset) => {
  const cost = Number(asset.acquisitionCostKurus);
  if (!cost) return 0;
  return Math.min(
    Math.round((Number(asset.accumulatedDepreciationKurus) / cost) * 100),
    100,
  );
};

const STATUS_CONFIG: Record<
  FixedAsset["status"],
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  AKTIF:            { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
  TAMAMEN_AMORTIZE: { variant: "outline",   className: "text-muted-foreground" },
  ELDEN_CIKARILDI:  { variant: "destructive" },
};

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function DuranVarlikClientPage() {
  const { t } = useI18n();
  const columns = useMemo(() => buildDuranVarlikColumns(t), [t]);

  // ── Tablo state ────────────────────────────────────────────────────────────
  const [search,          setSearch         ] = useState("");
  const [statusFilter,    setStatusFilter   ] = useState("all");
  const [categoryFilter,  setCategoryFilter ] = useState("all");
  const [page,            setPage           ] = useState(1);
  const [limit,           setLimit          ] = useState(20);
  const [data,            setData           ] = useState<FixedAsset[]>([]);
  const [total,           setTotal          ] = useState(0);
  const [loading,         setLoading        ] = useState(true);
  const [expandedId,      setExpandedId     ] = useState<string | null>(null);
  const [disposeAsset,    setDisposeAsset   ] = useState<FixedAsset | null>(null);
  const [toast,           setToast          ] = useState<{ text: string; ok: boolean } | null>(null);

  // ── KPI state ──────────────────────────────────────────────────────────────
  const [kpiAktif,          setKpiAktif         ] = useState(0);
  const [kpiToplamMaliyet,  setKpiToplamMaliyet ] = useState(0);
  const [kpiNetDefter,      setKpiNetDefter     ] = useState(0);
  const [kpiYillikAmortisman, setKpiYillikAmortisman] = useState(0);

  // ── KPI fetch (mount'ta bir kez) ───────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      assetApi.list({ limit: 500 }).catch(() => ({ data: { data: [], total: 0 } })),
      assetApi.preview().catch(() => ({ data: [] })),
    ]).then(([listRes, previewRes]) => {
      const items: FixedAsset[] = (listRes.data as { data: FixedAsset[]; total: number }).data ?? [];
      const aktif = items.filter((a) => a.status === "AKTIF");
      setKpiAktif(aktif.length);
      setKpiToplamMaliyet(items.reduce((s, a) => s + Number(a.acquisitionCostKurus), 0));
      setKpiNetDefter(aktif.reduce((s, a) => s + Number(a.bookValueKurus), 0));
      const preview = (previewRes.data ?? []) as Array<{ estimated: number }>;
      setKpiYillikAmortisman(preview.reduce((s, p) => s + p.estimated, 0));
    });
  }, []);

  // ── Tablo fetch (debounced) ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await assetApi.list({
          // @ts-expect-error — backend search desteği henüz yok (eksik_filtreler.md)
          search:   search || undefined,
          status:   statusFilter   !== "all" ? statusFilter   : undefined,
          category: categoryFilter !== "all" ? categoryFilter : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        const payload = res.data as { data: FixedAsset[]; total: number };
        setData(payload.data ?? []);
        setTotal(payload.total ?? 0);
      } catch {
        setData([]); setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter, categoryFilter, page, limit]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* 1. Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("finance.fixedAssets.title")}
          </h1>
          <span className="text-sm text-muted-foreground">{total} {t("finance.fixedAssets.pagination.records")}</span>
        </div>
        <Button asChild>
          <Link href="/duran-varlik/yeni">
            <Plus className="h-4 w-4 mr-2" />
            {t("finance.fixedAssets.newAsset")}
          </Link>
        </Button>
      </div>

      {/* 2. KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Package className="h-4 w-4" />
              {t("finance.fixedAssets.activeAssets")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiAktif}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <BarChart3 className="h-4 w-4" />
              {t("finance.fixedAssets.totalCost")}
            </div>
            <p className="text-3xl font-bold text-foreground">
              {formatCurrency(kurusToTl(kpiToplamMaliyet))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <CheckCircle2 className="h-4 w-4" />
              {t("finance.fixedAssets.netBookValue")}
            </div>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(kurusToTl(kpiNetDefter))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <TrendingDown className="h-4 w-4" />
              {t("finance.fixedAssets.annualDepreciation")}
            </div>
            <p className="text-3xl font-bold text-destructive">
              {formatCurrency(kurusToTl(kpiYillikAmortisman))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Arama + Filtreler (CARD DIŞINDA) */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("finance.fixedAssets.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("finance.fixedAssets.filter.placeholder.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("finance.fixedAssets.filter.status.all")}</SelectItem>
            <SelectItem value="AKTIF">{t("finance.fixedAssets.filter.status.AKTIF")}</SelectItem>
            <SelectItem value="TAMAMEN_AMORTIZE">{t("finance.fixedAssets.filter.status.TAMAMEN_AMORTIZE")}</SelectItem>
            <SelectItem value="ELDEN_CIKARILDI">{t("finance.fixedAssets.filter.status.ELDEN_CIKARILDI")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("finance.fixedAssets.filter.placeholder.category")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("finance.fixedAssets.filter.category.all")}</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 4. DataTable Kartı */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {columns.map((col) => (
                    <TableHead
                      key={col.id}
                      className={cn("font-semibold", col.className)}
                    >
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={columns.length} className="py-2">
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-40 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Layers className="h-8 w-8 opacity-20" />
                        <p className="text-sm">{t("finance.fixedAssets.noAssets")}</p>
                        <p className="text-xs opacity-60">{t("finance.fixedAssets.noAssetsHint")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((asset) => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      isExpanded={expandedId === asset.id}
                      colCount={columns.length}
                      onToggle={() =>
                        setExpandedId(expandedId === asset.id ? null : asset.id)
                      }
                      onDispose={() => setDisposeAsset(asset)}
                      t={t}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Pagination Barı (CARD DIŞINDA) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("finance.fixedAssets.pagination.records")}</span>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("finance.fixedAssets.pagination.perPage")}</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-8 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span>{page} / {pageCount}</span>

          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(1)} disabled={page === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p - 1)} disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(pageCount)} disabled={page >= pageCount}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Elden çıkarma modalı */}
      {disposeAsset && (
        <DisposeModal
          asset={disposeAsset}
          open={!!disposeAsset}
          onClose={() => setDisposeAsset(null)}
          onSuccess={() => {
            // KPI ve tabloyu yenile
            setStatusFilter((s) => s);
            setDisposeAsset(null);
            showToast(t("finance.fixedAssets.disposeSuccess"), true);
          }}
          onError={() => showToast(t("finance.fixedAssets.disposeFailed"), false)}
          t={t}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border",
            toast.ok
              ? "bg-card border-border text-foreground"
              : "bg-destructive/10 border-destructive/30 text-destructive",
          )}
        >
          {toast.ok
            ? <CheckCircle2 className="h-4 w-4 text-primary" />
            : <XCircle className="h-4 w-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ─── Varlık Satırı ────────────────────────────────────────────────────────────

function AssetRow({
  asset,
  isExpanded,
  colCount,
  onToggle,
  onDispose,
  t,
}: {
  asset:      FixedAsset;
  isExpanded: boolean;
  colCount:   number;
  onToggle:   () => void;
  onDispose:  () => void;
  t:          (key: string) => string;
}) {
  const pct        = deprPct(asset);
  const status     = STATUS_CONFIG[asset.status];
  const isDisposed = asset.status === "ELDEN_CIKARILDI";
  const barColor   = pct >= 100
    ? "bg-muted-foreground"
    : pct >= 75
      ? "bg-destructive"
      : "bg-primary";

  return (
    <>
      <TableRow
        onClick={onToggle}
        className={cn(
          "cursor-pointer transition-colors group",
          isExpanded ? "bg-muted/50" : "hover:bg-muted/40",
          isDisposed && "opacity-55",
        )}
      >
        <TableCell className="text-muted-foreground w-8 pr-0">
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </TableCell>

        <TableCell>
          <p className="text-[11px] text-muted-foreground tabular-nums">{asset.assetCode}</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">{asset.name}</p>
          {asset.location && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{asset.location}</p>
          )}
        </TableCell>

        <TableCell className="text-sm text-muted-foreground">
          {CATEGORY_LABELS[asset.category]}
        </TableCell>

        <TableCell className="text-sm text-muted-foreground tabular-nums">
          {formatDate(asset.acquisitionDate)}
        </TableCell>

        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
          {formatCurrency(kurusToTl(Number(asset.acquisitionCostKurus)))}
        </TableCell>

        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
          {formatCurrency(kurusToTl(Number(asset.accumulatedDepreciationKurus)))}
        </TableCell>

        <TableCell className="text-right text-sm font-bold text-primary tabular-nums">
          {formatCurrency(kurusToTl(Number(asset.bookValueKurus)))}
        </TableCell>

        <TableCell className="w-28">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
            <span className="tabular-nums">%{pct}</span>
            <span className="tabular-nums">{asset.usefulLifeYears}y</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-300", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </TableCell>

        <TableCell className="text-center">
          <Badge
            variant={status.variant}
            className={cn(
              "text-[10px] font-semibold px-2 py-0 uppercase tracking-wider",
              status.className,
            )}
          >
            {t(`finance.fixedAssets.statusLabels.${asset.status}`)}
          </Badge>
        </TableCell>

        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" asChild className="size-7">
              <Link href={`/duran-varlik/${asset.id}`}>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            </Button>
            {!isDisposed && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onDispose}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={colCount} className="p-0">
            <DepreciationPanel assetId={asset.id} t={t} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Amortisman Geçmişi Paneli ────────────────────────────────────────────────

function DepreciationPanel({
  assetId,
  t,
}: {
  assetId: string;
  t:       (key: string) => string;
}) {
  const [history, setHistory] = useState<AssetDepreciation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    assetApi.depreciation(assetId)
      .then((r) => setHistory((r.data ?? []) as AssetDepreciation[]))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [assetId]);

  return (
    <div className="pl-14 pr-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("finance.fixedAssets.depreciationHistory")}
        </span>
      </div>

      {loading ? (
        <div className="h-8 bg-muted/50 rounded-md animate-pulse" />
      ) : history.length === 0 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          {t("finance.fixedAssets.noDepreciation")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("common.year")}</TableHead>
                <TableHead className="text-right text-xs">{t("finance.fixedAssets.cost")}</TableHead>
                <TableHead className="text-right text-xs">{t("finance.fixedAssets.openingValue")}</TableHead>
                <TableHead className="text-right text-xs">{t("finance.fixedAssets.closingValue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id} className="hover:bg-muted/30">
                  <TableCell className="text-sm font-semibold tabular-nums text-muted-foreground py-2">
                    {h.year}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-destructive py-2">
                    {formatCurrency(kurusToTl(Number(h.depreciationKurus)))}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground py-2">
                    {formatCurrency(kurusToTl(Number(h.openingBookValueKurus)))}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-primary py-2">
                    {formatCurrency(kurusToTl(Number(h.closingBookValueKurus)))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Elden Çıkarma Modalı ─────────────────────────────────────────────────────

function DisposeModal({
  asset,
  open,
  onClose,
  onSuccess,
  onError,
  t,
}: {
  asset:     FixedAsset;
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
  onError:   () => void;
  t:         (key: string) => string;
}) {
  const [form, setForm] = useState({
    disposalDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [isPending, setIsPending] = useState(false);

  async function handleDispose() {
    setIsPending(true);
    try {
      await assetApi.dispose(asset.id, { disposalDate: form.disposalDate, notes: form.notes });
      onSuccess();
    } catch {
      onError();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            {t("finance.fixedAssets.disposeAsset")}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
          <p className="text-xs text-muted-foreground">{t("common.name")}</p>
          <p className="text-sm font-semibold text-foreground">{asset.name}</p>
          <p className="text-xs tabular-nums text-muted-foreground">{asset.assetCode}</p>
          <p className="text-sm tabular-nums text-primary mt-1 font-medium">
            {t("finance.fixedAssets.netBookValue")}:{" "}
            {formatCurrency(kurusToTl(Number(asset.bookValueKurus)))}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.disposalDate")}
            </Label>
            <DateInput
              className="h-9"
              value={form.disposalDate}
              onChange={(e) => setForm((f) => ({ ...f, disposalDate: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.reasonNotes")}
            </Label>
            <Input
              className="h-9"
              placeholder={t("common.notes")}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-2"
            disabled={isPending}
            onClick={handleDispose}
          >
            {t("finance.fixedAssets.dispose")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

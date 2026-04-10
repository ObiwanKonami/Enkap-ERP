"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Package, AlertTriangle, Layers, Plus,
  ArrowDownToLine, FileSpreadsheet, TrendingDown, Search,
  ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
} from "lucide-react";
import { stockApi } from "@/services/stock";
import { useI18n } from "@/hooks/use-i18n";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency, kurusToTl } from "@/lib/format";
import { BarkodArama } from "./barkod-arama";
import { buildStokColumns, type StokUrun } from "./stok-table";

// ─── Yardımcı: ham Product → StokUrun ────────────────────────────────────────

function normalize(p: unknown): StokUrun {
  const prod = p as Record<string, unknown>;
  return {
    ...prod,
    categoryName:
      (prod.category as { name: string } | null)?.name ??
      (prod.categoryName as string | undefined),
  } as StokUrun;
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function StokClientPage() {
  const { t } = useI18n();
  const columns = useMemo(() => buildStokColumns(t), [t]);

  // ── Tablo state ───────────────────────────────────────────────────────────
  const [search,      setSearch     ] = useState("");
  const [stockFilter, setStockFilter] = useState("all"); // all | kritik | normal
  const [page,        setPage       ] = useState(1);
  const [limit,       setLimit      ] = useState(20);
  const [data,        setData       ] = useState<StokUrun[]>([]);
  const [total,       setTotal      ] = useState(0);
  const [loading,     setLoading    ] = useState(true);

  // ── KPI state ─────────────────────────────────────────────────────────────
  const [kpiTotal,     setKpiTotal    ] = useState(0);
  const [kpiStokDeger, setKpiStokDeger] = useState(0);
  const [kpiKategori,  setKpiKategori ] = useState(0);
  const [kpiKritik,    setKpiKritik   ] = useState(0);

  // ── KPI fetch (mount'ta bir kez) ──────────────────────────────────────────
  useEffect(() => {
    stockApi.products
      .list({ limit: 500 })
      .then((res) => {
        const items = (res.data?.data ?? []).map(normalize);
        setKpiTotal(res.data?.total ?? items.length);
        setKpiStokDeger(
          items.reduce(
            (s, u) => s + (Number(u.totalStockQty) * Number(u.avgUnitCostKurus)) / 100,
            0,
          ),
        );
        setKpiKategori(
          new Set(items.map((u) => u.categoryName).filter(Boolean)).size,
        );
        setKpiKritik(
          items.filter((u) => Number(u.totalStockQty) <= Number(u.reorderPoint)).length,
        );
      })
      .catch(() => {});
  }, []);

  // ── Tablo fetch (debounced) ───────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const res = await stockApi.products.list({
            q:        search      || undefined,
            lowStock: stockFilter === "kritik" ? true : stockFilter === "normal" ? false : undefined,
            limit,
            page,
          });
          setData((res.data?.data ?? []).map(normalize));
          setTotal(res.data?.total ?? 0);
        } catch {
          setData([]);
          setTotal(0);
        } finally {
          setLoading(false);
        }
      },
      search ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [search, stockFilter, page, limit]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* 1. Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Package className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("stock.title")}</h1>
          <span className="text-sm text-muted-foreground">
            {total} {t("stock.productTracking")}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BarkodArama />
          <Button variant="outline" size="sm" asChild className="h-9 gap-2">
            <Link href="/stok/import">
              <FileSpreadsheet size={14} /> {t("stock.bulkImport")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="h-9 gap-2">
            <Link href="/stok/hareket">
              <ArrowDownToLine size={14} /> {t("stock.enterMovement")}
            </Link>
          </Button>
          <Button size="sm" asChild className="h-9 gap-2">
            <Link href="/stok/yeni">
              <Plus size={14} /> {t("stock.newProduct")}
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Package className="h-4 w-4" />
              {t("stock.totalProducts")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiTotal}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <TrendingDown className="h-4 w-4" />
              {t("stock.stockValue")}
            </div>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(kurusToTl(kpiStokDeger))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Layers className="h-4 w-4" />
              {t("stock.categoryCount")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiKategori}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <AlertTriangle className="h-4 w-4" />
              {t("stock.criticalStock")}
            </div>
            <p className={cn("text-3xl font-bold", kpiKritik > 0 ? "text-destructive" : "text-foreground")}>
              {kpiKritik}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Kritik Stok Uyarısı */}
      {kpiKritik > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/25">
          <AlertTriangle size={15} className="text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            <span className="font-semibold">{kpiKritik} {t("stock.kritikUrunler")}</span>{" "}
            {t("stock.criticalWarning")}
          </p>
        </div>
      )}

      {/* 4. Arama + Filtreler (DataTable DIŞINDA) */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("stock.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <Select
          value={stockFilter}
          onValueChange={(v) => {
            setStockFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("stock.filter.statusPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("stock.filter.status.all")}</SelectItem>
            <SelectItem value="kritik">{t("stock.filter.status.kritik")}</SelectItem>
            <SelectItem value="normal">{t("stock.filter.status.normal")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 5. DataTable (Card içinde, sadece tablo) */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={loading ? [] : data}
            showToolbar={false}
            showFooter={false}
            totalCount={total}
            page={page}
            serverLimit={limit}
          />
        </CardContent>
      </Card>

      {/* 6. Pagination (DataTable DIŞINDA) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("stock.pagination.perPage")}</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => {
                setLimit(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <span>
            {page} / {pageCount}
          </span>

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

    </div>
  );
}

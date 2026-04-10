"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import {
  Barcode,
  Search,
  Loader2,
  X,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { stockApi } from "@/services/stock";
import type { Product } from "@/services/stock";
import { formatCurrency, fmtQty, kurusToTl } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function BarkodArama() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    setNotFound(false);
    try {
      const res = await stockApi.products.findByBarcode(q);
      setResult(res.data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setQuery("");
    setResult(null);
    setNotFound(false);
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-9 gap-1.5">
        <Barcode size={14} />
        {t("stock.barcodeSearch")}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Barcode size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                {t("stock.barcodeSearchTitle")}
              </h2>
            </div>
            <Button variant="ghost" size="icon" onClick={() => { setOpen(false); reset(); }}>
              <X size={16} />
            </Button>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("stock.scanBarcodeHint")}
              className="flex-1 h-9 text-sm "
            />
            <Button type="submit" size="sm" disabled={loading || !query.trim()} className="h-9">
              {loading ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Search size={13} />
              )}
            </Button>
          </form>

          {notFound && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription className="text-xs">
                <span className="">{query}</span> {t("stock.barcodeNotFound")}
              </AlertDescription>
            </Alert>
          )}

          {result && (
            <div className="border border-primary/25 bg-primary/5 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {result.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">{result.sku}</p>
                </div>
                <Button variant="ghost" size="sm" asChild className="h-7 px-2.5 text-xs gap-1 shrink-0" onClick={() => setOpen(false)}>
                  <Link href={`/stok/${result.id}`}>
                    {t("common.detail")} <ExternalLink size={10} />
                  </Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    {t("stock.category")}
                  </p>
                  <p className="text-foreground font-medium mt-0.5">{result.categoryName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    {t("stock.stok")}
                  </p>
                  <p className="text-foreground font-medium mt-0.5">{fmtQty(result.totalStockQty)} {result.unitCode}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    {t("stock.listPrice")}
                  </p>
                  <p className="text-foreground font-medium mt-0.5">{formatCurrency(kurusToTl(result.listPriceKurus))}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                    {t("stock.avgCost")}
                  </p>
                  <p className="text-foreground font-medium mt-0.5">{formatCurrency(kurusToTl(result.avgUnitCostKurus))}</p>
                </div>
              </div>

              {result.totalStockQty <= result.reorderPoint && (
                <p className="text-[10px] text-destructive font-medium">
                  ⚠ {t("stock.kritikStokSeviyesi")} ({t("stock.siparisNoktasi")} {result.reorderPoint})
                </p>
              )}
            </div>
          )}

          {!result && !notFound && (
            <p className="text-[10px] text-muted-foreground text-center">
              {t("stock.scanBarcodeHint")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
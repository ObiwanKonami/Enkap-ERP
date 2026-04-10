"use client";

import Link from "next/link";
import { Package, AlertTriangle, ExternalLink } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, fmtQty, kurusToTl } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Tip ──────────────────────────────────────────────────────────────────────

export interface StokUrun {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  categoryName?: string;
  unitCode: string;
  totalStockQty: number;
  reorderPoint: number;
  listPriceKurus: number;
  avgUnitCostKurus: number;
  costMethod: "FIFO" | "AVG";
  warehouseName?: string;
}

// ─── Kolon tanımları ──────────────────────────────────────────────────────────

export function buildStokColumns(t: (k: string) => string): ColumnDef<StokUrun, unknown>[] {
  return [
    {
      accessorKey: "sku",
      header: t("stock.sku"),
      size: 100,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-medium tabular-nums">
          {row.original.sku}
        </span>
      ),
    },
    {
      accessorKey: "name",
      header: t("stock.product"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Package size={13} className="text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">
              {row.original.name}
            </p>
            {row.original.barcode && (
              <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                {row.original.barcode}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "categoryName",
      header: t("stock.category"),
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.categoryName ?? <span className="opacity-40">–</span>}
        </span>
      ),
    },
    {
      accessorKey: "totalStockQty",
      header: t("stock.stok"),
      size: 120,
      cell: ({ row }) => {
        const { unitCode } = row.original;
        const qty    = Number(row.original.totalStockQty);
        const rp     = Number(row.original.reorderPoint);
        const kritik = qty <= rp;
        const pct    = rp > 0 ? Math.min((qty / rp) * 100, 200) : 100;
        const barColor = kritik
          ? "bg-destructive"
          : pct < 120
            ? "bg-primary/50"
            : "bg-primary";

        return (
          <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-1">
              <div className="h-1 rounded-full mb-1 overflow-hidden bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", barColor)}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    kritik ? "text-destructive" : "text-foreground",
                  )}
                >
                  {fmtQty(qty)}
                </span>
                <span className="text-[11px] text-muted-foreground">{unitCode}</span>
              </div>
            </div>
            {kritik && <AlertTriangle size={13} className="text-destructive shrink-0" />}
          </div>
        );
      },
    },
    {
      accessorKey: "reorderPoint",
      header: t("stock.minStock"),
      size: 80,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmtQty(row.original.reorderPoint)}
        </span>
      ),
    },
    {
      accessorKey: "listPriceKurus",
      header: t("stock.listPrice"),
      size: 120,
      cell: ({ row }) => (
        <span className="text-sm font-medium text-foreground tabular-nums">
          {formatCurrency(kurusToTl(row.original.listPriceKurus))}
        </span>
      ),
    },
    {
      accessorKey: "avgUnitCostKurus",
      header: t("stock.avgCost"),
      size: 130,
      cell: ({ row }) => {
        const satis   = Number(row.original.listPriceKurus);
        const maliyet = Number(row.original.avgUnitCostKurus);
        const showMargin = satis > 0 && maliyet > 0;
        const margin  = showMargin ? ((satis - maliyet) / satis) * 100 : 0;

        return (
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatCurrency(kurusToTl(maliyet))}
            </span>
            {showMargin && (
              <span
                className={cn(
                  "text-[11px] tabular-nums font-medium",
                  margin >= 15 ? "text-primary" : "text-destructive",
                )}
              >
                %{margin.toFixed(0)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "costMethod",
      header: t("stock.costMethod_label"),
      size: 80,
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0"
        >
          {row.original.costMethod}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      size: 48,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Link href={`/stok/${row.original.id}`}>
            <ExternalLink size={13} className="text-muted-foreground" />
          </Link>
        </Button>
      ),
    },
  ];
}

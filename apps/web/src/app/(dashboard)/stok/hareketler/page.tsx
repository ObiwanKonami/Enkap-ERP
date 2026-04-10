"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  SlidersHorizontal,
  Loader2,
  Filter,
  XCircle,
} from "lucide-react";
import { stockApi, type StockMovement } from "@/services/stock";
import { formatDateTime, formatCurrency, fmtQty } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

const LIMIT = 20;

function getTypeMeta(t: (key: string) => string) {
  return {
    GIRIS:      { label: t("stock.movementType.GIRIS"), icon: <ArrowDownToLine size={11} />,   variant: "default" as const, valueClass: "text-foreground" },
    CIKIS:      { label: t("stock.movementType.CIKIS"), icon: <ArrowUpFromLine size={11} />,   variant: "destructive" as const, valueClass: "text-destructive" },
    TRANSFER:   { label: t("stock.movement"),           icon: <RefreshCw size={11} />,          variant: "secondary" as const, valueClass: "text-muted-foreground" },
    SAYIM:      { label: t("stock.sayim"),              icon: <SlidersHorizontal size={11} />, variant: "secondary" as const, valueClass: "text-muted-foreground" },
    IADE_GIRIS: { label: t("stock.iadeGiris"),          icon: <ArrowDownToLine size={11} />,   variant: "default" as const, valueClass: "text-foreground" },
    IADE_CIKIS: { label: t("stock.iadeCikis"),          icon: <ArrowUpFromLine size={11} />,   variant: "destructive" as const, valueClass: "text-destructive" },
    FIRE:       { label: t("stock.fireLabel"),          icon: <XCircle size={11} />,            variant: "outline" as const, valueClass: "text-muted-foreground" },
  };
}

const TYPE_KEYS = ["GIRIS", "CIKIS", "TRANSFER", "SAYIM", "IADE_GIRIS", "IADE_CIKIS", "FIRE"];

export default function StokHareketleriPage() {
  const { t }        = useI18n();
  const typeMeta     = getTypeMeta(t);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page,       setPage]       = useState(1);

  function changeType(key: string) {
    setTypeFilter(key);
    setPage(1);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["stock-movements", typeFilter, page],
    queryFn: () =>
      stockApi.movements
        .list({
          limit:  LIMIT,
          offset: (page - 1) * LIMIT,
          type:   typeFilter !== "ALL" ? (typeFilter as StockMovement["type"]) : undefined,
        })
        .then((r) => r.data)
        .catch(() => ({ data: [] as StockMovement[], total: 0 })),
  });

  const movements  = data?.data  ?? [];
  const total      = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/stok"><ArrowLeft size={16} /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <RefreshCw size={20} className="text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("stock.hareketTarihceTitle")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("stock.allWarehousesMovements")}
              </p>
            </div>
          </div>
        </div>
        <Button size="sm" asChild className="h-9 gap-2 shadow-sm">
          <Link href="/stok/hareket">
            <ArrowDownToLine size={14} /> {t("stock.yeniHareket")}
          </Link>
        </Button>
      </div>

      {/* Filtre Şeridi */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-muted-foreground" />
        <div className="flex bg-muted/40 rounded-lg p-1 border border-border gap-1 flex-wrap">
          <button
            onClick={() => changeType("ALL")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-all",
              typeFilter === "ALL"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("stock.tum")}
          </button>
          {TYPE_KEYS.map((key) => {
            const meta   = typeMeta[key as keyof typeof typeMeta];
            const active = typeFilter === key;
            return (
              <button
                key={key}
                onClick={() => changeType(active ? "ALL" : key)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all gap-1 flex items-center",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {meta.icon}
                {meta.label}
              </button>
            );
          })}
        </div>
        {typeFilter !== "ALL" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground gap-1"
            onClick={() => changeType("ALL")}
          >
            <XCircle size={12} /> {t("stock.clearFilter")}
          </Button>
        )}
      </div>

      {/* Tablo */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading && movements.length === 0 ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : movements.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t("stock.hareketBulunamadi")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="font-semibold whitespace-nowrap">{t("common.date")}</TableHead>
                    <TableHead className="font-semibold">{t("stock.movementTypeSection")}</TableHead>
                    <TableHead className="font-semibold">{t("stock.product")}</TableHead>
                    <TableHead className="font-semibold">{t("stock.warehouse")}</TableHead>
                    <TableHead className="text-right font-semibold">{t("stock.quantity")}</TableHead>
                    <TableHead className="text-right font-semibold">{t("stock.totalCost")}</TableHead>
                    <TableHead className="font-semibold">{t("stock.referansNot")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => {
                    const meta = typeMeta[m.type as keyof typeof typeMeta] ?? {
                      label: m.type, icon: null,
                      variant: "outline" as const,
                      valueClass: "text-muted-foreground",
                    };
                    const totalCost = m.totalCostKurus
                      ? m.totalCostKurus / 100
                      : (m.quantity * m.unitCostKurus) / 100;

                    return (
                      <TableRow key={m.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap py-2.5">
                          {formatDateTime(m.createdAt)}
                        </TableCell>

                        <TableCell className="py-2.5">
                          <Badge
                            variant={meta.variant}
                            className="gap-1 text-[10px] font-semibold"
                          >
                            {meta.icon}
                            {meta.label}
                          </Badge>
                        </TableCell>

                        <TableCell className="py-2.5">
                          <Link
                            href={`/stok/${m.productId}`}
                            className="text-sm text-foreground hover:text-primary transition-colors"
                          >
                            {m.product?.name ?? m.productId}
                          </Link>
                        </TableCell>

                        <TableCell className="py-2.5 text-sm text-muted-foreground">
                          {m.warehouse ? (
                            <Link
                              href={`/depo/${m.warehouseId}`}
                              className="hover:text-primary transition-colors"
                            >
                              {m.warehouse.name}
                            </Link>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                        </TableCell>

                        <TableCell className={cn("text-right py-2.5 font-semibold tabular-nums", meta.valueClass)}>
                          {fmtQty(Number(m.quantity))}
                          {m.product?.unitCode && (
                            <span className="text-[11px] text-muted-foreground font-normal ml-1">
                              {m.product.unitCode}
                            </span>
                          )}
                        </TableCell>

                        <TableCell className="text-right py-2.5 text-sm tabular-nums text-muted-foreground">
                          {formatCurrency(totalCost)}
                        </TableCell>

                        <TableCell className="py-2.5 text-xs text-muted-foreground max-w-[180px]">
                          {m.referenceId ? (
                            <span className="tabular-nums">
                              {m.referenceType?.replace(/_/g, " ")} · {m.referenceId}
                            </span>
                          ) : m.notes ? (
                            <span className="italic">{m.notes}</span>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} {t("common.record")}
          </span>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p     = start + i;
                return (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === page}
                      onClick={() => setPage(p)}
                      className="cursor-pointer"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-disabled={page === totalPages}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
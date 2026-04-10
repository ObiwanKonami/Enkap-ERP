"use client";

import Link from "next/link";
import { FileText, ArrowUpRight, ArrowDownLeft, ExternalLink } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, kurusToTl } from "@/lib/format";
import { cn } from "@/lib/utils";

// ─── Tip ──────────────────────────────────────────────────────────────────────

export interface Fatura {
  id: string;
  invoiceNumber: string;
  invoiceType: "E_FATURA" | "E_ARSIV" | "PURCHASE" | "PROFORMA";
  direction: "OUT" | "IN";
  status:
    | "DRAFT"
    | "PENDING_GIB"
    | "SENT_GIB"
    | "ACCEPTED_GIB"
    | "REJECTED_GIB"
    | "CANCELLED";
  customerName?: string;
  vendorName?: string;
  issueDate: string;
  total: number;
  currency: string;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<
  Fatura["status"],
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  DRAFT:        { variant: "outline" },
  PENDING_GIB:  { variant: "secondary" },
  SENT_GIB:     { variant: "secondary", className: "bg-primary/10 text-primary hover:bg-primary/20 border-transparent" },
  ACCEPTED_GIB: { variant: "default" },
  REJECTED_GIB: { variant: "destructive" },
  CANCELLED:    { variant: "outline", className: "text-muted-foreground" },
};

const TYPE_CLS: Record<Fatura["invoiceType"], string> = {
  E_FATURA: "bg-primary/10 text-primary hover:bg-primary/20 border-primary/20",
  E_ARSIV:  "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent",
  PURCHASE: "bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20",
  PROFORMA: "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent",
};

// ─── Kolon tanımları ──────────────────────────────────────────────────────────

export function buildFaturaColumns(t: (k: string) => string): ColumnDef<Fatura, unknown>[] {
  return [
    {
      accessorKey: "invoiceNumber",
      header: t("invoice.number"),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium tabular-nums text-foreground">
            {row.original.invoiceNumber}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "direction",
      header: t("invoice.direction"),
      cell: ({ row }) =>
        row.original.direction === "OUT" ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <ArrowUpRight size={14} /> {t("invoice.sales")}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <ArrowDownLeft size={14} /> {t("invoice.purchase")}
          </span>
        ),
    },
    {
      id: "counterparty",
      header: t("invoice.customerVendor"),
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.direction === "OUT"
            ? (row.original.customerName ?? "—")
            : (row.original.vendorName ?? "—")}
        </span>
      ),
    },
    {
      accessorKey: "invoiceType",
      header: t("common.type"),
      cell: ({ row }) => (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] font-semibold px-2 py-0 uppercase tracking-wider",
            TYPE_CLS[row.original.invoiceType],
          )}
        >
          {t(`invoice.type.${row.original.invoiceType}`)}
        </Badge>
      ),
    },
    {
      accessorKey: "issueDate",
      header: t("common.date"),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(row.original.issueDate)}
        </span>
      ),
    },
    {
      accessorKey: "total",
      header: t("common.amount"),
      cell: ({ row }) => (
        <span
          className={cn(
            "text-sm font-bold tabular-nums",
            row.original.direction === "OUT" ? "text-primary" : "text-destructive",
          )}
        >
          {row.original.direction === "OUT" ? "+" : "−"}
          {/* DB stores amounts in kuruş (integer) → convert to TL → format for display */}
          {formatCurrency(kurusToTl(Number(row.original.total)))}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => {
        const s = STATUS_CLS[row.original.status];
        return (
          <Badge
            variant={s.variant}
            className={cn(
              "text-[10px] font-semibold px-2 py-0 uppercase tracking-wider",
              s.className,
            )}
          >
            {t(`invoice.status.${row.original.status}`)}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      size: 48,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Link href={`/faturalar/${row.original.id}`}>
            <ExternalLink size={14} className="text-muted-foreground" />
          </Link>
        </Button>
      ),
    },
  ];
}

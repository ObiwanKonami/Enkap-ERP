"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatCurrency, kurusToTl, formatDate, fmtQty } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Check,
  X,
  Package,
  Truck,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { SalesOrder, SalesOrderStatus, OrderChannel } from "@/services/order";

export interface SiparisRow {
  id: string;
  soNumber: string;
  channel: OrderChannel;
  customerName: string;
  customerEmail: string | null;
  status: SalesOrderStatus;
  totalKurus: string;
  kdvKurus: string;
  orderDate: string;
  invoiceId: string | null;
  lines: {
    id: string;
    productId: string;
    productName: string;
    sku: string | null;
    quantity: string;
    shippedQuantity: string;
    unitCode: string | null;
    unitPriceKurus: string;
    kdvKurus: string;
    lineTotalKurus: string;
  }[];
  deliveryAddress: {
    city: string | null;
    district: string | null;
  } | null;
}

const STATUS_LABELS: Record<SalesOrderStatus, string> = {
  TASLAK: "Taslak",
  ONAYLANDI: "Onaylandı",
  HAZIRLANIYOR: "Hazırlanıyor",
  KISMEN_SEVK: "Kısmen Sevk",
  SEVK_EDILDI: "Sevk Edildi",
  TESLIM_EDILDI: "Teslim Edildi",
  FATURALANMIS: "Faturalanmış",
  KAPALI: "Kapalı",
  IPTAL: "İptal",
};

const STATUS_CLS: Record<SalesOrderStatus, string> = {
  TASLAK: "border-muted-foreground/40 text-muted-foreground",
  ONAYLANDI: "bg-primary/10 text-primary border-primary/20",
  HAZIRLANIYOR: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  KISMEN_SEVK: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  SEVK_EDILDI: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  TESLIM_EDILDI: "bg-green-500/10 text-green-600 border-green-500/20",
  FATURALANMIS: "bg-green-600/10 text-green-700 border-green-600/20",
  KAPALI: "bg-muted text-muted-foreground border-transparent",
  IPTAL: "bg-destructive/10 text-destructive border-destructive/20",
};

const CHANNEL_LABELS: Record<OrderChannel, string> = {
  DIREKT: "Direkt",
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  WEB: "Web",
  TELEFON: "Telefon",
};

function getShipmentProgress(order: SiparisRow): number {
  if (!order.lines.length) return 0;
  return (order.lines.reduce((s, l) => s + Math.min(1, Number(l.shippedQuantity) / Math.max(1, Number(l.quantity))), 0) / order.lines.length) * 100;
}

export function buildSiparisColumns(
  t: (key: string) => string,
  expanded: string | null,
  setExpanded: (id: string | null) => void,
  onAction: (order: SiparisRow, action: "confirm" | "pick" | "invoice" | "cancel") => void,
  onShip: (order: SiparisRow) => void
): ColumnDef<SiparisRow, unknown>[] {
  return [
    {
      id: "expand",
      header: "",
      cell: ({ row }) => {
        const order = row.original;
        const isExpanded = expanded === order.id;
        return (
          <button
            className="p-1 hover:bg-muted rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(isExpanded ? null : order.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown size={13} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={13} className="text-muted-foreground" />
            )}
          </button>
        );
      },
      size: 32,
    },
    {
      id: "soNumber",
      accessorKey: "soNumber",
      header: t("order.orderNo"),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div>
            <p className="text-xs font-semibold text-primary tabular-nums">{order.soNumber}</p>
            <p className="text-[11px] text-muted-foreground">{CHANNEL_LABELS[order.channel]}</p>
          </div>
        );
      },
    },
    {
      id: "customer",
      accessorKey: "customerName",
      header: t("order.customer"),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div>
            <p className="text-sm text-foreground">{order.customerName}</p>
            {order.customerEmail && <p className="text-[11px] text-muted-foreground">{order.customerEmail}</p>}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ getValue }) => {
        const status = getValue() as SalesOrderStatus;
        return (
          <Badge variant="outline" className={cn("text-[11px] px-2 py-0.5 font-medium", STATUS_CLS[status])}>
            {STATUS_LABELS[status]}
          </Badge>
        );
      },
    },
    {
      accessorKey: "totalKurus",
      header: t("common.amount"),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(kurusToTl(Number(order.totalKurus)))}</p>
            <p className="text-[10px] text-muted-foreground tabular-nums">{t("order.kdv")} incl.: {formatCurrency(kurusToTl(Number(order.kdvKurus)))}</p>
          </div>
        );
      },
    },
    {
      id: "shipment",
      header: t("order.shipmentProgress"),
      cell: ({ row }) => {
        const order = row.original;
        const shipPct = getShipmentProgress(order);
        return (
          <div>
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${shipPct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground tabular-nums mt-1">{Math.round(shipPct)}%</p>
          </div>
        );
      },
    },
    {
      accessorKey: "orderDate",
      header: t("order.orderDate"),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground tabular-nums">{formatDate(getValue() as string)}</span>
      ),
    },
    {
      id: "actions",
      header: t("common.actions"),
      cell: ({ row }) => {
        const order = row.original;
        const canConfirm = order.status === "TASLAK";
        const canPick = order.status === "ONAYLANDI";
        const canDeliver = ["HAZIRLANIYOR", "KISMEN_SEVK", "ONAYLANDI"].includes(order.status);
        const canInvoice = ["SEVK_EDILDI", "TESLIM_EDILDI"].includes(order.status) && !order.invoiceId;
        const canCancel = !["FATURALANMIS", "KAPALI", "IPTAL"].includes(order.status);

        return (
          <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-primary" asChild>
              <Link href={`/siparis/${order.id}`} title={t("common.detail")}><ExternalLink size={12} /></Link>
            </Button>
            {canConfirm && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                onClick={() => onAction(order, "confirm")}>
                <Check size={11} /> {t("order.approve")}
              </Button>
            )}
            {canPick && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 gap-1"
                onClick={() => onAction(order, "pick")}>
                <Package size={11} /> {t("order.prepare")}
              </Button>
            )}
            {canDeliver && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 gap-1"
                onClick={() => onShip(order)}>
                <Truck size={11} /> {t("order.ship")}
              </Button>
            )}
            {canInvoice && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 gap-1"
                onClick={() => onAction(order, "invoice")}>
                <FileText size={11} /> {t("order.createInvoice")}
              </Button>
            )}
            {canCancel && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                onClick={() => { if (confirm(t("order.cancelConfirm"))) onAction(order, "cancel"); }}>
                <X size={11} /> {t("order.cancel")}
              </Button>
            )}
          </div>
        );
      },
      size: 200,
    },
  ];
}

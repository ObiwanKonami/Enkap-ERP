"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatCurrency, kurusToTl, formatDate, fmtQty } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Send,
  Check,
  Ban,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PurchaseOrder, PurchaseOrderStatus } from "@/services/purchase";

export interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  vendorName: string;
  orderDate: string;
  totalKurus: string;
  status: PurchaseOrderStatus;
  approvedBy: string | null;
  lines: {
    id: string;
    productName: string;
    quantity: string;
    receivedQuantity: string;
    unitCode: string | null;
    unitPriceKurus: string;
    kdvRate: number;
    lineTotalKurus: string;
  }[];
  notes: string | null;
  subtotalKurus: string;
  kdvKurus: string;
}

function getStatusBadgeProps(status: PurchaseOrderStatus): {
  variant: "outline" | "secondary" | "default" | "destructive";
  className?: string;
} {
  const map: Record<PurchaseOrderStatus, { variant: "outline" | "secondary" | "default" | "destructive"; className?: string }> = {
    draft:     { variant: "outline" },
    sent:      { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
    partial:   { variant: "secondary" },
    received:  { variant: "default" },
    cancelled: { variant: "destructive" },
  };
  return map[status] ?? { variant: "outline" };
}

export function buildSatinAlmaColumns(
  t: (key: string) => string,
  expanded: string | null,
  setExpanded: (id: string | null) => void,
  onAdvance: (id: string, action: "submit" | "approve" | "cancel") => void,
  onMalKabul: (id: string) => void
): ColumnDef<PurchaseOrderRow, unknown>[] {
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
      accessorKey: "poNumber",
      header: t("purchase.orderNo"),
      cell: ({ getValue }) => (
        <span className="text-xs font-semibold text-primary tabular-nums">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "vendorName",
      header: t("purchase.vendor"),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground max-w-[160px] truncate block">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "orderDate",
      header: t("purchase.orderDate"),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "totalKurus",
      header: t("purchase.totalAmount"),
      cell: ({ getValue }) => (
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(kurusToTl(Number(getValue() as string)))}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ getValue }) => {
        const status = getValue() as PurchaseOrderStatus;
        const statusLabel = t(`purchase.status.${status}` as never) as string;
        const { variant, className } = getStatusBadgeProps(status);
        return (
          <Badge variant={variant} className={cn("text-xs px-2 py-0.5 font-medium", className)}>
            {statusLabel}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: t("common.actions"),
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" asChild>
              <Link href={`/satin-alma/${order.id}`} title={t("common.detail")}>
                <ExternalLink size={12} />
              </Link>
            </Button>
            {order.status === "draft" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                title={t("purchase.send")}
                onClick={() => onAdvance(order.id, "submit")}
              >
                <Send size={12} />
              </Button>
            )}
            {order.status === "sent" && !order.approvedBy && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-primary"
                title={t("purchase.approve")}
                onClick={() => onAdvance(order.id, "approve")}
              >
                <Check size={12} />
              </Button>
            )}
            {["sent", "partial"].includes(order.status) && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-primary"
                title={t("purchase.receive")}
                onClick={() => onMalKabul(order.id)}
              >
                <Truck size={12} />
              </Button>
            )}
            {!["received", "cancelled"].includes(order.status) && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:bg-destructive/10"
                title={t("common.cancel")}
                onClick={() => {
                  if (confirm(t("purchase.cancelConfirm"))) {
                    onAdvance(order.id, "cancel");
                  }
                }}
              >
                <Ban size={12} />
              </Button>
            )}
          </div>
        );
      },
      size: 160,
    },
  ];
}

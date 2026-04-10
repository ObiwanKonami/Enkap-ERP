"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { WaybillType, WaybillStatus } from "@/services/waybill";

export interface IrsaliyeRow {
  id: string;
  waybillNumber: string;
  type: WaybillType;
  status: WaybillStatus;
  shipDate: string;
  senderName: string;
  receiverName: string;
  gibUuid?: string;
}

const TYPE_LABELS: Record<WaybillType, string> = {
  SATIS: "Satış",
  ALIS: "Alış",
  TRANSFER: "Transfer",
  IADE: "İade",
};

const TYPE_ICONS: Record<WaybillType, React.ReactNode> = {
  SATIS: "T",
  ALIS: "A",
  TRANSFER: "T",
  IADE: "İ",
};

export function buildIrsaliyeColumns(
  t: (key: string) => string
): ColumnDef<IrsaliyeRow, unknown>[] {
  return [
    {
      accessorKey: "waybillNumber",
      header: t("waybill.tableHeaders.waybillNo"),
      cell: ({ getValue }) => (
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "type",
      header: t("waybill.tableHeaders.tur"),
      cell: ({ getValue }) => {
        const type = getValue() as WaybillType;
        return (
          <Badge variant="secondary" className="gap-1 text-[11px] font-medium">
            {TYPE_ICONS[type]} {TYPE_LABELS[type]}
          </Badge>
        );
      },
    },
    {
      accessorKey: "senderName",
      header: t("waybill.tableHeaders.gonderici"),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground max-w-[160px] truncate block">
          {(getValue() as string) || "—"}
        </span>
      ),
    },
    {
      accessorKey: "receiverName",
      header: t("waybill.tableHeaders.alici"),
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground max-w-[160px] truncate block">
          {(getValue() as string) || "—"}
        </span>
      ),
    },
    {
      accessorKey: "shipDate",
      header: t("waybill.tableHeaders.tarih"),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: t("waybill.tableHeaders.durum"),
      cell: ({ getValue }) => {
        const status = getValue() as WaybillStatus;
        return (
          <Badge variant="outline" className="text-[11px] font-medium">
            {t(`waybill.statuses.${status}` as never) as string}
          </Badge>
        );
      },
    },
    {
      id: "gibUuid",
      header: t("waybill.tableHeaders.gib"),
      cell: ({ row }) => {
        const gibUuid = row.original.gibUuid;
        return (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {gibUuid ? gibUuid.slice(0, 8) + "…" : "—"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <Button variant="ghost" size="icon" className="size-7" asChild>
            <Link href={`/irsaliyeler/${id}`}>
              <ChevronRight size={13} className="text-muted-foreground" />
            </Link>
          </Button>
        );
      },
      size: 32,
    },
  ];
}

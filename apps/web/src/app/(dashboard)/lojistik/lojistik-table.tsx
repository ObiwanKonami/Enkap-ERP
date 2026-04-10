"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { CARRIER_LABELS, SHIPMENT_STATUS_CLS, SHIPMENT_STATUS_LABELS, type ShipmentStatus, type CarrierCode, type Shipment } from "@/services/logistics";
import { RefreshCw, Download, ExternalLink, MapPin, Clock } from "lucide-react";

export interface LojistikRow {
  id: string;
  orderReference: string;
  carrier: CarrierCode;
  trackingNumber: string | null;
  recipientName: string;
  recipientCity: string;
  recipientDistrict: string | null;
  status: ShipmentStatus;
  estimatedDeliveryDate: string | null;
  lastCheckedAt: string | null;
}

function normalizeShipment(s: Shipment): LojistikRow {
  return {
    id: s.id,
    orderReference: s.orderReference,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    recipientName: s.recipientName,
    recipientCity: s.recipientCity,
    recipientDistrict: s.recipientDistrict,
    status: s.status,
    estimatedDeliveryDate: s.estimatedDeliveryDate,
    lastCheckedAt: s.lastCheckedAt,
  };
}

export function buildLojistikColumns(
  t: (key: string) => string,
  onTrack: (id: string) => void,
  isTracking: boolean,
  getLabelUrl: (id: string) => string
): ColumnDef<LojistikRow, unknown>[] {
  return [
    {
      accessorKey: "orderReference",
      header: t("logistics.orderRef"),
      cell: ({ getValue }) => (
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "carrier",
      header: t("logistics.carrier"),
      cell: ({ getValue }) => {
        const carrier = getValue() as CarrierCode;
        return (
          <span className="text-sm text-muted-foreground">
            {CARRIER_LABELS[carrier]}
          </span>
        );
      },
    },
    {
      accessorKey: "recipientName",
      header: t("logistics.recipientName"),
      cell: ({ row }) => {
        const { recipientName, recipientCity, recipientDistrict } = row.original;
        return (
          <div>
            <p className="text-sm text-foreground">{recipientName}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <MapPin size={10} />
              {recipientCity}{recipientDistrict ? ` / ${recipientDistrict}` : ""}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "trackingNumber",
      header: t("logistics.trackingNo"),
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {(getValue() as string) ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ getValue }) => {
        const status = getValue() as ShipmentStatus;
        return (
          <Badge variant="outline" className={`text-[11px] font-medium ${SHIPMENT_STATUS_CLS[status]}`}>
            {SHIPMENT_STATUS_LABELS[status]}
          </Badge>
        );
      },
    },
    {
      accessorKey: "estimatedDeliveryDate",
      header: t("logistics.estimatedDelivery"),
      cell: ({ getValue }) => {
        const date = getValue() as string | null;
        return (
          <span className="text-xs text-muted-foreground tabular-nums">
            {date ? formatDate(date) : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "lastCheckedAt",
      header: t("logistics.lastAction"),
      cell: ({ row }) => {
        const lastCheckedAt = row.original.lastCheckedAt;
        return (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {lastCheckedAt ? (
              <>
                <Clock size={11} />
                {formatDate(lastCheckedAt)}
              </>
            ) : "—"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const { id, status, trackingNumber } = row.original;
        const isTerminal = ["delivered", "failed", "returned"].includes(status);
        return (
          <div className="flex items-center gap-1.5">
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] gap-1"
                onClick={() => onTrack(id)}
                disabled={isTracking}
              >
                {!isTracking && <RefreshCw size={11} />}
                Takip
              </Button>
            )}
            {trackingNumber && (
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px] gap-1" asChild>
                <a href={getLabelUrl(id)} target="_blank" rel="noreferrer">
                  <Download size={11} /> Etiket
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-primary" asChild>
              <Link href={`/lojistik/${id}`} onClick={(e) => e.stopPropagation()}>
                <ExternalLink size={11} />
              </Link>
            </Button>
          </div>
        );
      },
      size: 200,
    },
  ];
}

export { normalizeShipment };

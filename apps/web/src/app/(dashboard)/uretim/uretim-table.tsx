"use client";

import React from "react";
import type { WorkOrder, WorkOrderStatus, WorkOrderOperation } from "@/services/manufacturing";
import { WO_STATUS_LABELS } from "@/services/manufacturing";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronRight, Check, Play, X, ExternalLink } from "lucide-react";
import Link from "next/link";

export interface UretimRow {
  id: string;
  woNumber: string;
  productName: string;
  status: WorkOrderStatus;
  targetQuantity: number;
  producedQuantity: number;
  plannedStartDate: string;
  operations: WorkOrderOperation[];
}

function normalizeWorkOrder(w: WorkOrder): UretimRow {
  return {
    id: w.id,
    woNumber: w.woNumber,
    productName: w.productName,
    status: w.status,
    targetQuantity: w.targetQuantity,
    producedQuantity: w.producedQuantity,
    plannedStartDate: w.plannedStartDate,
    operations: w.operations ?? [],
  };
}

const STATUS_BADGE_CLS: Record<WorkOrderStatus, string> = {
  TASLAK:     "bg-muted text-muted-foreground border-transparent",
  PLANLI:     "bg-primary/10 text-primary border-transparent",
  URETIMDE:   "bg-amber-500/10 text-amber-500 border-transparent",
  TAMAMLANDI: "bg-primary/10 text-primary border-transparent",
  IPTAL:      "bg-destructive/10 text-destructive border-transparent",
};

const OP_STATUS_CLS = (s: string) =>
  s === "TAMAMLANDI" ? "text-primary" : s === "DEVAM" ? "text-amber-500" : "text-muted-foreground";

interface WoRowProps {
  wo: UretimRow;
  onRefresh: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
  onConfirm: (id: string) => void;
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
  onShowComplete: (wo: UretimRow) => void;
  t: (key: string) => string;
}

export function UretimWoRow({ wo, onRefresh, onToast, onConfirm, onStart, onCancel, onShowComplete, t }: WoRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  
  const pct = wo.targetQuantity > 0
    ? (wo.producedQuantity / wo.targetQuantity) * 100
    : 0;

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="w-8 py-2.5 text-muted-foreground">
          <ChevronRight size={13} className={cn("transition-transform", expanded && "rotate-90")} />
        </td>

        <td className="py-2.5">
          <span className="text-xs font-semibold text-primary tabular-nums">{wo.woNumber}</span>
        </td>

        <td className="py-2.5 text-sm text-foreground">{wo.productName}</td>

        <td className="py-2.5">
          <Badge variant="secondary" className={cn("text-[11px] font-medium", STATUS_BADGE_CLS[wo.status])}>
            {WO_STATUS_LABELS[wo.status]}
          </Badge>
        </td>

        <td className="py-2.5 text-right text-sm tabular-nums text-foreground">
          {wo.targetQuantity}
        </td>

        <td className="py-2.5">
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-primary" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-1">{Math.round(pct)}%</p>
        </td>

        <td className="py-2.5 text-xs text-muted-foreground tabular-nums">
          {formatDate(wo.plannedStartDate)}
        </td>

        <td className="py-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-primary" asChild>
              <Link href={`/uretim/${wo.id}`} title="Detay"><ExternalLink size={12} /></Link>
            </Button>
            {wo.status === "TASLAK" && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                onClick={() => onConfirm(wo.id)}>
                <Check size={11} /> {t("manufacturing.confirm")}
              </Button>
            )}
            {wo.status === "PLANLI" && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                onClick={() => onStart(wo.id)}>
                <Play size={11} /> {t("manufacturing.start")}
              </Button>
            )}
            {wo.status === "URETIMDE" && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-primary hover:bg-primary/10 gap-1"
                onClick={() => onShowComplete(wo)}>
                <Check size={11} /> {t("manufacturing.complete")}
              </Button>
            )}
            {!["TAMAMLANDI", "IPTAL"].includes(wo.status) && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 gap-1"
                onClick={() => { if (confirm(t("manufacturing.confirmCancel"))) onCancel(wo.id); }}>
                <X size={11} /> {t("manufacturing.cancel")}
              </Button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="p-0 bg-muted/10 border-b">
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {t("manufacturing.operations")}
              </p>
              {wo.operations?.length ? (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-muted-foreground">
                      {["#", t("manufacturing.operation"), t("manufacturing.workCenter"), `${t("manufacturing.plan")} (${t("manufacturing.minutes")})`, `${t("manufacturing.actual")} (${t("manufacturing.minutes")})`, t("common.status")]
                        .map((h, i) => (
                          <th key={i} className={cn("py-1.5 font-semibold text-[10px] uppercase tracking-wider", i >= 3 ? "text-right" : "text-left")}>{h}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wo.operations.map((op) => (
                      <tr key={op.id} className="border-t border-border/30 text-muted-foreground">
                        <td className="py-1.5 tabular-nums">{op.sequence}</td>
                        <td className="py-1.5">{op.operationName}</td>
                        <td className="py-1.5 text-muted-foreground/60">{op.workCenter ?? "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{op.plannedDurationMinutes}</td>
                        <td className={cn("py-1.5 text-right tabular-nums", op.actualDurationMinutes != null ? "text-foreground" : "")}>
                          {op.actualDurationMinutes ?? "—"}
                        </td>
                        <td className={cn("py-1.5 text-[11px]", OP_STATUS_CLS(op.status))}>{op.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground">{t("manufacturing.noOperations")}</p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export { normalizeWorkOrder };

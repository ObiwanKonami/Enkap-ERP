"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/format";
import { CheckCircle2, XCircle, Loader2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type LeaveType = "annual" | "sick" | "maternity" | "paternity" | "unpaid" | "administrative";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface IzinRow {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: LeaveStatus;
}

const LEAVE_TYPE_CONFIG: Record<LeaveType, { label: string; variant: "default" | "secondary" | "outline" }> = {
  annual:         { label: 'Yıllık',   variant: "default" },
  sick:           { label: 'Hastalık', variant: "secondary" },
  maternity:      { label: 'Doğum',    variant: "secondary" },
  paternity:      { label: 'Babalık',  variant: "secondary" },
  unpaid:         { label: 'Ücretsiz', variant: "outline" },
  administrative: { label: 'İdari',    variant: "secondary" },
};

const STATUS_CONFIG: Record<LeaveStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: 'Bekliyor',   variant: "secondary" },
  approved:  { label: 'Onaylandı', variant: "default" },
  rejected:  { label: 'Reddedildi', variant: "destructive" },
  cancelled: { label: 'İptal',      variant: "outline" },
};

interface LeaveActionsParams {
  id: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}

function LeaveActionsCell({ id, onApprove, onReject, isPending }: LeaveActionsParams) {
  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={isPending}
        size="sm"
        variant="outline"
        onClick={() => onApprove(id)}
        className="h-7 px-2.5 text-[10px] font-semibold uppercase tracking-wider gap-1.5"
      >
        {isPending ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
        Onayla
      </Button>
      <Button
        disabled={isPending}
        size="sm"
        variant="destructive"
        onClick={() => onReject(id)}
        className="h-7 px-2.5 text-[10px] font-semibold uppercase tracking-wider gap-1.5"
      >
        {isPending ? <Loader2 size={12} className="animate-spin"/> : <XCircle size={12}/>}
        Reddet
      </Button>
    </div>
  );
}

export function buildIzinColumns(
  t: (key: string) => string,
  onApprove: (id: string) => void,
  onReject: (id: string) => void,
  pendingActionId: string | null,
): ColumnDef<IzinRow, unknown>[] {
  return [
    {
      id: 'employee',
      header: t('hr.tableEmployee') || 'Çalışan',
      accessorFn: (row) => row.employeeName,
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground tracking-tight group-hover:text-primary transition-colors">
            {row.original.employeeName}
          </span>
          {row.original.reason && (
            <div className="flex items-center gap-1.5 group/reason cursor-help" title={row.original.reason}>
              <Info size={11} className="text-muted-foreground/40 shrink-0" />
              <span className="text-[10px] font-medium text-muted-foreground/60 truncate max-w-[240px]">
                {row.original.reason}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'leaveType',
      header: t('hr.leaveType') || 'İzin Türü',
      cell: ({ row }) => {
        const typeCfg = LEAVE_TYPE_CONFIG[row.original.leaveType] ?? LEAVE_TYPE_CONFIG.annual;
        return (
          <Badge variant={typeCfg.variant} className="text-[9px] font-semibold uppercase tracking-wider h-5 px-1.5">
            {typeCfg.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'startDate',
      header: t('hr.startDate') || 'Başlangıç',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-muted-foreground tracking-tight tabular-nums">
          {formatDate(row.original.startDate)}
        </span>
      ),
    },
    {
      accessorKey: 'endDate',
      header: t('hr.endDate') || 'Bitiş',
      cell: ({ row }) => (
        <span className="text-xs font-medium text-muted-foreground tracking-tight tabular-nums">
          {formatDate(row.original.endDate)}
        </span>
      ),
    },
    {
      accessorKey: 'days',
      header: t('hr.days') || 'Gün',
      cell: ({ row }) => (
        <span className="text-sm font-bold tracking-tight text-foreground tabular-nums">
          {row.original.days}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status') || 'Durum',
      cell: ({ row }) => {
        const statusCfg = STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.pending;
        return (
          <Badge variant={statusCfg.variant} className="text-[9px] font-semibold uppercase tracking-wider h-5 px-1.5">
            {statusCfg.label}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        if (row.original.status !== 'pending') {
          return <span className="text-[10px] font-semibold text-muted-foreground opacity-30 uppercase tracking-widest pr-4">—</span>;
        }
        return (
          <div className="flex justify-end">
            <LeaveActionsCell
              id={row.original.id}
              onApprove={onApprove}
              onReject={onReject}
              isPending={pendingActionId === row.original.id}
            />
          </div>
        );
      },
    },
  ];
}

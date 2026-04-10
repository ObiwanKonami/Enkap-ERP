"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { formatCurrency, formatDate, kurusToTl } from "@/lib/format";
import { Building2, Briefcase, ExternalLink, Calendar, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalisanStatus = "ACTIVE" | "ON_LEAVE" | "TERMINATED";

export interface CalisanRow {
  id: string;
  sicilNo?: string;
  firstName: string;
  lastName: string;
  tckn: string;
  department: string;
  title: string;
  startDate: string;
  baseSalaryKurus: number;
  status: CalisanStatus;
}

function maskTckn(tckn: string): string {
  if (tckn.length !== 11) return tckn;
  return `${tckn.slice(0, 3)}******${tckn.slice(9)}`;
}

const STATUS_CONFIG: Record<CalisanStatus, { variant: "default" | "secondary" | "destructive"; cls: string }> = {
  ACTIVE:     { variant: "default", cls: "" },
  ON_LEAVE:   { variant: "secondary", cls: "" },
  TERMINATED: { variant: "destructive", cls: "" },
};

export function buildCalisanlarColumns(t: (key: string) => string): ColumnDef<CalisanRow, unknown>[] {
  return [
    {
      id: 'adSoyad',
      header: t('hr.fullName'),
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
              {row.original.firstName[0]}{row.original.lastName[0]}
            </span>
          </div>
          <div className="flex flex-col">
            <p className="text-sm font-medium text-foreground leading-tight group-hover:text-primary transition-colors">
              {row.original.firstName} {row.original.lastName}
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 tracking-wider">
              {maskTckn(row.original.tckn)}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'department',
      header: t('hr.department'),
      size: 160,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-muted flex items-center justify-center shrink-0 border border-border">
            <Building2 size={11} className="text-muted-foreground" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{row.original.department}</span>
        </div>
      ),
    },
    {
      accessorKey: 'title',
      header: t('hr.title'),
      size: 180,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="size-6 rounded bg-muted flex items-center justify-center shrink-0 border border-border">
            <Briefcase size={11} className="text-muted-foreground" />
          </div>
          <span className="text-xs font-medium text-foreground tracking-tight underline decoration-muted-foreground/20 underline-offset-4 decoration-1 decoration-dashed">
            {row.original.title}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'startDate',
      header: t('hr.startDate'),
      size: 130,
      cell: ({ row }) => (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar size={12} className="opacity-40" />
          <span className="text-xs font-medium tabular-nums">
            {formatDate(row.original.startDate)}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'baseSalaryKurus',
      header: t('hr.salary'),
      size: 130,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Wallet size={12} className="text-muted-foreground opacity-40" />
          <span className="text-sm font-bold tracking-tight text-foreground tabular-nums">
            {formatCurrency(kurusToTl(row.original.baseSalaryKurus))}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      size: 110,
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.ACTIVE;
        return (
          <Badge variant={cfg.variant} className={cn("text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5", cfg.cls)}>
            {t(`hr.status.${row.original.status}`)}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      size: 48,
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="icon" className="size-8 rounded-lg hover:bg-primary/10 hover:text-primary">
          <Link href={`/calisanlar/${row.original.id}`} title={t('common.detail')}>
            <ExternalLink size={14} />
          </Link>
        </Button>
      ),
    },
  ];
}

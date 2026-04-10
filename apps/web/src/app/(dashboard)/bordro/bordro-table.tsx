"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatCurrency, kurusToTl } from "@/lib/format";
import { FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type BordroStatus = "APPROVED" | "PENDING";

export interface BordroRow {
  id: string;
  employeeId: string;
  employeeName: string;
  grossSalaryKurus: number;
  netSalaryKurus: number;
  sgkEmployeeKurus: number;
  sgkEmployerKurus: number;
  incomeTaxKurus: number;
  stampTaxKurus: number;
  status: BordroStatus;
  year: number;
  month: number;
}

const STATUS_CONFIG: Record<BordroStatus, { variant: "default" | "secondary"; cls: string }> = {
  APPROVED: { variant: "default", cls: "" },
  PENDING:  { variant: "secondary", cls: "" },
};

interface DownloadSlipParams {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
}

export function buildBordroColumns(
  t: (key: string) => string,
  onDownload: (params: DownloadSlipParams) => void,
  loadingId: string | null,
): ColumnDef<BordroRow, unknown>[] {
  return [
    {
      id: 'employee',
      header: t('hr.tableEmployee'),
      accessorFn: (row) => row.employeeName,
      cell: ({ row }) => {
        const initials = row.original.employeeName
          .split(" ")
          .slice(0, 2)
          .map((n) => n[0])
          .join("");
        return (
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                {initials}
              </span>
            </div>
            <span className="text-sm font-medium text-foreground tracking-tight group-hover:text-primary transition-colors">
              {row.original.employeeName}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'grossSalaryKurus',
      header: t('hr.tableGrossSalary'),
      cell: ({ row }) => (
        <span className="text-[13px] font-bold tracking-tight text-foreground tabular-nums">
          {formatCurrency(kurusToTl(row.original.grossSalaryKurus))}
        </span>
      ),
    },
    {
      accessorKey: 'netSalaryKurus',
      header: t('hr.tableNetSalary'),
      cell: ({ row }) => (
        <span className="text-[14px] font-bold tracking-tight text-primary tabular-nums underline decoration-primary/20 underline-offset-4 decoration-1 decoration-dashed">
          {formatCurrency(kurusToTl(row.original.netSalaryKurus))}
        </span>
      ),
    },
    {
      accessorKey: 'sgkEmployeeKurus',
      header: t('hr.tableSgkWorker'),
      cell: ({ row }) => (
        <span className="text-[12px] font-medium tracking-tight text-muted-foreground tabular-nums">
          {formatCurrency(kurusToTl(row.original.sgkEmployeeKurus))}
        </span>
      ),
    },
    {
      accessorKey: 'sgkEmployerKurus',
      header: t('hr.tableSgkEmployer'),
      cell: ({ row }) => (
        <span className="text-[12px] font-medium tracking-tight text-muted-foreground tabular-nums">
          {formatCurrency(kurusToTl(row.original.sgkEmployerKurus))}
        </span>
      ),
    },
    {
      accessorKey: 'incomeTaxKurus',
      header: t('hr.tableIncomeTax'),
      cell: ({ row }) => (
        <span className="text-[11px] font-medium tracking-tight text-muted-foreground/50 tabular-nums">
          {formatCurrency(kurusToTl(row.original.incomeTaxKurus))}
        </span>
      ),
    },
    {
      accessorKey: 'stampTaxKurus',
      header: t('hr.tableStampTax'),
      cell: ({ row }) => (
        <span className="text-[11px] font-medium tracking-tight text-muted-foreground/50 tabular-nums">
          {formatCurrency(kurusToTl(row.original.stampTaxKurus))}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('common.status'),
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.PENDING;
        return (
          <Badge variant={cfg.variant} className={`text-[9px] font-semibold uppercase tracking-wider h-5 px-1.5 ${cfg.cls}`}>
            {row.original.status === "APPROVED"
              ? t("hr.payrollStatusApproved")
              : t("hr.payrollStatusPending")}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      size: 60,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all opacity-20 group-hover:opacity-100"
          disabled={loadingId !== null}
          onClick={() => onDownload({
            employeeId: row.original.employeeId,
            employeeName: row.original.employeeName,
            year: row.original.year,
            month: row.original.month,
          })}
        >
          {loadingId === row.original.employeeId ? (
            <span className="animate-spin">⟳</span>
          ) : (
            <FileDown size={14} />
          )}
        </Button>
      ),
    },
  ];
}

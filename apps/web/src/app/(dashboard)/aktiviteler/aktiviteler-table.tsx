"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/format";
import {
  Phone,
  Mail,
  Users,
  CheckSquare,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { Activity, ActivityType, ActivityStatus } from "@/services/crm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AktiviteRow {
  id: string;
  type: ActivityType;
  subject: string;
  contactName?: string;
  dueDate?: string;
  status: ActivityStatus;
  contactId?: string;
  notes?: string;
}

function TypeCell({
  type,
  t,
}: {
  type: ActivityType;
  t: (key: string) => string;
}) {
  const map: Record<ActivityType, { Icon: React.ElementType; cls: string; bg: string }> = {
    CALL:    { Icon: Phone,       cls: "text-sky-400",     bg: "bg-sky-500/10" },
    EMAIL:   { Icon: Mail,        cls: "text-violet-400",  bg: "bg-violet-500/10" },
    MEETING: { Icon: Users,       cls: "text-amber-400",   bg: "bg-amber-500/10" },
    TASK:    { Icon: CheckSquare, cls: "text-emerald-400", bg: "bg-emerald-500/10" },
    NOTE:    { Icon: CheckSquare, cls: "text-slate-400",   bg: "bg-slate-500/10" },
  };
  const cfg = map[type] ?? map["TASK"];
  const Icon = cfg.Icon;

  return (
    <div className="flex items-center gap-2">
      <div className={cn("size-6 rounded-md flex items-center justify-center shrink-0", cfg.bg)}>
        <Icon size={12} className={cfg.cls} />
      </div>
      <span className="text-xs font-semibold text-foreground tracking-tight">
        {t(`activity.type.${type}`)}
      </span>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: ActivityStatus;
  t: (key: string) => string;
}) {
  const map: Record<ActivityStatus, { variant: "default" | "secondary" | "outline" | "destructive"; cls: string }> = {
    PENDING:   { variant: "outline",   cls: "bg-sky-500/10 border-sky-500/20 text-sky-400" },
    COMPLETED: { variant: "outline",   cls: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
    CANCELLED: { variant: "destructive", cls: "" },
  };
  const cfg = map[status] ?? map["PENDING"];
  return (
    <Badge variant={cfg.variant} className={cn("text-[10px] font-bold uppercase tracking-widest h-5 px-1.5 shadow-none", cfg.cls)}>
      {t(`activity.statusLabel.${status}`)}
    </Badge>
  );
}

export function buildAktiviteColumns(
  onComplete: (id: string) => void,
  t: (key: string) => string,
): ColumnDef<AktiviteRow, unknown>[] {
  return [
    {
      accessorKey: "type",
      header: t("activity.typeLabel"),
      size: 130,
      cell: ({ row }) => <TypeCell type={row.original.type} t={t} />,
    },
    {
      accessorKey: "subject",
      header: t("activity.subject"),
      cell: ({ row }) => (
        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 max-w-[320px] group-hover:text-sky-400 transition-colors">
          {row.original.subject}
        </p>
      ),
    },
    {
      accessorKey: "contactName",
      header: t("activity.customer"),
      size: 180,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
           {row.original.contactName ? (
              <span className="text-xs font-medium text-muted-foreground truncate max-w-[160px] underline decoration-muted-foreground/30 underline-offset-4 decoration-1 decoration-dashed">
                {row.original.contactName}
              </span>
           ) : (
             <span className="text-muted-foreground opacity-30">—</span>
           )}
        </div>
      ),
    },
    {
      accessorKey: "dueDate",
      header: t("activity.dueDateTime"),
      size: 140,
      cell: ({ row }) => {
        const { dueDate, status } = row.original;
        if (!dueDate) return <span className="text-xs text-muted-foreground opacity-40">—</span>;
        const date = new Date(dueDate);
        const isOverdue = status === "PENDING" && date < new Date();
        return (
          <div className="flex flex-col">
            <div className={cn("flex items-center gap-1 text-[11px] font-bold tracking-tight", 
              isOverdue ? "text-rose-400" : "text-foreground")}>
              {isOverdue && <AlertCircle size={10} />}
              {formatDate(date)}
            </div>
            {isOverdue && (
              <span className="text-[9px] font-bold text-rose-400/70 uppercase tracking-tighter mt-0.5 leading-none">
                {t("activity.overdue") || "Gecikmiş"}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: t("activity.status"),
      size: 100,
      cell: ({ row }) => <StatusBadge status={row.original.status} t={t} />,
    },
    {
      id: "actions",
      header: "",
      size: 120,
      cell: ({ row }) => {
        if (row.original.status !== "PENDING") return null;
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onComplete(row.original.id)}
            className="h-7 px-2.5 text-[10px] font-bold uppercase tracking-wider
                       bg-emerald-500/10 border-emerald-500/20
                       text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300
                       shadow-none gap-1.5"
            title={t("activity.markComplete")}
          >
            <CheckCircle2 size={12} />
            {t("activity.markComplete")}
          </Button>
        );
      },
    },
  ];
}

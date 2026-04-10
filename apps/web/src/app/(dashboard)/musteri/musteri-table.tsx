"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, ExternalLink } from "lucide-react";

export interface MusteriRow {
  id: string;
  name: string;
  type: "customer" | "vendor" | "both" | "prospect";
  email?: string;
  phone?: string;
  tckn?: string;
  vkn?: string;
  city?: string;
  isActive: boolean;
}

const TYPE_CLS: Record<MusteriRow["type"], string> = {
  customer: "border-primary/30 text-primary",
  vendor:   "border-primary/30 text-primary",
  both:     "border-primary/30 text-primary",
  prospect: "border-border text-muted-foreground",
};

function maskVkn(v: string)  { return `${v.slice(0, 6)}****`; }
function maskTckn(t: string) { return `${t.slice(0, 3)}*****${t.slice(-2)}`; }

export function buildMusteriColumns(t: (key: string) => string): ColumnDef<MusteriRow, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: t("crm.company") + " / " + t("common.name"),
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-semibold text-foreground">{row.original.name}</p>
          {!row.original.isActive && (
            <p className="text-[10px] text-muted-foreground italic font-medium mt-0.5">{t("common.passive")}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "type",
      header: t("common.type"),
      cell: ({ row }) => (
        <Badge variant="outline" className={`text-[10px] font-semibold border px-2 py-0 ${TYPE_CLS[row.original.type]}`}>
          {t(`crm.contactType.${row.original.type.toUpperCase()}` as "crm.contactType.CUSTOMER")}
        </Badge>
      ),
    },
    {
      accessorKey: "email",
      header: t("crm.email"),
      cell: ({ row }) => (
        row.original.email ? (
          <a
            href={`mailto:${row.original.email}`}
            className="text-xs text-primary hover:text-primary/80 transition-colors underline decoration-muted-foreground/30 underline-offset-4 decoration-1"
          >
            {row.original.email}
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )
      ),
    },
    {
      accessorKey: "phone",
      header: t("crm.phone"),
      cell: ({ row }) => (
        row.original.phone ? (
          <span className="text-xs text-foreground tabular-nums">{row.original.phone}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )
      ),
    },
    {
      id: "kimlik",
      header: "VKN / TCKN",
      cell: ({ row }) => {
        const { vkn, tckn } = row.original;
        if (vkn) {
          return (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-muted-foreground leading-none">VKN</span>
              <span className="text-xs tabular-nums text-foreground mt-0.5">{maskVkn(vkn)}</span>
            </div>
          );
        }
        if (tckn) {
          return (
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-muted-foreground leading-none">TCKN</span>
              <span className="text-xs tabular-nums text-foreground mt-0.5">{maskTckn(tckn)}</span>
            </div>
          );
        }
        return <span className="text-muted-foreground text-xs">—</span>;
      },
    },
    {
      accessorKey: "city",
      header: t("crm.city"),
      cell: ({ row }) => (
        row.original.city ? (
          <span className="text-xs text-foreground">{row.original.city}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-2">
          <Button asChild variant="outline" size="icon" className="size-7">
            <Link href={`/musteri/${row.original.id}/duzenle`} title={t("common.edit")}>
              <Pencil size={12}/>
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-7">
            <Link href={`/musteri/${row.original.id}`} title={t("common.detail")}>
              <ExternalLink size={12}/>
            </Link>
          </Button>
        </div>
      ),
      size: 80,
    },
  ];
}

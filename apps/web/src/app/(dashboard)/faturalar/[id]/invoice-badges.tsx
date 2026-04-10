"use client";

import { useI18n } from "@/hooks/use-i18n";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface InvoiceDetail {
  /** @type {InvoiceStatus} — shared-types'ten import edilmiş */
  status: "DRAFT" | "APPROVED" | "PENDING_GIB" | "SENT_GIB" | "ACCEPTED_GIB" | "REJECTED_GIB" | "ARCHIVE_REPORTED" | "CANCELLED";
  direction: "OUT" | "IN";
}

interface StatusBadgeProps {
  status: InvoiceDetail["status"];
}

/**
 * STATUS_MAP — UI_RULES.md standartları
 * ✅ Tailwind tema token'ları (hardcoded renk YASAK)
 * ✅ variant + className = theme tutarlılığı
 */
const STATUS_MAP: Record<
  InvoiceDetail["status"],
  { labelKey: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  // Draft durumları
  DRAFT:            { labelKey: "invoice.status.draft",           variant: "outline" },

  // Onay durumları
  APPROVED:         { labelKey: "invoice.status.approved",        variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },

  // GİB işlem akışı
  PENDING_GIB:      { labelKey: "invoice.status.pendingGib",      variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
  SENT_GIB:         { labelKey: "invoice.status.sentGib",         variant: "secondary" },
  ACCEPTED_GIB:     { labelKey: "invoice.status.acceptedGib",     variant: "default" },
  REJECTED_GIB:     { labelKey: "invoice.status.rejectedGib",     variant: "destructive" },

  // e-Arşiv
  ARCHIVE_REPORTED: { labelKey: "invoice.status.archiveReported", variant: "secondary" },

  // İptal
  CANCELLED:        { labelKey: "invoice.status.cancelled",       variant: "outline", className: "text-muted-foreground" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useI18n();
  const entry = STATUS_MAP[status] ?? { labelKey: "common.status", variant: "outline" as const };
  return (
    <Badge
      variant={entry.variant}
      className={entry.className}
    >
      {t(entry.labelKey)}
    </Badge>
  );
}

interface DirectionBadgeProps {
  direction: InvoiceDetail["direction"];
}

export function DirectionBadge({ direction }: DirectionBadgeProps) {
  const { t } = useI18n();
  if (direction === "OUTGOING") {
    return (
      <Badge variant="secondary" className="gap-1">
        <ArrowUpRight size={11} />
        {t("invoice.outgoing")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <ArrowDownLeft size={11} />
      {t("invoice.incoming")}
    </Badge>
  );
}

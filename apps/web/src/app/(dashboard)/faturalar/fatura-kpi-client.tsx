"use client";

import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, kurusToTl } from "@/lib/format";
import { FileText, TrendingUp, Clock, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FaturaKpiClientProps {
  onaylanan: number;
  bekleyen: number;
  reddedilen: number;
  toplamKurus: number;
}

export function FaturaKpiClient({
  onaylanan,
  bekleyen,
  reddedilen,
  toplamKurus,
}: FaturaKpiClientProps) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4" />
            {t("invoice.totalRevenue")}
          </div>
          <p className={cn("text-3xl font-bold", "text-primary")}>
            {formatCurrency(kurusToTl(toplamKurus))}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            <FileText className="h-4 w-4" />
            {t("invoice.approved")}
          </div>
          <p className={cn("text-3xl font-bold", "text-primary")}>
            {onaylanan}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            {t("invoice.pending")}
          </div>
          <p className={cn("text-3xl font-bold", "text-foreground")}>
            {bekleyen}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            <XCircle className="h-4 w-4" />
            {t("invoice.rejected")}
          </div>
          <p className={cn("text-3xl font-bold", "text-destructive")}>
            {reddedilen}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Scale, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface BilancoAccount {
  code: string;
  name: string;
  amount: number;
}

interface BilancoGroup {
  group: string;
  total: number;
  accounts: BilancoAccount[];
}

interface BilancoResponse {
  aktif: BilancoGroup[];
  pasif: BilancoGroup[];
  toplamAktif: number;
  toplamPasif: number;
}

function BilancoGroupBlock({
  group,
  accentClass,
  t,
  noRecordKey,
}: {
  group: BilancoGroup;
  accentClass: string;
  t: (key: string) => string;
  noRecordKey: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn("text-xs font-semibold uppercase tracking-wider", accentClass)}>
          {group.group}
        </span>
        <span className={cn("text-xs font-semibold tabular-nums", accentClass)}>
          {formatCurrency(group.total)}
        </span>
      </div>

      <div className="pl-3 border-l-2 border-border flex flex-col gap-1">
        {(group.accounts ?? []).length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            {t(noRecordKey)}
          </span>
        ) : (
          (group.accounts ?? []).map((acc) => (
            <div
              key={acc.code}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                  {acc.code}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {acc.name}
                </span>
              </div>
              <span
                className={cn(
                  "text-xs tabular-nums flex-shrink-0 ml-2",
                  acc.amount < 0 ? "text-destructive" : "text-foreground"
                )}
              >
                {acc.amount < 0
                  ? `(${formatCurrency(Math.abs(acc.amount))})`
                  : formatCurrency(acc.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface BilancoClientProps {
  data: BilancoResponse;
}

export function BilancoClient({ data }: BilancoClientProps) {
  const { t } = useI18n();

  const aktif = data.aktif ?? [];
  const pasif = data.pasif ?? [];
  const diff = Math.abs(data.toplamAktif - data.toplamPasif);
  const dengeli = diff === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
          <Link href="/muhasebe">
            <ArrowLeft size={15} />
          </Link>
        </Button>
        <Scale size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("accounting.balance")}
        </h1>
        <span className="text-sm text-muted-foreground ml-2">
          {t("accounting.subtitle")}
        </span>
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Scale size={14} className="text-muted-foreground" />
              {t("accounting.totalAssets")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
              {formatCurrency(data.toplamAktif)}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Scale size={14} className="text-muted-foreground" />
              {t("accounting.totalLiabilities")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {formatCurrency(data.toplamPasif)}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              {dengeli ? (
                <CheckCircle2 size={14} className="text-muted-foreground" />
              ) : (
                <AlertTriangle size={14} className="text-muted-foreground" />
              )}
              {t("accounting.balanceStatus")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold tracking-tight tabular-nums",
              dengeli ? "text-primary" : "text-destructive"
            )}>
              {dengeli
                ? t("accounting.balanced")
                : `${t("accounting.balanceDiff")}: ${formatCurrency(diff)}`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* İki sütunlu bilanço */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        {/* AKTİF */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary inline-block" />
              {t("accounting.assets")}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {aktif.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {t("common.noRecord")}
              </div>
            ) : (
              aktif.map((g) => (
                <BilancoGroupBlock
                  key={g.group}
                  group={g}
                  accentClass="text-primary"
                  t={t}
                  noRecordKey="common.noRecord"
                />
              ))
            )}

            <Separator className="my-3" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("accounting.totalAssets").toUpperCase()}
              </span>
              <span className="text-sm font-bold tabular-nums text-primary">
                {formatCurrency(data.toplamAktif)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* PASİF */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />
              {t("accounting.liabilities")}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            {pasif.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {t("common.noRecord")}
              </div>
            ) : (
              pasif.map((g) => (
                <BilancoGroupBlock
                  key={g.group}
                  group={g}
                  accentClass="text-muted-foreground"
                  t={t}
                  noRecordKey="common.noRecord"
                />
              ))
            )}

            <Separator className="my-3" />
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("accounting.totalLiabilities").toUpperCase()}
              </span>
              <span className="text-sm font-bold tabular-nums text-foreground">
                {formatCurrency(data.toplamPasif)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

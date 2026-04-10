"use client";

import Link from "next/link";
import {
  BookOpen,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Download,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface MizanAccount {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  balance: number;
}

interface MizanResponse {
  accounts: MizanAccount[];
  totalDebit: number;
  totalCredit: number;
}

interface MizanClientProps {
  data: MizanResponse;
}

export function MizanClient({ data }: MizanClientProps) {
  const { t } = useI18n();

  const accounts = data.accounts ?? [];
  const diff = Math.abs(data.totalDebit - data.totalCredit);
  const dengeli = diff === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
            <Link href="/muhasebe">
              <ArrowLeft size={15} />
            </Link>
          </Button>
          <BookOpen size={20} className="text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("accounting.mizan")}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
            <a
              href="/api/financial/reports/mizan/excel"
              target="_blank"
              rel="noreferrer"
            >
              <FileSpreadsheet size={13} /> {t("common.excel")}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild className="h-8 gap-1.5 text-xs">
            <a
              href="/api/financial/reports/mizan/pdf"
              target="_blank"
              rel="noreferrer"
            >
              <Download size={13} /> {t("common.pdf")}
            </a>
          </Button>
        </div>
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BookOpen size={14} className="text-muted-foreground" />
              {t("accounting.totalDebit")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
              {formatCurrency(data.totalDebit)}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BookOpen size={14} className="text-muted-foreground" />
              {t("accounting.totalCredit")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {formatCurrency(data.totalCredit)}
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

      {/* Tablo */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold w-28">
                    {t("accounting.accountCode")}
                  </TableHead>
                  <TableHead className="font-semibold">
                    {t("accounting.accountName")}
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    {t("accounting.debit")}
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    {t("accounting.credit")}
                  </TableHead>
                  <TableHead className="text-right font-semibold">
                    {t("accounting.balanceCol")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-10 text-muted-foreground text-sm"
                    >
                      {t("common.noRecord")}
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => (
                    <TableRow key={acc.accountCode} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-xs text-muted-foreground tabular-nums w-28">
                        {acc.accountCode}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {acc.accountName}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {acc.debit > 0 ? (
                          <span className="text-primary">
                            {formatCurrency(acc.debit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {acc.credit > 0 ? (
                          <span className="text-foreground">
                            {formatCurrency(acc.credit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {acc.balance > 0 ? (
                          <span className="text-primary">
                            {formatCurrency(acc.balance)}
                          </span>
                        ) : acc.balance < 0 ? (
                          <span className="text-destructive">
                            {formatCurrency(Math.abs(acc.balance))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={2} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("common.total").toUpperCase()}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums text-primary">
                    {formatCurrency(data.totalDebit)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums text-foreground">
                    {formatCurrency(data.totalCredit)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-bold tabular-nums">
                    {dengeli ? (
                      <span className="text-primary">{t("accounting.balanced")}</span>
                    ) : (
                      <span className="text-destructive">{formatCurrency(diff)}</span>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

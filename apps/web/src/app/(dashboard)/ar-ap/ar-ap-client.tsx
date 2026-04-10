"use client";

import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, kurusToTl } from "@/lib/format";
import { TrendingUp, TrendingDown, AlertCircle, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface AgingBucket {
  bucket: "not_due" | "1_30" | "31_60" | "61_90" | "90_plus";
  totalAmount: number;
  invoiceCount: number;
}

interface AgingSummary {
  buckets: AgingBucket[];
  grandTotal: number;
  currency: string;
}

interface AgingDetail {
  contactId: string;
  contactName: string;
  buckets: AgingBucket[];
  total: number;
}

const ORDERED: AgingBucket["bucket"][] = [
  "not_due",
  "1_30",
  "31_60",
  "61_90",
  "90_plus",
];

function AgingBucketBar({
  buckets,
  total,
  t,
}: {
  buckets: AgingBucket[];
  total: number;
  t: (key: string) => string;
}) {
  const hasData = total > 0;

  const bucketClasses: Record<AgingBucket["bucket"], { bar: string; text: string }> = {
    not_due: { bar: "bg-primary", text: "text-primary" },
    "1_30": { bar: "bg-blue-500", text: "text-blue-500" },
    "31_60": { bar: "bg-amber-500", text: "text-amber-500" },
    "61_90": { bar: "bg-orange-500", text: "text-orange-500" },
    "90_plus": { bar: "bg-destructive", text: "text-destructive" },
  };

  return (
    <div className="flex flex-col gap-3 mt-4">
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 bg-muted">
        {ORDERED.map((b) => {
          const bucket = buckets.find((x) => x.bucket === b);
          const pct = hasData && bucket ? (bucket.totalAmount / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={b}
              className={cn("rounded-full", bucketClasses[b].bar)}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {ORDERED.map((b) => {
          const bucket = buckets.find((x) => x.bucket === b);
          if (!bucket || bucket.totalAmount === 0) return null;
          return (
            <div key={b} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={cn("w-2 h-2 rounded-sm shrink-0", bucketClasses[b].bar)} />
                <span className="text-[11px] text-muted-foreground">
                  {t(`arAp.bucket.${b}`)}
                </span>
              </div>
              <span className="text-[11px] text-foreground tabular-nums font-medium">
                {formatCurrency(kurusToTl(bucket.totalAmount))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgingDetailTable({
  rows,
  labelKey,
  t,
}: {
  rows: AgingDetail[];
  labelKey: string;
  t: (key: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        {t("common.noRecord")}
      </div>
    );
  }

  const bucketTextClasses: Record<AgingBucket["bucket"], string> = {
    not_due: "text-muted-foreground",
    "1_30": "text-blue-500 font-semibold",
    "31_60": "text-amber-500 font-semibold",
    "61_90": "text-orange-500 font-semibold",
    "90_plus": "text-destructive font-semibold",
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-semibold text-left">{t(labelKey)}</TableHead>
            {ORDERED.map((b) => (
              <TableHead key={b} className="text-right font-semibold">
                {t(`arAp.bucket.${b}`)}
              </TableHead>
            ))}
            <TableHead className="text-right font-semibold">{t("common.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.contactId} className="hover:bg-muted/40 transition-colors">
              <TableCell className="font-medium text-foreground">
                {row.contactName}
              </TableCell>
              {ORDERED.map((b) => {
                const bucket = (row.buckets ?? []).find((x) => x.bucket === b);
                const val = bucket?.totalAmount ?? 0;
                const isLate = b !== "not_due" && val > 0;
                return (
                  <TableCell
                    key={b}
                    className={cn(
                      "text-right text-sm tabular-nums",
                      isLate ? bucketTextClasses[b] : "text-muted-foreground"
                    )}
                  >
                    {val > 0 ? formatCurrency(kurusToTl(val)) : "—"}
                  </TableCell>
                );
              })}
              <TableCell className="text-right font-bold text-foreground tabular-nums">
                {formatCurrency(kurusToTl(row.total))}
              </TableCell>
            </TableRow>
          ))}

          <TableRow className="bg-muted/40 font-semibold border-t-2">
            <TableCell className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("arAp.columns.total")}
            </TableCell>
            {ORDERED.map((b) => {
              const total = rows.reduce((s, r) => {
                const bkt = (r.buckets ?? []).find((x) => x.bucket === b);
                return s + (bkt?.totalAmount ?? 0);
              }, 0);
              return (
                <TableCell
                  key={b}
                  className={cn(
                    "text-right font-bold tabular-nums",
                    total > 0 ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {total > 0 ? formatCurrency(kurusToTl(total)) : "—"}
                </TableCell>
              );
            })}
            <TableCell className="text-right font-bold text-primary tabular-nums">
              {formatCurrency(kurusToTl(rows.reduce((s, r) => s + r.total, 0)))}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

interface ArApClientProps {
  ar: AgingSummary;
  ap: AgingSummary;
  arDetail: AgingDetail[];
  apDetail: AgingDetail[];
}

export function ArApClient({ ar, ap, arDetail, apDetail }: ArApClientProps) {
  const { t } = useI18n();

  const arOverdue = ar.buckets
    .filter((b) => b.bucket !== "not_due")
    .reduce((s, b) => s + b.totalAmount, 0);
  const apOverdue = ap.buckets
    .filter((b) => b.bucket !== "not_due")
    .reduce((s, b) => s + b.totalAmount, 0);

  const netPosition = ar.grandTotal - ap.grandTotal;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <BarChart3 size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("arAp.title")}
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={14} className="text-primary" />
              {t("arAp.totalReceivable")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
              {formatCurrency(kurusToTl(ar.grandTotal))}
            </div>
            {arOverdue > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-500">
                <AlertCircle size={11} />
                {formatCurrency(kurusToTl(arOverdue))} {t("arAp.overdue")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingDown size={14} className="text-destructive" />
              {t("arAp.totalPayable")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-destructive tabular-nums">
              {formatCurrency(kurusToTl(ap.grandTotal))}
            </div>
            {apOverdue > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-500">
                <AlertCircle size={11} />
                {formatCurrency(kurusToTl(apOverdue))} {t("arAp.overdue")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("arAp.netPosition")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold tracking-tight tabular-nums",
                netPosition >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {netPosition >= 0 ? "+" : ""}
              {formatCurrency(kurusToTl(netPosition))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AlertCircle size={14} className="text-amber-500" />
              {t("arAp.totalOverdue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-amber-500 tabular-nums">
              {formatCurrency(kurusToTl(arOverdue + apOverdue))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={13} className="text-primary" />
              {t("arAp.arAging")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgingBucketBar buckets={ar.buckets} total={ar.grandTotal} t={t} />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingDown size={13} className="text-destructive" />
              {t("arAp.apAging")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgingBucketBar buckets={ap.buckets} total={ap.grandTotal} t={t} />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b py-3 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingUp size={13} className="text-primary" />
              {t("arAp.arByCustomer")}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {arDetail.length} {t("arAp.openReceivables")}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <AgingDetailTable
            rows={arDetail}
            labelKey="arAp.receivableDetail"
            t={t}
          />
        </CardContent>
      </Card>

      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="border-b py-3 px-5">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <TrendingDown size={13} className="text-destructive" />
              {t("arAp.apByVendor")}
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {apDetail.length} {t("arAp.openPayables")}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <AgingDetailTable
            rows={apDetail}
            labelKey="arAp.payableDetail"
            t={t}
          />
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileDown,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  ShoppingBag,
  AlertCircle,
  Info,
  FileSpreadsheet,
} from "lucide-react";
import { financialApi } from "@/services/financial";
import { formatCurrency, kurusToTl } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface BabsRow {
  vkn: string;
  counterparty: string;
  invoiceCount: number;
  totalKurus: number;
}

interface BabsResponse {
  year: number;
  month: number;
  rows: BabsRow[];
  grandTotalKurus: number;
  threshold: number;
}

// ─── Alt Bileşen: BabsTable ───────────────────────────────────────────────────

function BabsTable({
  data,
  type,
  t,
}: {
  data: BabsResponse;
  type: "ba" | "bs";
  t: (key: string) => string;
}) {
  const rows = data.rows ?? [];
  const totalQty = rows.reduce((s, r) => s + r.invoiceCount, 0);

  const kpiCards = [
    {
      labelKey: "accounting.notificationCount",
      value: rows.length.toString(),
      subKey: "accounting.taxpayer",
    },
    {
      labelKey: "accounting.transactionCount",
      value: totalQty.toString(),
      subKey: "accounting.invoiceWaybill",
    },
    {
      labelKey: "accounting.totalAmount",
      value: formatCurrency(kurusToTl(data.grandTotalKurus)),
      subKey: "accounting.vatIncluded",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Mini KPI Kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpiCards.map((c) => (
          <Card key={c.labelKey} className="shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(c.labelKey)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                {c.value}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t(c.subKey)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tablo Kartı */}
      <Card className="shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <AlertCircle size={28} className="opacity-20" />
              <p className="text-sm">{t("accounting.noTransactions")}</p>
              <p className="text-xs opacity-60">
                {t("accounting.threshold")}:{" "}
                {formatCurrency(kurusToTl(data.threshold))} {t("accounting.vatIncluded")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-10 font-semibold">#</TableHead>
                    <TableHead className="font-semibold">{t("accounting.vknTckn")}</TableHead>
                    <TableHead className="font-semibold">
                      {type === "ba" ? t("accounting.sellerTitle") : t("accounting.buyerTitle")}
                    </TableHead>
                    <TableHead className="text-right font-semibold">{t("accounting.documentCount")}</TableHead>
                    <TableHead className="text-right font-semibold">{t("accounting.totalAmount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={row.vkn} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-muted-foreground text-xs tabular-nums w-10">
                        {i + 1}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums tracking-wide text-muted-foreground ">
                        {row.vkn}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-foreground">
                        {row.counterparty}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {row.invoiceCount}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatCurrency(kurusToTl(row.totalKurus))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell colSpan={3} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t("common.total").toUpperCase()} ({rows.length} {t("accounting.taxpayer")})
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-foreground">
                      {totalQty}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-foreground">
                      {formatCurrency(kurusToTl(data.grandTotalKurus))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alt not */}
      <p className="text-xs text-muted-foreground pl-1">
        * {t("accounting.thresholdNote")}: {t("accounting.vatIncluded")}{" "}
        {formatCurrency(kurusToTl(data.threshold))} — {t("accounting.thresholdNote2")}
      </p>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function BabsPage() {
  const { t } = useI18n();
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab,   setTab]   = useState<"ba" | "bs">("ba");

  const MONTHS = [
    t("accounting.months.jan"),
    t("accounting.months.feb"),
    t("accounting.months.mar"),
    t("accounting.months.apr"),
    t("accounting.months.may"),
    t("accounting.months.jun"),
    t("accounting.months.jul"),
    t("accounting.months.aug"),
    t("accounting.months.sep"),
    t("accounting.months.oct"),
    t("accounting.months.nov"),
    t("accounting.months.dec"),
  ];

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const isCurrent =
      year > now.getFullYear() ||
      (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (isCurrent) return;
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const baQuery = useQuery({
    queryKey: ["babs-ba", year, month],
    queryFn: () =>
      financialApi.babs.ba(year, month).then((r) => r.data as BabsResponse).catch(() => null),
  });
  const bsQuery = useQuery({
    queryKey: ["babs-bs", year, month],
    queryFn: () =>
      financialApi.babs.bs(year, month).then((r) => r.data as BabsResponse).catch(() => null),
  });

  const baXmlMut = useMutation({
    mutationFn: () => financialApi.babs.baXml(year, month).then((r) => r.data as Blob),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `ba-formu-${year}-${String(month).padStart(2, "0")}.xml`,
      });
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const bsXmlMut = useMutation({
    mutationFn: () => financialApi.babs.bsXml(year, month).then((r) => r.data as Blob),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `bs-formu-${year}-${String(month).padStart(2, "0")}.xml`,
      });
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const activeData = tab === "ba" ? baQuery.data : bsQuery.data;
  const isLoading  = tab === "ba" ? baQuery.isLoading : bsQuery.isLoading;
  const xmlMut     = tab === "ba" ? baXmlMut : bsXmlMut;
  const isFuture   =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1);

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
          <FileSpreadsheet size={20} className="text-muted-foreground" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("accounting.babsTitle")}
          </h1>
          <span className="text-sm text-muted-foreground">{t("accounting.babsSubtitle")}</span>
        </div>

        {/* Ay seçici */}
        <div className="flex items-center gap-1 bg-muted/50 border border-border rounded-lg px-3 py-1.5">
          <Button variant="ghost" size="icon" className="size-6" onClick={prevMonth}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm font-semibold text-foreground tabular-nums min-w-[120px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={nextMonth}
            disabled={isFuture}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      {/* GİB bilgi notu */}
      <Alert>
        <Info size={14} className="text-muted-foreground" />
        <AlertDescription
          className="text-xs text-muted-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: t("accounting.gibNotice") }}
        />
      </Alert>

      {/* Tab + XML butonu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Sekmeler */}
        <div className="flex gap-1 bg-muted/50 border border-border rounded-lg p-1">
          {(
            [
              { key: "ba" as const, icon: ShoppingCart, labelKey: "accounting.baPurchases" },
              { key: "bs" as const, icon: ShoppingBag,  labelKey: "accounting.bsSales" },
            ] as const
          ).map((tabItem) => {
            const Icon = tabItem.icon;
            const active = tab === tabItem.key;
            return (
              <button
                key={tabItem.key}
                onClick={() => setTab(tabItem.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                  active
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon size={13} /> {t(tabItem.labelKey)}
              </button>
            );
          })}
        </div>

        {/* XML İndir */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => xmlMut.mutate()}
          isLoading={xmlMut.isPending}
          disabled={xmlMut.isPending || isLoading}
          className="h-8 gap-1.5 text-xs"
        >
          <FileDown size={12} />
          {tab.toUpperCase()} {t("accounting.downloadXml")}
        </Button>
      </div>

      {/* İçerik */}
      {isLoading ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col gap-3 py-6">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ) : activeData ? (
        <BabsTable data={activeData} type={tab} t={t} />
      ) : null}
    </div>
  );
}

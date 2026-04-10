"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { financialApi } from "@/services/financial";
import { stockApi } from "@/services/stock";
import { hrApi } from "@/services/hr";
import { useI18n } from "@/hooks/use-i18n";
import {
  FileBarChart2,
  FileText,
  FileSpreadsheet,
  FileCode2,
  Download,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Package,
  Users,
  Scale,
  BookOpen,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

// ─── Blob indirme yardımcısı ──────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Ay/Yıl Seçici ───────────────────────────────────────────────────────────

const MONTH_KEYS = [
  "common.months.jan", "common.months.feb", "common.months.mar",
  "common.months.apr", "common.months.may", "common.months.jun",
  "common.months.jul", "common.months.aug", "common.months.sep",
  "common.months.oct", "common.months.nov", "common.months.dec",
];

function MonthPicker({
  year, month, onChange, t,
}: {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
  t: (key: string) => string;
}) {
  const now = new Date();
  const isLimit = year === now.getFullYear() && month >= now.getMonth() + 1;

  const prev = () => { if (month === 1) onChange(year - 1, 12); else onChange(year, month - 1); };
  const next = () => {
    if (isLimit) return;
    if (month === 12) onChange(year + 1, 1); else onChange(year, month + 1);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon" className="size-6" onClick={prev}>
        <ChevronLeft size={12} />
      </Button>
      <span className="text-xs text-foreground min-w-[96px] text-center tabular-nums">
        {t(MONTH_KEYS[month - 1])} {year}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-6"
        onClick={next}
        disabled={isLimit}
      >
        <ChevronRight size={12} />
      </Button>
    </div>
  );
}

// ─── Format İndirme Butonu ────────────────────────────────────────────────────

type Format = "PDF" | "Excel" | "XML";

const FORMAT_ICON: Record<Format, React.ReactNode> = {
  PDF:   <FileText size={11} />,
  Excel: <FileSpreadsheet size={11} />,
  XML:   <FileCode2 size={11} />,
};

function DownloadBtn({
  format, isPending, onClick, done,
}: {
  format: Format;
  isPending: boolean;
  onClick: () => void;
  done?: boolean;
}) {
  return (
    <Button
      variant={done ? "secondary" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={isPending}
      isLoading={isPending}
      className="gap-1.5 h-8 text-xs"
    >
      {!isPending && (done ? <CheckCircle2 size={11} /> : FORMAT_ICON[format])}
      {format}
    </Button>
  );
}

// ─── Rapor Kartı ─────────────────────────────────────────────────────────────

interface ReportAction {
  format: Format;
  isPending: boolean;
  done: boolean;
  onDownload: () => void;
}

function ReportCard({
  icon, title, description, actions, filter,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions: ReportAction[];
  filter?: React.ReactNode;
}) {
  return (
    <Card className="shadow-sm flex flex-col gap-0">
      <CardContent className="p-5 flex flex-col gap-4">
        {/* Üst: ikon + başlık */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{description}</p>
          </div>
        </div>

        {/* Filtre (varsa) */}
        {filter && (
          <div className="rounded-lg bg-muted/40 border border-border px-3 py-2">
            {filter}
          </div>
        )}

        {/* İndirme butonları */}
        <div className="flex gap-2 flex-wrap">
          {actions.map((a) => (
            <DownloadBtn
              key={a.format}
              format={a.format}
              isPending={a.isPending}
              done={a.done}
              onClick={a.onDownload}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Yönlendirme Kartı ────────────────────────────────────────────────────────

function LinkCard({
  icon, title, description, href, linkLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{description}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild className="w-fit h-8 gap-1.5 text-xs">
          <Link href={href}>
            <ExternalLink size={11} /> {linkLabel}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Bölüm Başlığı ───────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </h2>
      <Separator className="flex-1 ml-1" />
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function RaporlarPage() {
  const { t } = useI18n();
  const now = new Date();
  const [sgkYear,  setSgkYear]  = useState(now.getFullYear());
  const [sgkMonth, setSgkMonth] = useState(now.getMonth() + 1);

  // Fatura PDF
  const [fatPdfDone, setFatPdfDone] = useState(false);
  const fatPdf = useMutation({
    mutationFn: () => financialApi.reports.invoicePdf() as Promise<{ data: Blob }>,
    onSuccess: (res) => { triggerDownload(res.data, "fatura-listesi.pdf"); setFatPdfDone(true); setTimeout(() => setFatPdfDone(false), 3000); },
  });

  // Fatura Excel
  const [fatXlsDone, setFatXlsDone] = useState(false);
  const fatXls = useMutation({
    mutationFn: () => financialApi.reports.invoiceExcel() as Promise<{ data: Blob }>,
    onSuccess: (res) => { triggerDownload(res.data, "fatura-listesi.xlsx"); setFatXlsDone(true); setTimeout(() => setFatXlsDone(false), 3000); },
  });

  // Mizan PDF
  const [mizPdfDone, setMizPdfDone] = useState(false);
  const mizPdf = useMutation({
    mutationFn: () => financialApi.reports.mizanPdf() as Promise<{ data: Blob }>,
    onSuccess: (res) => { triggerDownload(res.data, "mizan-raporu.pdf"); setMizPdfDone(true); setTimeout(() => setMizPdfDone(false), 3000); },
  });

  // Mizan Excel
  const [mizXlsDone, setMizXlsDone] = useState(false);
  const mizXls = useMutation({
    mutationFn: () => financialApi.reports.mizanExcel() as Promise<{ data: Blob }>,
    onSuccess: (res) => { triggerDownload(res.data, "mizan-raporu.xlsx"); setMizXlsDone(true); setTimeout(() => setMizXlsDone(false), 3000); },
  });

  // Stok PDF
  const [stokPdfDone, setStokPdfDone] = useState(false);
  const stokPdf = useMutation({
    mutationFn: () => stockApi.reports.pdf() as Promise<{ data: Blob }>,
    onSuccess: (res) => { triggerDownload(res.data, "stok-degerleme.pdf"); setStokPdfDone(true); setTimeout(() => setStokPdfDone(false), 3000); },
  });

  // Stok Excel
  const [stokXlsDone, setStokXlsDone] = useState(false);
  const stokXls = useMutation({
    mutationFn: () => stockApi.reports.excel() as Promise<{ data: Blob }>,
    onSuccess: (res) => { triggerDownload(res.data, "stok-degerleme.xlsx"); setStokXlsDone(true); setTimeout(() => setStokXlsDone(false), 3000); },
  });

  // SGK XML
  const [sgkDone, setSgkDone] = useState(false);
  const sgkXml = useMutation({
    mutationFn: () => hrApi.sgk.bildirgeXml(sgkYear, sgkMonth) as Promise<{ data: Blob }>,
    onSuccess: (res) => {
      triggerDownload(res.data, `sgk-bildirge-${sgkYear}-${String(sgkMonth).padStart(2, "0")}.xml`);
      setSgkDone(true);
      setTimeout(() => setSgkDone(false), 3000);
    },
  });

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted flex items-center justify-center">
          <FileBarChart2 size={18} className="text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("reports.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("reports.subtitle")}</p>
        </div>
      </div>

      {/* ── Finans ── */}
      <section>
        <SectionLabel icon={<BarChart3 size={14} />} label={t("reports.finance")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            icon={<FileText size={16} />}
            title={t("reports.invoiceList")}
            description={t("reports.invoiceListDesc")}
            actions={[
              { format: "PDF",   isPending: fatPdf.isPending, done: fatPdfDone, onDownload: () => fatPdf.mutate() },
              { format: "Excel", isPending: fatXls.isPending, done: fatXlsDone, onDownload: () => fatXls.mutate() },
            ]}
          />

          <ReportCard
            icon={<Scale size={16} />}
            title={t("reports.mizanReport")}
            description={t("reports.mizanReportDesc")}
            actions={[
              { format: "PDF",   isPending: mizPdf.isPending, done: mizPdfDone, onDownload: () => mizPdf.mutate() },
              { format: "Excel", isPending: mizXls.isPending, done: mizXlsDone, onDownload: () => mizXls.mutate() },
            ]}
          />

          <LinkCard
            icon={<BookOpen size={16} />}
            title={t("reports.arApAging")}
            description={t("reports.arApAgingDesc")}
            href="/ar-ap"
            linkLabel={t("reports.goToArAp")}
          />
        </div>
      </section>

      {/* ── Stok ── */}
      <section>
        <SectionLabel icon={<Package size={14} />} label={t("reports.stock")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            icon={<Package size={16} />}
            title={t("reports.stockValuation")}
            description={t("reports.stockValuationDesc")}
            actions={[
              { format: "PDF",   isPending: stokPdf.isPending, done: stokPdfDone, onDownload: () => stokPdf.mutate() },
              { format: "Excel", isPending: stokXls.isPending, done: stokXlsDone, onDownload: () => stokXls.mutate() },
            ]}
          />

          <LinkCard
            icon={<Package size={16} />}
            title={t("reports.criticalStock")}
            description={t("reports.criticalStockDesc")}
            href="/stok"
            linkLabel={t("reports.goToStock")}
          />
        </div>
      </section>

      {/* ── İK ── */}
      <section>
        <SectionLabel icon={<Users size={14} />} label={t("reports.hr")} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ReportCard
            icon={<FileCode2 size={16} />}
            title={t("reports.sgkBildirge")}
            description={t("reports.sgkBildirgeDesc")}
            filter={
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground shrink-0">{t("reports.period")}</span>
                <MonthPicker
                  t={t}
                  year={sgkYear}
                  month={sgkMonth}
                  onChange={(y, m) => { setSgkYear(y); setSgkMonth(m); }}
                />
              </div>
            }
            actions={[
              { format: "XML", isPending: sgkXml.isPending, done: sgkDone, onDownload: () => sgkXml.mutate() },
            ]}
          />

          <LinkCard
            icon={<Users size={16} />}
            title={t("reports.payrollSlips")}
            description={t("reports.payrollSlipsDesc")}
            href="/bordro"
            linkLabel={t("reports.goToPayroll")}
          />
        </div>
      </section>
    </div>
  );
}

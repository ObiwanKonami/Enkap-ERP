"use client";

import { useState } from "react";
import {
  ReceiptText,
  Eye,
  Send,
  Info,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface OnizleResponse {
  xml: string;
}
interface GonderResponse {
  success: boolean;
  message: string;
  referenceNo?: string;
}
interface ToastMsg {
  text: string;
  ok: boolean;
}

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const MONTHS = [
  { value: 1,  labelKey: "jan" },
  { value: 2,  labelKey: "feb" },
  { value: 3,  labelKey: "mar" },
  { value: 4,  labelKey: "apr" },
  { value: 5,  labelKey: "may" },
  { value: 6,  labelKey: "jun" },
  { value: 7,  labelKey: "jul" },
  { value: 8,  labelKey: "aug" },
  { value: 9,  labelKey: "sep" },
  { value: 10, labelKey: "oct" },
  { value: 11, labelKey: "nov" },
  { value: 12, labelKey: "dec" },
];

const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const YEARS = [currentYear - 1, currentYear];

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function EDefterPage() {
  const { t } = useI18n();
  const [year,    setYear]    = useState<number>(currentYear);
  const [month,   setMonth]   = useState<number>(currentMonth);
  const [xml,     setXml]     = useState<string | null>(null);
  const [loading, setLoading] = useState<"onizle" | "gonder" | null>(null);
  const [toast,   setToast]   = useState<ToastMsg | null>(null);

  function showToast(msg: ToastMsg) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  async function handleOnizle() {
    setLoading("onizle");
    setXml(null);
    setToast(null);
    try {
      const res = await apiClient.get<OnizleResponse>(
        `/financial/edefter/onizle?yil=${year}&ay=${month}`,
      );
      const xmlContent =
        ((res.data as unknown as Record<string, unknown>).yevmiyeXml as string) ??
        ((res.data as unknown as Record<string, unknown>).xml as string) ??
        JSON.stringify(res.data, null, 2);
      setXml(xmlContent);
    } catch {
      showToast({ text: t("eLedger.previewFailed"), ok: false });
    } finally {
      setLoading(null);
    }
  }

  async function handleGonder() {
    const monthLabel =
      t(`eLedger.months.${MONTHS.find((m) => m.value === month)?.labelKey}`) ??
      String(month);
    const confirmMsg = `${year} ${t("common.year")} ${monthLabel} ${t("eLedger.sendConfirm")}`;
    if (!window.confirm(confirmMsg)) return;

    setLoading("gonder");
    setToast(null);
    try {
      const res = await apiClient.post<GonderResponse>(
        "/financial/edefter/gonder",
        { yil: year, ay: month, vkn: "0000000000", unvan: "Şirket" },
      );
      const ref = res.data.referenceNo
        ? ` (${t("eLedger.referenceNo")}: ${res.data.referenceNo})`
        : "";
      showToast({ text: t("eLedger.sendSuccess") + ref, ok: true });
    } catch {
      showToast({ text: t("eLedger.sendFailed"), ok: false });
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-2">
        <ReceiptText size={20} className="text-sky-500" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("eLedger.title")}
        </h1>
        <span className="text-sm text-muted-foreground ml-1">
          {t("eLedger.subtitle")}
        </span>
      </div>

      {/* Bilgi notu */}
      <Alert className="border-sky-500/20 bg-sky-500/5">
        <Info size={14} className="text-sky-500" />
        <AlertDescription className="text-muted-foreground text-xs leading-relaxed">
          <span className="text-sky-500 font-semibold">{t("eLedger.gibStandard")}</span>
          {t("eLedger.gibDescription")}
        </AlertDescription>
      </Alert>

      {/* Dönem seçimi + eylemler */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("eLedger.periodSelection")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          {/* Yıl */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("eLedger.year")}
            </Label>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
              disabled={busy}
            >
              <SelectTrigger className="w-[100px] h-9 text-sm bg-muted/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ay */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("eLedger.month")}
            </Label>
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
              disabled={busy}
            >
              <SelectTrigger className="w-[150px] h-9 text-sm bg-muted/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={String(m.value)}>
                    {t(`eLedger.months.${m.labelKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Butonlar */}
          <div className="flex items-center gap-2 pb-0.5">
            <Button
              variant="outline"
              onClick={handleOnizle}
              disabled={busy}
              className="h-9 gap-2"
            >
              {loading === "onizle" ? (
                <><Loader2 size={14} className="animate-spin" /> {t("eLedger.previewing")}</>
              ) : (
                <><Eye size={14} /> {t("eLedger.preview")}</>
              )}
            </Button>

            <Button
              onClick={handleGonder}
              disabled={busy}
              className="h-9 gap-2"
            >
              {loading === "gonder" ? (
                <><Loader2 size={14} className="animate-spin" /> {t("eLedger.sending")}</>
              ) : (
                <><Send size={14} /> {t("eLedger.sendToGib")}</>
              )}
            </Button>
          </div>

          {/* Bildirim bandı */}
          {toast && (
            <div
              className={cn(
                "w-full flex items-center gap-2 mt-1 px-4 py-2.5 rounded-lg text-sm border",
                toast.ok
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                  : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {toast.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {toast.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* XML önizleme */}
      {xml && (
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/30 py-3 px-5">
            <div className="flex items-center gap-2">
              <ReceiptText size={14} className="text-sky-500" />
              <CardTitle className="text-sm font-semibold text-foreground">
                {t("eLedger.xmlPreviewTitle")} — {year}/{String(month).padStart(2, "0")}
              </CardTitle>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {xml.length.toLocaleString("tr-TR")} {t("eLedger.characters")}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-96 w-full">
              <pre className="p-4 text-xs text-sky-400 whitespace-pre-wrap break-all leading-relaxed bg-black/20">
                {xml}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Boş durum */}
      {!xml && loading !== "onizle" && (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
            <ReceiptText size={36} className="text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">{t("eLedger.emptyState")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

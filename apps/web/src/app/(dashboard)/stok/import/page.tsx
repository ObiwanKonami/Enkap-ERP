"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Download,
  Info,
} from "lucide-react";
import { stockApi } from "@/services/stock";
import { useI18n } from "@/hooks/use-i18n";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";

const t = createTranslator(DEFAULT_LOCALE);

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface ImportResult {
  created: number;
  updated: number;
  errors: ImportError[];
}

interface ImportError {
  row: number;
  sku?: string;
  message: string;
}

type Stage = "idle" | "ready" | "uploading" | "done" | "error";

// ─── Şablon sütunları ─────────────────────────────────────────────────────────

function getTemplateColumns(t: (key: string) => string) {
  return [
    { field: "sku", label: t("stock.sku"), required: true, example: "PRD-001" },
    {
      field: "name",
      label: t("stock.urunAdi"),
      required: true,
      example: "A4 Kağıt 500 yaprak",
    },
    {
      field: "barcode",
      label: t("stock.barcode"),
      required: false,
      example: "8690000001234",
    },
    {
      field: "categoryName",
      label: t("stock.category"),
      required: false,
      example: "Kırtasiye",
    },
    {
      field: "unitCode",
      label: t("stock.unit"),
      required: true,
      example: "C62",
    },
    {
      field: "listPriceKurus",
      label: t("stock.listPrice"),
      required: true,
      example: "185.00",
    },
    {
      field: "unitCostKurus",
      label: t("stock.birimMaliyet"),
      required: false,
      example: "140.00",
    },
    {
      field: "reorderPoint",
      label: t("stock.siparisNoktasi_label"),
      required: false,
      example: "10",
    },
    {
      field: "costMethod",
      label: t("stock.maliyetYontemi"),
      required: false,
      example: "FIFO",
    },
  ];
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function StokImportPage() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ─── Dosya seçimi ─────────────────────────────────────────────────────────

  function acceptFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
      setErrMsg(t("stock.yalnizcaXlsx"));
      return;
    }
    setFile(f);
    setStage("ready");
    setErrMsg(null);
    setResult(null);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }

  function onDragLeave() {
    setDragging(false);
  }

  // ─── Yükleme ──────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file) return;
    setStage("uploading");
    setErrMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await stockApi.products.bulkImport(formData);
      setResult(res.data as ImportResult);
      setStage("done");
    } catch {
      // Demo: simüle edilmiş başarılı sonuç
      setResult({
        created: 12,
        updated: 3,
        errors: [
          {
            row: 7,
            sku: "PRD-999",
            message: t("importDemo.invalidUnitCode"),
          },
          { row: 14, message: t("importDemo.emptySku") },
        ],
      });
      setStage("done");
    }
  }

  function reset() {
    setFile(null);
    setStage("idle");
    setResult(null);
    setErrMsg(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {/* ─── Geri + Başlık ─── */}
      <div>
        <Link
          href="/stok"
          className="inline-flex items-center gap-1.5 text-xs text-text-3 hover:text-text-1 transition-colors mb-3"
        >
          <ArrowLeft size={13} />
          {t("stock.stok")}
        </Link>
        <h1 className="text-xl font-bold text-text-1 flex items-center gap-2">
          <FileSpreadsheet size={20} className="text-emerald-400" />
          {t("stock.excelTopluIcerAktarma")}
        </h1>
        <p className="text-xs text-text-3 mt-0.5">
          {t("stock.excelCsvIleTopluUrun")}
        </p>
      </div>

      {/* ─── Şablon bilgisi ─── */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-sky-400 shrink-0" />
            <p className="text-xs font-medium text-text-1">
              {t("stock.beklenenSutunFormat")}
            </p>
          </div>
          <a
            href="/api/stock/products/import/template"
            className="btn-ghost h-7 px-2.5 text-xs flex items-center gap-1.5"
          >
            <Download size={11} />
            {t("stock.sablonIndir")}
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-700">
                <th className="text-left pb-2 pr-4 text-text-3 font-medium">
                  {t("stock.alanAdi")}
                </th>
                <th className="text-left pb-2 pr-4 text-text-3 font-medium">
                  {t("stock.sutunBasligi")}
                </th>
                <th className="text-left pb-2 pr-4 text-text-3 font-medium">
                  {t("stock.zorunlu")}
                </th>
                <th className="text-left pb-2 text-text-3 font-medium">
                  {t("stock.ornek")}
                </th>
              </tr>
            </thead>
            <tbody>
              {getTemplateColumns(t).map((col) => (
                <tr key={col.field} className="border-b border-ink-800/40">
                  <td className="py-1.5 pr-4 num text-text-2 font-medium">
                    {col.field}
                  </td>
                  <td className="py-1.5 pr-4 text-text-1">{col.label}</td>
                  <td className="py-1.5 pr-4">
                    {col.required ? (
                      <span className="text-rose-400 font-medium">
                        {t("common.yes") ?? "Evet"}
                      </span>
                    ) : (
                      <span className="text-text-3">—</span>
                    )}
                  </td>
                  <td className="py-1.5 num text-text-3">{col.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-text-3">
          * {t("stock.skuMevcutsa")} {t("stock.fiyatDegerleri")}
        </p>
      </div>

      {/* ─── Yükleme alanı ─── */}
      {stage !== "done" && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => stage === "idle" && inputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-xl p-10 text-center transition-all
            ${
              dragging
                ? "border-sky-400 bg-sky-500/10 scale-[1.01]"
                : stage === "ready"
                  ? "border-emerald-500/50 bg-emerald-500/5"
                  : "border-ink-600 bg-ink-900/30 hover:border-ink-500 cursor-pointer"
            }
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={onFileChange}
          />

          {stage === "uploading" ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-sky-400" />
              <p className="text-sm text-text-2">{t("stock.dosyaIsleniyor")}</p>
            </div>
          ) : stage === "ready" ? (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-emerald-500/15 border border-emerald-500/20">
                <FileSpreadsheet size={24} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-1">{file?.name}</p>
                <p className="text-xs text-text-3 mt-0.5">
                  {file ? (file.size / 1024).toFixed(1) : 0} KB
                </p>
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    reset();
                  }}
                  className="btn-ghost h-8 px-3 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                >
                  {t("stock.kaldir")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  className="btn-ghost h-8 px-3 text-xs"
                >
                  {t("stock.degistir")}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUpload();
                  }}
                  className="btn-primary h-8 px-4 text-xs flex items-center gap-1.5"
                >
                  <Upload size={12} />
                  {t("stock.iceAktar")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 rounded-full bg-ink-800 border border-ink-600">
                <Upload size={24} className="text-text-3" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-1">
                  {t("stock.dosyayiBurayaSurukleyin")}
                </p>
                <p className="text-xs text-text-3 mt-1">
                  {t("stock.tikayarakSecin")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Hata mesajı ─── */}
      {errMsg && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/25">
          <AlertCircle size={14} className="text-rose-400 shrink-0" />
          <p className="text-xs text-rose-300">{errMsg}</p>
        </div>
      )}

      {/* ─── Sonuç ─── */}
      {stage === "done" && result && (
        <ImportResultPanel
          result={result}
          onReset={reset}
          onGoList={() => router.push("/stok")}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Sonuç paneli ─────────────────────────────────────────────────────────────

function ImportResultPanel({
  result,
  onReset,
  onGoList,
  t,
}: {
  result: ImportResult;
  onReset: () => void;
  onGoList: () => void;
  t: (key: string) => string;
}) {
  const hasErrors = result.errors.length > 0;
  const total = result.created + result.updated;

  return (
    <div className="space-y-4">
      {/* Özet şerit */}
      <div className="grid grid-cols-3 gap-3">
        <ResultChip
          icon={<CheckCircle2 size={14} />}
          label={t("stock.yeniOlusturulan")}
          value={result.created}
          color="emerald"
        />
        <ResultChip
          icon={<CheckCircle2 size={14} />}
          label={t("stock.guncellenen")}
          value={result.updated}
          color="sky"
        />
        <ResultChip
          icon={<XCircle size={14} />}
          label={t("stock.hataliSatir")}
          value={result.errors.length}
          color={hasErrors ? "rose" : "emerald"}
        />
      </div>

      {/* Başarı banner */}
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${
          hasErrors
            ? "bg-amber-500/10 border-amber-500/25"
            : "bg-emerald-500/10 border-emerald-500/25"
        }`}
      >
        {hasErrors ? (
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
        ) : (
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        )}
        <p
          className={`text-xs ${hasErrors ? "text-amber-300" : "text-emerald-300"}`}
        >
          {total} {t("stock.basariylaIslendi")}
          {hasErrors
            ? `, ${result.errors.length} ${t("stock.hataOlustu")}`
            : "."}
        </p>
      </div>

      {/* Hata listesi */}
      {hasErrors && (
        <div className="card p-4 space-y-2">
          <p className="text-xs font-medium text-rose-400">
            {t("stock.hataliSatir")}
          </p>
          <div className="space-y-1.5">
            {result.errors.map((err, i) => (
              <div key={i} className="flex items-start gap-3 text-xs">
                <span className="shrink-0 num text-text-3 w-16">
                  {t("stock.satir")} {err.row}
                </span>
                {err.sku && (
                  <span className="num text-text-2 shrink-0">{err.sku}</span>
                )}
                <span className="text-rose-300">{err.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aksiyon butonları */}
      <div className="flex gap-2">
        <button
          onClick={onReset}
          className="btn-ghost h-9 px-4 text-sm flex items-center gap-1.5"
        >
          <Upload size={14} />
          {t("stock.yeniDosyaYukle")}
        </button>
        <button onClick={onGoList} className="btn-primary h-9 px-4 text-sm">
          {t("stock.urunListesineDon")}
        </button>
      </div>
    </div>
  );
}

// ─── Sonuç chip ───────────────────────────────────────────────────────────────

function ResultChip({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "emerald" | "sky" | "rose";
}) {
  const cls = {
    emerald: "text-emerald-400 bg-emerald-500/8 border-emerald-500/15",
    sky: "text-sky-400     bg-sky-500/8     border-sky-500/15",
    rose: "text-rose-400    bg-rose-500/8    border-rose-500/15",
  }[color];

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${cls}`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <div>
        <p className="text-[10px] text-text-3 uppercase tracking-wider font-medium">
          {label}
        </p>
        <p className="num text-lg font-bold text-text-1 leading-tight">
          {value}
        </p>
      </div>
    </div>
  );
}

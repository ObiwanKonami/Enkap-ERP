"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Layers,
  Check,
  Loader2,
  AlertCircle,
  Info,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import {
  assetApi,
  CATEGORY_LABELS,
  CATEGORY_LIFE,
  type AssetCategory,
  type DepreciationMethod,
} from "@/services/asset";
import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DateInput } from '@/components/ui/date-input';
import { cn } from "@/lib/utils";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const CATEGORIES: AssetCategory[] = [
  "ARSA_ARAZI",
  "BINA",
  "MAKINE_TECHIZAT",
  "TASIT",
  "DEMIRBASLAR",
  "BILGISAYAR",
  "DIGER",
];

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function YeniVarlikPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    assetCode: "",
    category: "BILGISAYAR" as AssetCategory,
    depreciationMethod: "NORMAL" as DepreciationMethod,
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionCostInput: "",
    salvageValueInput: "",
    location: "",
  });
  const [error, setError] = useState("");

  const set =
    <K extends keyof typeof form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const lifeYears = CATEGORY_LIFE[form.category];
  const isArsa = form.category === "ARSA_ARAZI";
  const costVal = parseFloat(form.acquisitionCostInput.replace(",", "."));
  const salvageVal = parseFloat(form.salvageValueInput.replace(",", ".")) || 0;
  const isValid =
    form.name.trim() &&
    form.assetCode.trim() &&
    form.acquisitionDate &&
    costVal > 0;

  const mutation = useMutation({
    mutationFn: () =>
      assetApi.create({
        name: form.name.trim(),
        assetCode: form.assetCode.trim(),
        category: form.category,
        depreciationMethod: isArsa ? undefined : form.depreciationMethod,
        acquisitionDate: form.acquisitionDate,
        acquisitionCostKurus: Math.round(costVal * 100),
        salvageValueKurus: salvageVal > 0 ? Math.round(salvageVal * 100) : undefined,
        location: form.location.trim() || undefined,
      }),
    onSuccess: (res) => router.push(`/duran-varlik/${res.data.id}`),
    onError: () => setError(t("finance.fixedAssets.saveError")),
  });

  const summaryRows = [
    {
      label: t("finance.fixedAssets.category"),
      value: CATEGORY_LABELS[form.category],
    },
    {
      label: t("finance.fixedAssets.usefulLife"),
      value: lifeYears > 0 ? `${lifeYears} ${t("common.year")}` : t("finance.fixedAssets.notDepreciable"),
    },
    {
      label: t("finance.fixedAssets.method"),
      value: isArsa ? "—" : t(`finance.fixedAssets.methodLabels.${form.depreciationMethod}`),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
          <Link href="/duran-varlik">
            <ArrowLeft size={15} />
          </Link>
        </Button>
        <Layers size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("finance.fixedAssets.newAsset")}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
        {/* Sol — Form */}
        <div className="flex flex-col gap-5">
          {/* Temel Bilgiler */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.fixedAssets.basicInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Varlık Adı */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("finance.fixedAssets.assetName")} *
                </Label>
                <Input
                  placeholder={t("finance.fixedAssets.assetNamePlaceholder")}
                  value={form.name}
                  onChange={set("name")}
                  className="h-9 bg-muted/40"
                />
              </div>

              {/* Kod + Konum */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("finance.fixedAssets.trackingCode")} *
                  </Label>
                  <Input
                    placeholder="DV-2026-001"
                    value={form.assetCode}
                    onChange={set("assetCode")}
                    className="h-9 bg-muted/40 "
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("finance.fixedAssets.location")}
                  </Label>
                  <Input
                    placeholder={t("finance.fixedAssets.locationPlaceholder")}
                    value={form.location}
                    onChange={set("location")}
                    className="h-9 bg-muted/40"
                  />
                </div>
              </div>

              {/* Kategori */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("finance.fixedAssets.category")} *
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v as AssetCategory }))}
                >
                  <SelectTrigger className="h-9 bg-muted/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lifeYears > 0 ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Info size={11} />
                    {t("finance.fixedAssets.vukUsefulLife")}: {lifeYears} {t("common.year")} — {t("finance.fixedAssets.rate")}: %{Math.round((1 / lifeYears) * 100)}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <AlertTriangle size={11} />
                    {t("finance.fixedAssets.arsaNotDepreciable")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Amortisman Yöntemi */}
          {!isArsa && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("finance.fixedAssets.depreciationMethod")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-1 bg-muted/50 border border-border rounded-lg p-1">
                  {(["NORMAL", "AZALAN_BAKIYE"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, depreciationMethod: m }))}
                      className={cn(
                        "flex-1 h-8 text-xs font-medium rounded-md border transition-all",
                        form.depreciationMethod === m
                          ? "bg-primary/10 border-primary/20 text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      {t(`finance.fixedAssets.methodLabels.${m}`)}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Finansal Bilgiler */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.fixedAssets.financialInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("finance.fixedAssets.acquisitionDate")} *
                  </Label>
                  <DateInput
                    className="h-9 bg-muted/40 "
                    value={form.acquisitionDate}
                    onChange={set("acquisitionDate")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("finance.fixedAssets.acquisitionCost")} *
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₺</span>
                    <Input
                      className="h-9 bg-muted/40 pl-7 "
                      placeholder="125000.00"
                      value={form.acquisitionCostInput}
                      onChange={set("acquisitionCostInput")}
                    />
                  </div>
                </div>

                {!isArsa && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("finance.fixedAssets.salvageValue")}
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₺</span>
                      <Input
                        className="h-9 bg-muted/40 pl-7 "
                        placeholder="0.00"
                        value={form.salvageValueInput}
                        onChange={set("salvageValueInput")}
                      />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Hata */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Sağ — Özet + Kaydet */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("common.summary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {summaryRows.map((r) => (
                <div key={r.label} className="flex justify-between items-baseline gap-2">
                  <span className="text-muted-foreground text-xs">{r.label}</span>
                  <span className="font-medium text-foreground text-xs text-right">{r.value}</span>
                </div>
              ))}

              {costVal > 0 && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">{t("finance.fixedAssets.cost")}</span>
                    <span className="text-base font-bold text-foreground tabular-nums">
                      {formatCurrency(costVal)}
                    </span>
                  </div>
                  {!isArsa && lifeYears > 0 && (
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-muted-foreground">{t("finance.fixedAssets.annualDepreciation")}</span>
                      <span className="text-sm font-semibold text-primary tabular-nums">
                        {formatCurrency((costVal - salvageVal) / lifeYears)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full h-9 gap-2 shadow-sm"
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            disabled={mutation.isPending || !isValid}
          >
            <Check size={14} /> {t("finance.fixedAssets.saveAsset")}
          </Button>

          {!isValid && (
            <p className="text-center text-xs text-muted-foreground">
              {t("finance.fixedAssets.requiredFields")}
            </p>
          )}

          <Button variant="ghost" asChild className="w-full text-xs text-muted-foreground">
            <Link href="/duran-varlik">{t("common.cancel")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

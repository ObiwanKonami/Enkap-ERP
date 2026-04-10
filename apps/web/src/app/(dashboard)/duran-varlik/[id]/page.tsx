"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Check,
  X,
  AlertCircle,
  TrendingDown,
  Calendar,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  assetApi,
  CATEGORY_LABELS,
  type AssetStatus,
  type DepreciationMethod,
} from "@/services/asset";
import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, kurusToTl, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* ─── Status Config ──────────────────────────────────────────────── */
const STATUS_CONFIG: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
  AKTIF:             { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
  TAMAMEN_AMORTIZE:  { variant: "outline", className: "text-muted-foreground" },
  ELDEN_CIKARILDI:   { variant: "destructive" },
};

/* ─── Dispose Modal ──────────────────────────────────────────────── */
function DisposeModal({
  assetId,
  assetName,
  open,
  onClose,
  onSuccess,
  t,
}: {
  assetId: string;
  assetName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string) => string;
}) {
  const [disposalDate, setDisposalDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      assetApi.dispose(assetId, { disposalDate, notes: notes || undefined }),
    onSuccess,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-muted-foreground" />
            {t("finance.fixedAssets.disposeAsset")}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <strong>{assetName}</strong> {t("finance.fixedAssets.disposeConfirm")}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.disposalDate")} *
            </Label>
            <DateInput
              className="h-9"
              value={disposalDate}
              onChange={(e) => setDisposalDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("common.notes")} ({t("common.optional")})
            </Label>
            <Input
              className="h-9"
              placeholder={t("finance.fixedAssets.notesPlaceholder")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertCircle size={14} />
            <AlertDescription>{t("finance.fixedAssets.disposeFailed")}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            isLoading={mutation.isPending}
            disabled={!disposalDate || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("finance.fixedAssets.dispose")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Depreciation Schedule ──────────────────────────────────────── */
function DepreciationSchedule({
  assetId,
  t,
}: {
  assetId: string;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(true);

  const { data: schedule = [], isLoading } = useQuery({
    queryKey: ["asset-depreciation", assetId],
    queryFn: () => assetApi.depreciation(assetId).then((r) => r.data),
    enabled: open,
  });

  return (
    <Card className="shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingDown size={15} className="text-muted-foreground" />
          {t("finance.fixedAssets.depreciationSchedule")}
          {schedule.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-2 py-0">
              {schedule.length} {t("common.year")}
            </Badge>
          )}
        </div>
        {open ? (
          <ChevronUp size={15} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={15} className="text-muted-foreground" />
        )}
      </button>

      {open && (
        <>
          <Separator />
          <CardContent className="p-0">
            {isLoading && (
              <div className="p-4 flex flex-col gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            )}
            {!isLoading && schedule.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                {t("finance.fixedAssets.noDepreciation")}
              </div>
            )}
            {schedule.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="font-semibold">{t("common.year")}</TableHead>
                      <TableHead className="font-semibold">{t("finance.fixedAssets.method")}</TableHead>
                      <TableHead className="text-right font-semibold">{t("finance.fixedAssets.openingBookValue")}</TableHead>
                      <TableHead className="text-right font-semibold">{t("finance.fixedAssets.cost")}</TableHead>
                      <TableHead className="text-right font-semibold">{t("finance.fixedAssets.closingBookValue")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schedule.map((row) => (
                      <TableRow key={row.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell className="tabular-nums font-semibold text-muted-foreground">
                          {row.year}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t(`finance.fixedAssets.methodLabels.${row.method}`)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(kurusToTl(row.openingBookValueKurus))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          - {formatCurrency(kurusToTl(row.depreciationKurus))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-foreground">
                          {row.closingBookValueKurus === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            formatCurrency(kurusToTl(row.closingBookValueKurus))
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </>
      )}
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function DuranVarlikDetayPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [showDisposeModal, setShowDisposeModal] = useState(false);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const {
    data: asset,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => assetApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !asset) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertCircle size={32} className="text-destructive opacity-60" />
          <p className="text-sm text-muted-foreground">{t("common.noRecord")}</p>
          <Button variant="outline" onClick={() => router.push("/duran-varlik")}>
            {t("common.back")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* Amortisman ilerlemesi */
  const depreciationPct =
    asset.acquisitionCostKurus > 0
      ? Math.round(
          (asset.accumulatedDepreciationKurus / asset.acquisitionCostKurus) *
            100,
        )
      : 0;

  const statusCfg = STATUS_CONFIG[asset.status];

  return (
    <div className="flex flex-col gap-6">
      {/* Üst başlık */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
            <Link href="/duran-varlik">
              <ArrowLeft size={15} />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-muted-foreground" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {asset.assetCode}
              </h1>
              <Badge
                variant={statusCfg.variant}
                className={cn("text-[10px] font-semibold uppercase tracking-wider", statusCfg.className)}
              >
                {t(`finance.fixedAssets.statusLabels.${asset.status}`)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-7">{asset.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 ml-7">
              {CATEGORY_LABELS[asset.category]}
              {asset.location && ` · ${asset.location}`}
            </p>
          </div>
        </div>

        {asset.status === "AKTIF" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setShowDisposeModal(true)}
          >
            <X size={13} /> {t("finance.fixedAssets.dispose")}
          </Button>
        )}
      </div>

      {/* KPI satırı */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.acquisitionCost")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {formatCurrency(kurusToTl(asset.acquisitionCostKurus))}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(asset.acquisitionDate)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.accumulatedDepr")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-destructive tabular-nums">
              {formatCurrency(kurusToTl(asset.accumulatedDepreciationKurus))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("common.total")} %{depreciationPct}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.netBookValue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
              {formatCurrency(kurusToTl(asset.bookValueKurus))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t("finance.fixedAssets.salvageValue")}: {formatCurrency(kurusToTl(asset.salvageValueKurus))}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.fixedAssets.depreciation")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold text-foreground">
              {t(`finance.fixedAssets.methodLabels.${asset.depreciationMethod}`)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              %{asset.depreciationRate} · {asset.usefulLifeYears} {t("common.year")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Amortisman ilerleme çubuğu */}
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <div className="flex justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("finance.fixedAssets.depreciationProgress")}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(kurusToTl(asset.accumulatedDepreciationKurus))} /{" "}
              {formatCurrency(kurusToTl(asset.acquisitionCostKurus))} (%{depreciationPct})
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                depreciationPct >= 100 ? "bg-muted-foreground" : "bg-primary"
              )}
              style={{ width: `${depreciationPct}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Amortisman takvimi */}
      <DepreciationSchedule assetId={id} t={t} />

      {/* Elden çıkarma bilgileri */}
      {asset.status === "ELDEN_CIKARILDI" &&
        (asset.disposalDate || asset.disposalNotes) && (
          <Card className="shadow-sm border-destructive/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-destructive">
                {t("finance.fixedAssets.disposalInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {asset.disposalDate && (
                <p className="text-sm text-muted-foreground">
                  {t("finance.fixedAssets.disposalDate")}:{" "}
                  <span className="tabular-nums text-foreground">{formatDate(asset.disposalDate)}</span>
                </p>
              )}
              {asset.disposalNotes && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {asset.disposalNotes}
                </p>
              )}
            </CardContent>
          </Card>
        )}

      {/* Elden çıkarma modalı */}
      {showDisposeModal && (
        <DisposeModal
          assetId={id}
          assetName={asset.name}
          open={showDisposeModal}
          onClose={() => setShowDisposeModal(false)}
          onSuccess={() => {
            setShowDisposeModal(false);
            qc.invalidateQueries({ queryKey: ["asset", id] });
            showToast(t("finance.fixedAssets.disposeSuccess"));
          }}
          t={t}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border",
            toast.type === "success"
              ? "bg-card border-border text-foreground"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          )}
        >
          {toast.type === "success" ? <Check size={14} className="text-primary" /> : <AlertCircle size={14} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

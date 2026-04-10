"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Plus,
  Check,
  X,
  AlertCircle,
  DollarSign,
  BarChart2,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import {
  projectApi,
  COST_TYPE_LABELS,
  type CostType,
} from "@/services/project";
import { useI18n } from "@/hooks/use-i18n";

import { formatCurrency, kurusToTl, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ─── Status Config ──────────────────────────────────────────────── */
const STATUS_CONFIG: Record<
  string,
  { variant: "default" | "secondary" | "outline" | "destructive"; className?: string }
> = {
  AKTIF: { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
  BEKLEMEDE: { variant: "outline", className: "text-muted-foreground" },
  TAMAMLANDI: { variant: "outline", className: "text-muted-foreground border-primary/30 text-primary" },
  IPTAL: { variant: "destructive" },
};

/* ─── Add Cost Modal ─────────────────────────────────────────────── */
function AddCostModal({
  projectId,
  open,
  onClose,
  onSuccess,
  t,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string) => string;
}) {
  const [form, setForm] = useState({
    costType: "ISGUCU" as CostType,
    description: "",
    costDate: new Date().toISOString().slice(0, 10),
    amountKurus: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      projectApi.addCost(projectId, {
        costType: form.costType,
        description: form.description,
        costDate: form.costDate,
        amountKurus: Math.round(parseFloat(form.amountKurus) * 100),
      }),
    onSuccess,
  });

  const valid =
    form.description.trim() &&
    parseFloat(form.amountKurus) > 0 &&
    form.costDate;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign size={16} className="text-muted-foreground" />
            {t("finance.project.addCost")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5 col-span-1">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.project.costType")} *
            </Label>
            <Select
              value={form.costType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, costType: v as CostType }))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(COST_TYPE_LABELS) as [CostType, string][]).map(
                  ([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 col-span-1">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.project.date")} *
            </Label>
            <DateInput
              className="h-9"
              value={form.costDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, costDate: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.project.description")} *
            </Label>
            <Input
              className="h-9"
              placeholder={t("finance.project.description")}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.project.amount")} *
            </Label>
            <Input
              type="number"
              className="h-9 text-right"
              placeholder="0,00"
              min={0}
              step={0.01}
              value={form.amountKurus}
              onChange={(e) =>
                setForm((f) => ({ ...f, amountKurus: e.target.value }))
              }
            />
          </div>
        </div>

        {mutation.isError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive border border-destructive/20">
            {t("finance.project.addCostFailed")}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            isLoading={mutation.isPending}
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("finance.project.add")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── P&L Panel ──────────────────────────────────────────────────── */
function PnLPanel({
  projectId,
  t,
}: {
  projectId: string;
  t: (key: string) => string;
}) {
  const { data: pnl, isLoading } = useQuery({
    queryKey: ["project-pnl", projectId],
    queryFn: () => projectApi.getPnL(projectId).then((r) => r.data),
  });

  if (isLoading)
    return (
      <Card className="shadow-sm">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Skeleton className="h-4 w-4 rounded-full" />
          {t("finance.project.calculating")}
        </CardContent>
      </Card>
    );
  if (!pnl) return null;

  const isProfit = pnl.grossProfit >= 0;
  const budgetUsedPct =
    pnl.budget > 0
      ? Math.min(100, Math.round((pnl.actualCost / pnl.budget) * 100))
      : 0;

  return (
    <Card className="shadow-sm overflow-hidden">
      <CardHeader className="border-b bg-muted/20 py-3 px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <BarChart2 size={16} className="text-muted-foreground" />
          {t("finance.project.profitLossSummary")}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t("finance.project.budget")}
          </div>
          <div className="text-2xl font-bold tracking-tight tabular-nums">
            {formatCurrency(kurusToTl(pnl.budget))}
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{t("finance.project.used")}</span>
              <span>{budgetUsedPct}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  budgetUsedPct >= 100
                    ? "bg-destructive"
                    : budgetUsedPct > 80
                      ? "bg-amber-500"
                      : "bg-primary"
                )}
                style={{ width: `${budgetUsedPct}%` }}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t("finance.project.revenue")}
          </div>
          <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
            {formatCurrency(kurusToTl(pnl.revenue))}
          </div>
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-1">
            {t("finance.project.actualCost")}
          </div>
          <div className="text-lg font-semibold tracking-tight text-muted-foreground tabular-nums">
            {formatCurrency(kurusToTl(pnl.actualCost))}
          </div>
        </div>

        <div
          className={cn(
            "rounded-xl p-4 border",
            isProfit
              ? "bg-primary/5 border-primary/20"
              : "bg-destructive/5 border-destructive/20"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {isProfit ? (
              <TrendingUp size={16} className="text-primary" />
            ) : (
              <TrendingDown size={16} className="text-destructive" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.project.grossProfit")}
            </span>
          </div>
          <div
            className={cn(
              "text-3xl font-bold tracking-tight tabular-nums",
              isProfit ? "text-primary" : "text-destructive"
            )}
          >
            {formatCurrency(kurusToTl(pnl.grossProfit))}
          </div>
          <div
            className={cn(
              "text-sm font-medium mt-1 tabular-nums",
              isProfit ? "text-primary" : "text-destructive"
            )}
          >
            %{pnl.profitMargin.toFixed(1)} {t("finance.project.margin")}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function ProjeDetayPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [showCostModal, setShowCostModal] = useState(false);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const {
    data: project,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  const mutOpts = (msg: string) => ({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      showToast(msg);
    },
    onError: () => showToast(t("common.error"), "error"),
  });

  const closeMut = useMutation({
    mutationFn: () => projectApi.close(id),
    ...mutOpts(t("finance.project.closeProject")),
  });
  const cancelMut = useMutation({
    mutationFn: () => projectApi.cancel(id),
    ...mutOpts(t("finance.project.cancelProject")),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
          <AlertCircle size={32} className="text-destructive opacity-80 mb-4" />
          <p className="text-sm">{t("finance.project.notFound")}</p>
          <Button variant="ghost" className="mt-4" onClick={() => router.push("/proje")}>
            {t("finance.project.back")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const busy = closeMut.isPending || cancelMut.isPending;
  const budgetUsed =
    project.budgetKurus > 0
      ? Math.round((project.actualCostKurus / project.budgetKurus) * 100)
      : 0;

  const statusCfg = STATUS_CONFIG[project.status];

  return (
    <div className="flex flex-col gap-6">
      {/* Üst başlık */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
            <Link href="/proje">
              <ArrowLeft size={16} />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Briefcase size={18} className="text-muted-foreground" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {project.projectCode}
              </h1>
              <Badge
                variant={statusCfg?.variant || "outline"}
                className={cn("text-[10px] uppercase tracking-wider", statusCfg?.className)}
              >
                {t(`finance.project.statusLabels.${project.status}`)}
              </Badge>
            </div>
            <div className="text-sm text-foreground mt-1 ml-[30px] font-medium">
              {project.name}
            </div>
            {project.customerName && (
              <div className="text-xs text-muted-foreground mt-0.5 ml-[30px]">
                {project.customerName}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {project.status === "AKTIF" && (
            <>
              <Button
                variant="default"
                className="gap-2"
                onClick={() => setShowCostModal(true)}
              >
                <Plus size={14} /> {t("finance.project.addCost")}
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                isLoading={closeMut.isPending}
                disabled={busy}
                onClick={() => {
                  if (confirm(t("finance.project.closeConfirm")))
                    closeMut.mutate();
                }}
              >
                <Check size={14} className="text-primary" /> {t("finance.project.closeAction")}
              </Button>
              <Button
                variant="outline"
                className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                isLoading={cancelMut.isPending}
                disabled={busy}
                onClick={() => {
                  if (confirm(t("finance.project.cancelConfirm")))
                    cancelMut.mutate();
                }}
              >
                <X size={14} /> {t("finance.project.cancelAction")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI satırı */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("finance.project.budget")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground tabular-nums">
              {formatCurrency(kurusToTl(project.budgetKurus))}
            </div>
            <div
              className={cn(
                "text-xs mt-1 font-medium",
                budgetUsed > 100 ? "text-destructive" : budgetUsed > 80 ? "text-amber-500" : "text-muted-foreground"
              )}
            >
              %{budgetUsed} {t("finance.project.used")}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("finance.project.actualCostLabel")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold tabular-nums",
                budgetUsed > 100 ? "text-destructive" : "text-foreground"
              )}
            >
              {formatCurrency(kurusToTl(project.actualCostKurus))}
            </div>
            <div className="text-xs text-muted-foreground mt-1 tabular-nums">
              {t("finance.project.remaining")}:{" "}
              {formatCurrency(kurusToTl(Math.max(0, project.budgetKurus - project.actualCostKurus)))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("finance.project.revenue")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary tabular-nums">
              {formatCurrency(kurusToTl(project.revenueKurus))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t("finance.project.start")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-foreground tabular-nums">
              {formatDate(project.startDate)}
            </div>
            {project.endDate && (
              <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                {t("finance.project.end")}: {formatDate(project.endDate)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bütçe ilerleme çubuğu */}
      <Card className="shadow-sm">
        <CardContent className="py-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("finance.project.budgetUsage")}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(kurusToTl(project.actualCostKurus))} / {formatCurrency(kurusToTl(project.budgetKurus))} (%{budgetUsed})
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                budgetUsed > 100 ? "bg-destructive" : budgetUsed > 80 ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(budgetUsed, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* P&L Özeti */}
      <PnLPanel projectId={id} t={t} />

      {/* Açıklama / Notlar */}
      {(project.description || project.notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {project.description && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("finance.project.description")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground leading-relaxed">
                {project.description}
              </CardContent>
            </Card>
          )}
          {project.notes && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("finance.project.notes")}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-foreground bg-muted/30 p-4 rounded-md mx-6 mb-6 leading-relaxed">
                {project.notes}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Maliyet ekleme modalı */}
      {showCostModal && (
        <AddCostModal
          projectId={id}
          open={showCostModal}
          onClose={() => setShowCostModal(false)}
          onSuccess={() => {
            setShowCostModal(false);
            qc.invalidateQueries({ queryKey: ["project", id] });
            qc.invalidateQueries({ queryKey: ["project-pnl", id] });
            showToast(t("finance.project.addCostSuccess"));
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
          {toast.type === "success" ? <CheckCircle2 size={16} className="text-primary" /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

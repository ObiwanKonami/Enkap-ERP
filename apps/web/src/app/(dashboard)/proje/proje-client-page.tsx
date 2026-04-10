"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Briefcase,
  Plus,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Search,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsRight,
  Wallet,
  Activity,
  CheckCircle2,
} from "lucide-react";
import {
  projectApi,
  type Project,
  type CostType,
  type ProjectPnL,
} from "@/services/project";
import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, kurusToTl, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DateInput } from '@/components/ui/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  buildProjeColumns,
  COST_TYPE_LABELS,
} from "./proje-table";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive" | "default"> = {
  AKTIF:      "secondary",
  BEKLEMEDE:  "outline",
  TAMAMLANDI: "outline",
  IPTAL:      "destructive",
};

const COST_TYPES: CostType[] = ["ISGUCU", "MALZEME", "GENEL_GIDER", "SEYAHAT", "DIGER"];

const fmtTry = (k: number) => formatCurrency(kurusToTl(k));

// ─── Add Cost Modal ───────────────────────────────────────────────────────────

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
  t: (k: string) => string;
}) {
  const [form, setForm] = useState({
    costType:    "ISGUCU" as CostType,
    description: "",
    costDate:    new Date().toISOString().slice(0, 10),
    amountKurus: "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError ] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      await projectApi.addCost(projectId, {
        ...form,
        amountKurus: Math.round(Number(form.amountKurus) * 100),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.errorOccurred"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-muted w-fit mb-2">
            <Plus size={15} className="text-muted-foreground" />
          </div>
          <DialogTitle className="text-base font-semibold">
            {t("finance.project.addCost")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.costType")}
            </Label>
            <Select
              value={form.costType}
              onValueChange={(v) => setForm((f) => ({ ...f, costType: v as CostType }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COST_TYPES.map((c) => (
                  <SelectItem key={c} value={c}>{COST_TYPE_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.description")} *
            </Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.date")}
            </Label>
            <DateInput
              value={form.costDate}
              onChange={(e) => setForm((f) => ({ ...f, costDate: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.amount")} *
            </Label>
            <Input
              type="number"
              step="0.01"
              className="text-right"
              value={form.amountKurus}
              onChange={(e) => setForm((f) => ({ ...f, amountKurus: e.target.value }))}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            isLoading={saving}
            disabled={saving || !form.description || !form.amountKurus}
            onClick={handleSubmit}
          >
            <Plus size={13} /> {t("finance.project.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Project Modal ────────────────────────────────────────────────────────

function NewProjectModal({
  open,
  onClose,
  onSuccess,
  t,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (k: string) => string;
}) {
  const [form, setForm] = useState({
    name:         "",
    customerName: "",
    startDate:    new Date().toISOString().slice(0, 10),
    budgetKurus:  "",
    currency:     "TRY",
    notes:        "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError ] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      await projectApi.create({
        ...form,
        budgetKurus:  Math.round(Number(form.budgetKurus) * 100),
        notes:        form.notes        || undefined,
        customerName: form.customerName || undefined,
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.errorOccurred"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="p-2 rounded-lg bg-muted w-fit mb-2">
            <Briefcase size={15} className="text-muted-foreground" />
          </div>
          <DialogTitle className="text-base font-semibold">
            {t("finance.project.newProject")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.projectName")} *
            </Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.customerName")}
            </Label>
            <Input
              value={form.customerName}
              onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.startDate")} *
            </Label>
            <DateInput
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.budget")}
            </Label>
            <Input
              type="number"
              step="0.01"
              className="text-right"
              placeholder="0,00"
              value={form.budgetKurus}
              onChange={(e) => setForm((f) => ({ ...f, budgetKurus: e.target.value }))}
            />
          </div>

          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("finance.project.notes")}
            </Label>
            <Textarea
              rows={3}
              className="resize-vertical"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive px-1">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            isLoading={saving}
            disabled={saving || !form.name}
            onClick={handleSubmit}
          >
            <Plus size={13} /> {t("finance.project.createProject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Row ──────────────────────────────────────────────────────────────

function ProjectRow({
  project,
  onRefresh,
  showToast,
  t,
}: {
  project: Project;
  onRefresh: () => void;
  showToast: (text: string, ok: boolean) => void;
  t: (k: string) => string;
}) {
  const [expanded,      setExpanded     ] = useState(false);
  const [showAddCost,   setShowAddCost  ] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [closing,       setClosing      ] = useState(false);
  const [cancelling,    setCancelling   ] = useState(false);
  const [pnl,           setPnl          ] = useState<ProjectPnL | null>(null);

  useEffect(() => {
    if (!expanded) return;
    projectApi.getPnL(project.id)
      .then((r) => setPnl(r.data as ProjectPnL))
      .catch(() => {});
  }, [expanded, project.id]);

  async function handleClose() {
    setClosing(true);
    try {
      await projectApi.close(project.id);
      onRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("common.errorOccurred"), false);
    } finally {
      setClosing(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await projectApi.cancel(project.id);
      setConfirmCancel(false);
      onRefresh();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t("common.errorOccurred"), false);
    } finally {
      setCancelling(false);
    }
  }

  const budgetUsed =
    Number(project.budgetKurus) > 0
      ? (Number(project.actualCostKurus) / Number(project.budgetKurus)) * 100
      : 0;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50 transition-colors group"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell className="w-8 pl-4 pr-2">
          <ChevronRight
            size={13}
            className={cn(
              "text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90",
            )}
          />
        </TableCell>

        <TableCell>
          <div className="text-xs font-semibold text-primary">{project.projectCode}</div>
          <div className="text-sm text-foreground mt-0.5">{project.name}</div>
        </TableCell>

        <TableCell className="text-sm text-muted-foreground">
          {project.customerName ?? "—"}
        </TableCell>

        <TableCell>
          <Badge variant={STATUS_VARIANT[project.status] ?? "outline"}>
            {t(`finance.project.statusLabels.${project.status}`)}
          </Badge>
        </TableCell>

        <TableCell className="text-right tabular-nums text-sm">
          {fmtTry(Number(project.budgetKurus))}
        </TableCell>

        <TableCell>
          <div className="w-20 h-1 bg-muted rounded-sm overflow-hidden">
            <div
              className={cn(
                "h-full rounded-sm transition-all duration-300",
                budgetUsed > 90
                  ? "bg-destructive"
                  : budgetUsed > 70
                    ? "bg-muted-foreground"
                    : "bg-primary",
              )}
              style={{ width: `${Math.min(100, budgetUsed)}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
            {Math.round(budgetUsed)}%
          </div>
        </TableCell>

        <TableCell className="text-sm text-muted-foreground tabular-nums">
          {formatDate(project.startDate)}
        </TableCell>

        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link
              href={`/proje/${project.id}`}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              title={t("common.detail")}
            >
              <ExternalLink size={12} />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 h-7 px-2"
              onClick={() => setShowAddCost(true)}
            >
              <Plus size={11} /> {t("finance.project.cost")}
            </Button>
            {project.status === "AKTIF" && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 h-7 px-2"
                isLoading={closing}
                disabled={closing}
                onClick={handleClose}
              >
                <Check size={11} /> {t("finance.project.closeAction")}
              </Button>
            )}
            {!["TAMAMLANDI", "IPTAL"].includes(project.status) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 h-7 px-2 text-destructive hover:text-destructive"
                onClick={() => setConfirmCancel(true)}
              >
                <X size={11} /> {t("finance.project.cancelAction")}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

      {expanded && pnl && (
        <TableRow>
          <TableCell colSpan={8} className="p-0 bg-muted/30 border-b border-border">
            <div className="grid grid-cols-4 divide-x divide-border px-6 py-4">
              <div className="px-4 first:pl-0">
                <p className="text-[11px] text-muted-foreground mb-1">{t("finance.project.budget")}</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">{fmtTry(pnl.budget)}</p>
              </div>
              <div className="px-4">
                <p className="text-[11px] text-muted-foreground mb-1">{t("finance.project.actualCost")}</p>
                <p className="text-sm font-semibold tabular-nums text-muted-foreground">{fmtTry(pnl.actualCost)}</p>
              </div>
              <div className="px-4">
                <p className="text-[11px] text-muted-foreground mb-1">{t("finance.project.revenue")}</p>
                <p className="text-sm font-semibold tabular-nums text-primary">{fmtTry(pnl.revenue)}</p>
              </div>
              <div className="px-4">
                <p className="text-[11px] text-muted-foreground mb-1">{t("finance.project.grossProfit")}</p>
                <div className="flex items-center gap-1">
                  {Number(pnl.grossProfit) >= 0
                    ? <TrendingUp size={13} className="text-primary" />
                    : <TrendingDown size={13} className="text-destructive" />}
                  <p className={cn(
                    "text-sm font-semibold tabular-nums",
                    Number(pnl.grossProfit) >= 0 ? "text-primary" : "text-destructive",
                  )}>
                    {fmtTry(pnl.grossProfit)}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  %{Number(pnl.profitMargin).toFixed(1)}
                </p>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      <AddCostModal
        projectId={project.id}
        open={showAddCost}
        onClose={() => setShowAddCost(false)}
        onSuccess={() => {
          onRefresh();
          showToast(t("finance.project.addCostSuccess"), true);
          setPnl(null); // bir sonraki expand'ta yeniden çekilsin
        }}
        t={t}
      />

      <Dialog open={confirmCancel} onOpenChange={(v) => !v && setConfirmCancel(false)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <div className="p-2 rounded-lg bg-destructive/10 w-fit mb-2">
              <X size={16} className="text-destructive" />
            </div>
            <DialogTitle className="text-base font-semibold">
              {t("finance.project.cancelAction")}
            </DialogTitle>
            <DialogDescription>
              {t("finance.project.cancelConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              isLoading={cancelling}
              disabled={cancelling}
              onClick={handleCancel}
            >
              {t("finance.project.cancelAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function ProjeClientPage() {
  const { t } = useI18n();
  const columns = useMemo(() => buildProjeColumns(t), [t]);

  // ── Tablo state ────────────────────────────────────────────────────────────
  const [search,       setSearch      ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage        ] = useState(1);
  const [limit,        setLimit       ] = useState(20);
  const [projects,     setProjects    ] = useState<Project[]>([]);
  const [total,        setTotal       ] = useState(0);
  const [loading,      setLoading     ] = useState(true);
  const [fetchError,   setFetchError  ] = useState<string | null>(null);
  const [refreshKey,   setRefreshKey  ] = useState(0);

  // ── KPI state ──────────────────────────────────────────────────────────────
  const [totalBudget,     setTotalBudget    ] = useState(0);
  const [totalCost,       setTotalCost      ] = useState(0);
  const [activeCount,     setActiveCount    ] = useState(0);
  const [completedCount,  setCompletedCount ] = useState(0);

  // ── Toast state ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // ── Modal state ────────────────────────────────────────────────────────────
  const [showNew, setShowNew] = useState(false);

  // ── KPI fetch (mount'ta bir kez) ───────────────────────────────────────────
  useEffect(() => {
    projectApi.list({ limit: 500 })
      .then((res) => {
        const payload = res.data as { items?: Project[]; data?: Project[]; total: number };
        const items = payload.data ?? payload.items ?? [];
        setTotalBudget(items.reduce((s, p) => s + Number(p.budgetKurus), 0));
        setTotalCost(items.reduce((s, p) => s + Number(p.actualCostKurus), 0));
        setActiveCount(items.filter((p) => p.status === "AKTIF").length);
        setCompletedCount(items.filter((p) => p.status === "TAMAMLANDI").length);
      })
      .catch(() => {});
  }, []);

  // ── Tablo fetch (debounced) ────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await projectApi.list({
          // @ts-expect-error — backend search henüz yok (eksik_filtreler.md)
          search:   search || undefined,
          status:   statusFilter !== "all" ? statusFilter : undefined,
          limit,
          offset:   (page - 1) * limit,
        });
        const payload = res.data as { items?: Project[]; data?: Project[]; total: number };
        setProjects(payload.data ?? payload.items ?? []);
        setTotal(payload.total ?? 0);
      } catch {
        setFetchError(t("finance.project.loadFailed"));
        setProjects([]); setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter, page, limit, refreshKey, t]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg",
          toast.ok
            ? "bg-primary text-primary-foreground"
            : "bg-destructive text-destructive-foreground",
        )}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.text}
        </div>
      )}

      {/* 1. Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("finance.project.title")}
          </h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("finance.project.newProject")}
        </Button>
      </div>

      {/* 2. KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Wallet className="h-4 w-4" />
              {t("finance.project.totalBudget")}
            </div>
            <p className="text-3xl font-bold text-primary">{fmtTry(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Activity className="h-4 w-4" />
              {t("finance.project.actual")}
            </div>
            <p className="text-3xl font-bold text-foreground">{fmtTry(totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Briefcase className="h-4 w-4" />
              {t("finance.project.activeProjects")}
            </div>
            <p className="text-3xl font-bold text-foreground">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <CheckCircle2 className="h-4 w-4" />
              {t("finance.project.completedProjects")}
            </div>
            <p className="text-3xl font-bold text-foreground">{completedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Arama + Filtreler (CARD DIŞINDA) */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("finance.project.projectName")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("finance.project.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("finance.project.filter.status.all")}</SelectItem>
            <SelectItem value="AKTIF">{t("finance.project.statusLabels.AKTIF")}</SelectItem>
            <SelectItem value="BEKLEMEDE">{t("finance.project.statusLabels.BEKLEMEDE")}</SelectItem>
            <SelectItem value="TAMAMLANDI">{t("finance.project.statusLabels.TAMAMLANDI")}</SelectItem>
            <SelectItem value="IPTAL">{t("finance.project.statusLabels.IPTAL")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. Tablo (CARD içinde) */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.id} className={cn("text-[11px] font-medium uppercase tracking-wide", col.className)}>
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={columns.length} className="py-2">
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : fetchError ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-40 text-center text-destructive">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 opacity-60" />
                        <p className="text-sm">{fetchError}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : projects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-40 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Briefcase className="h-8 w-8 opacity-20" />
                        <p className="text-sm">{t("finance.project.noProjects")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  projects.map((p) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      onRefresh={handleRefresh}
                      showToast={showToast}
                      t={t}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Pagination (CARD DIŞINDA) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("finance.project.pagination.perPage")}</span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>{page} / {pageCount}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <NewProjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onSuccess={() => {
          handleRefresh();
          showToast(t("finance.project.createSuccess"), true);
        }}
        t={t}
      />

    </div>
  );
}

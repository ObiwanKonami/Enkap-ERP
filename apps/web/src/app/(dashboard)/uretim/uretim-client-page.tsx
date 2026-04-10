"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Factory,
  Plus,
  Search,
  RefreshCw,
  Check,
  X,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { manufacturingApi, type WorkOrder, type WorkOrderStatus } from "@/services/manufacturing";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { UretimWoRow, type UretimRow, normalizeWorkOrder } from "./uretim-table";

const LIMIT = 20;

function CompleteModal({
  wo,
  open,
  onClose,
  onSuccess,
  t,
}: {
  wo: UretimRow;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string) => string;
}) {
  const [qty, setQty] = useState(Number(wo.targetQuantity));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQty(Number(wo.targetQuantity));
      setError(null);
    }
  }, [open, wo.targetQuantity]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await manufacturingApi.workOrder.complete(wo.id, qty);
      onSuccess();
      onClose();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check size={16} className="text-primary" />
            {t("manufacturing.completeWorkOrder")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-muted/30 px-3 py-2 flex flex-col gap-0.5">
            <p className="text-xs text-muted-foreground">
              {t("manufacturing.workOrder")}:{" "}
              <span className="text-primary font-semibold">{wo.woNumber}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("manufacturing.product")}: {wo.productName}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              {t("manufacturing.actualProducedQty")} *
            </Label>
            <Input
              type="number" min={0} max={Number(wo.targetQuantity)}
              className="h-9 tabular-nums"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              {t("manufacturing.target")}: {Number(wo.targetQuantity)} {t("manufacturing.units")}
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle size={13} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting && <RefreshCw size={13} className="animate-spin" />}
            {t("manufacturing.complete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UretimClientPage() {
  const { t } = useI18n();

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [data, setData] = useState<UretimRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [completeModalWo, setCompleteModalWo] = useState<UretimRow | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [kpiTotal, setKpiTotal] = useState(0);
  const [kpiActive, setKpiActive] = useState(0);
  const [kpiProgress, setKpiProgress] = useState(0);
  const [kpiDone, setKpiDone] = useState(0);

  const showToast = useCallback((msg: string, type: "success" | "error") => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleRefresh = useCallback(() => {
    setPage(1);
  }, []);

  const handleConfirm = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      await manufacturingApi.workOrder.confirm(id);
      showToast(t("manufacturing.workOrderConfirmed"), "success");
      handleRefresh();
    } catch (e) {
      showToast(String((e as Error).message), "error");
    } finally {
      setActionLoading(null);
    }
  }, [showToast, t, handleRefresh]);

  const handleStart = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      await manufacturingApi.workOrder.start(id);
      showToast(t("manufacturing.workOrderStarted"), "success");
      handleRefresh();
    } catch (e) {
      showToast(String((e as Error).message), "error");
    } finally {
      setActionLoading(null);
    }
  }, [showToast, t, handleRefresh]);

  const handleCancel = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      await manufacturingApi.workOrder.cancel(id);
      showToast(t("manufacturing.workOrderCancelled"), "success");
      handleRefresh();
    } catch (e) {
      showToast(String((e as Error).message), "error");
    } finally {
      setActionLoading(null);
    }
  }, [showToast, t, handleRefresh]);

  const handleCompleteSuccess = useCallback(() => {
    showToast(t("manufacturing.workOrderCompleted"), "success");
    handleRefresh();
  }, [showToast, t, handleRefresh]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const STATUSES: WorkOrderStatus[] = ["TASLAK", "PLANLI", "URETIMDE", "TAMAMLANDI", "IPTAL"];

  useEffect(() => {
    manufacturingApi.workOrder.list({ limit: 500 })
      .then((res) => {
        const resData = res as unknown as { data: WorkOrder[] };
        const items = resData.data ?? [];
        const normalized = items.map(normalizeWorkOrder);
        setKpiTotal(normalized.length);
        setKpiActive(normalized.filter((o) => ["PLANLI", "URETIMDE"].includes(o.status)).length);
        setKpiProgress(normalized.filter((o) => o.status === "URETIMDE").length);
        setKpiDone(normalized.filter((o) => o.status === "TAMAMLANDI").length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await manufacturingApi.workOrder.list({
          // @ts-expect-error backend desteklemiyor henüz - sonra kaldırılacak
          search: search || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        const resData = res as unknown as { data: WorkOrder[]; total: number };
        setData((resData.data ?? []).map(normalizeWorkOrder));
        setTotal(resData.total ?? 0);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter, page, limit]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Factory className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("manufacturing.workOrders")}</h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="h-9 gap-2">
            <Link href="/uretim/receteler"><ClipboardList size={14} /> {t("manufacturing.recipes")}</Link>
          </Button>
          <Button asChild className="h-9 gap-2 shadow-sm">
            <Link href="/uretim/yeni"><Plus size={14} /> {t("manufacturing.newWorkOrder")}</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("manufacturing.totalWorkOrders")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("manufacturing.active")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiActive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("manufacturing.inProduction")}
            </div>
            <p className="text-3xl font-bold text-amber-500">{kpiProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("manufacturing.completed")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiDone}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("manufacturing.searchByWoOrProduct")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("manufacturing.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("manufacturing.allStatuses")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{t(`manufacturing.status.${s}` as never) as string}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-9 w-9 ml-auto" title={t("common.refresh")} onClick={handleRefresh}>
          <RefreshCw size={13} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && data.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <RefreshCw size={20} className="animate-spin" />
              {t("common.loading")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-8" />
                    {[
                      t("manufacturing.woNo"),
                      t("manufacturing.product"),
                      t("common.status"),
                      t("manufacturing.targetQty"),
                      t("manufacturing.progress"),
                      t("manufacturing.plannedStart"),
                      t("common.actions"),
                    ].map((h) => (
                      <TableHead key={h} className="font-semibold text-xs uppercase tracking-wider">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((wo) => (
                    <UretimWoRow
                      key={wo.id}
                      wo={wo}
                      onRefresh={handleRefresh}
                      onToast={showToast}
                      onConfirm={handleConfirm}
                      onStart={handleStart}
                      onCancel={handleCancel}
                      onShowComplete={setCompleteModalWo}
                      t={t}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("manufacturing.pagination.perPage")}</span>
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
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(1)} disabled={page === 1}>
              <span className="sr-only">First</span>
              <span>«</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <span className="sr-only">Previous</span>
              <span>‹</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              <span className="sr-only">Next</span>
              <span>›</span>
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
              <span className="sr-only">Last</span>
              <span>»</span>
            </Button>
          </div>
        </div>
      </div>

      {completeModalWo && (
        <CompleteModal
          wo={completeModalWo}
          open={!!completeModalWo}
          onClose={() => setCompleteModalWo(null)}
          onSuccess={handleCompleteSuccess}
          t={t}
        />
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-lg",
          toast.type === "success"
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {toast.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={13} /></button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingCart,
  Plus,
  Search,
  Check,
  X,
  AlertCircle,
  Send,
  Ban,
  Truck,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { formatCurrency, kurusToTl, formatDate, fmtQty } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { purchaseApi, type PurchaseOrder, type PurchaseOrderStatus } from "@/services/purchase";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LIMIT = 20;

function normalizeOrder(p: PurchaseOrder): import("./satin-alma-table").PurchaseOrderRow {
  return {
    id: p.id,
    poNumber: p.poNumber,
    vendorName: p.vendorName,
    orderDate: p.orderDate,
    totalKurus: String(Number(p.totalKurus ?? 0)),
    status: p.status,
    approvedBy: p.approvedBy ?? null,
    lines: p.lines.map(l => ({
      id: l.id,
      productName: l.productName,
      quantity: String(l.quantity),
      receivedQuantity: String(l.receivedQuantity),
      unitCode: l.unitCode ?? null,
      unitPriceKurus: String(l.unitPriceKurus),
      kdvRate: l.kdvRate,
      lineTotalKurus: String(l.lineTotalKurus),
    })),
    notes: p.notes ?? null,
    subtotalKurus: String(Number(p.totalKurus ?? 0) - Number(p.kdvKurus ?? 0)),
    kdvKurus: String(Number(p.kdvKurus ?? 0)),
  };
}

function getStatusBadgeProps(status: PurchaseOrderStatus): {
  variant: "outline" | "secondary" | "default" | "destructive";
  className?: string;
} {
  const map: Record<PurchaseOrderStatus, { variant: "outline" | "secondary" | "default" | "destructive"; className?: string }> = {
    draft:     { variant: "outline" },
    sent:      { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
    partial:   { variant: "secondary" },
    received:  { variant: "default" },
    cancelled: { variant: "destructive" },
  };
  return map[status] ?? { variant: "outline" };
}

export default function SatinAlmaClientPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [data, setData] = useState<import("./satin-alma-table").PurchaseOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [mutating, setMutating] = useState(false);

  const [kpiPending, setKpiPending] = useState(0);
  const [kpiValue, setKpiValue] = useState(0);
  const [kpiCompleted, setKpiCompleted] = useState(0);

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleAdvance = useCallback(async (id: string, action: "submit" | "approve" | "cancel") => {
    setMutating(true);
    try {
      if (action === "submit") await purchaseApi.submit(id);
      else if (action === "approve") await purchaseApi.approve(id);
      else await purchaseApi.cancel(id);
      
      const msgs: Record<string, string> = {
        submit: t("purchase.orderSubmitted"),
        approve: t("purchase.orderApproved"),
        cancel: t("purchase.orderCancelled"),
      };
      showToast(msgs[action], true);
      setData(prev => prev.filter(o => o.id !== id));
    } catch {
      showToast(t("purchase.operationFailed"), false);
    } finally {
      setMutating(false);
    }
  }, [t, showToast]);

  const handleMalKabul = useCallback((id: string) => {
    router.push(`/satin-alma/${id}/mal-kabul`);
  }, [router]);

  const columns = useMemo(() => {
    const { buildSatinAlmaColumns } = require("./satin-alma-table");
    return buildSatinAlmaColumns(t, expanded, setExpanded, handleAdvance, handleMalKabul);
  }, [t, expanded, handleAdvance, handleMalKabul]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    purchaseApi.list({ limit: 500 })
      .then((res) => {
        const items = (res as unknown as { data: { data: PurchaseOrder[] } }).data?.data ?? [];
        const normalized = items.map(normalizeOrder);
        setKpiPending(normalized.filter((o) => ["sent", "partial"].includes(o.status)).length);
        setKpiValue(normalized.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.totalKurus), 0));
        setKpiCompleted(normalized.filter((o) => o.status === "received").length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await purchaseApi.list({
          // @ts-expect-error backend desteklemiyor henüz - sonra kaldırılacak
          search: search || undefined,
          status: filterStatus !== "all" ? filterStatus : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        const resData = (res as unknown as { data: { data: PurchaseOrder[]; total: number } }).data;
        setData((resData.data ?? []).map(normalizeOrder));
        setTotal(resData.total ?? 0);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, filterStatus, page, limit]);

  const STATUSES: PurchaseOrderStatus[] = [
    "draft", "sent", "partial", "received", "cancelled",
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingCart className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("purchase.title")}</h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <Button asChild>
          <Link href="/satin-alma/yeni">
            <Plus className="h-4 w-4 mr-2" />
            {t("purchase.newOrder")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("purchase.activeOrders")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("purchase.totalValue")}
            </div>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(kurusToTl(kpiValue))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("purchase.completed")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiCompleted}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("purchase.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t("common.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`purchase.status.${s}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={loading ? [] : data}
            showToolbar={false}
            showFooter={false}
            totalCount={total}
            page={page}
            serverLimit={limit}
            renderSubRow={(order) => {
              if (expanded !== order.id) return null;
              return (
                <div className="px-6 py-3 bg-muted/30">
                  {order.lines.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">{t("purchase.noLines")}</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left pb-1.5 font-medium">{t("purchase.product")}</th>
                          <th className="text-right pb-1.5 font-medium w-20">{t("purchase.quantity")}</th>
                          <th className="text-right pb-1.5 font-medium w-24">{t("purchase.receivedTotal")}</th>
                          <th className="text-left pb-1.5 font-medium w-16 pl-3">{t("purchase.unitLabel")}</th>
                          <th className="text-right pb-1.5 font-medium w-28">{t("purchase.unitPrice")}</th>
                          <th className="text-right pb-1.5 font-medium w-24">{t("purchase.kdv")}</th>
                          <th className="text-right pb-1.5 font-medium w-28">{t("purchase.lineTotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.lines.map((line) => (
                          <tr key={line.id} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 text-foreground font-medium">{line.productName}</td>
                            <td className="py-1.5 text-right tabular-nums">{fmtQty(Number(line.quantity))}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">{fmtQty(Number(line.receivedQuantity))}</td>
                            <td className="py-1.5 pl-3 text-muted-foreground">{line.unitCode ?? "ADET"}</td>
                            <td className="py-1.5 text-right tabular-nums">{formatCurrency(kurusToTl(Number(line.unitPriceKurus)))}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">%{line.kdvRate}</td>
                            <td className="py-1.5 text-right tabular-nums font-semibold">{formatCurrency(kurusToTl(Number(line.lineTotalKurus)))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border">
                          <td colSpan={6} className="pt-2 text-right text-muted-foreground">{t("purchase.subtotal")}</td>
                          <td className="pt-2 text-right tabular-nums font-semibold">{formatCurrency(kurusToTl(Number(order.subtotalKurus)))}</td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="text-right text-muted-foreground">{t("purchase.kdv")}</td>
                          <td className="text-right tabular-nums text-muted-foreground">{formatCurrency(kurusToTl(Number(order.kdvKurus)))}</td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="pb-1.5 text-right font-semibold">{t("purchase.grandTotal")}</td>
                          <td className="pb-1.5 text-right tabular-nums font-bold text-primary">{formatCurrency(kurusToTl(Number(order.totalKurus)))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                  {order.notes && (
                    <p className="mt-2 text-xs text-muted-foreground italic">{order.notes}</p>
                  )}
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("purchase.pagination.perPage")}</span>
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
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-lg",
          toast.ok ? "bg-primary/10 border-primary/20 text-primary" : "bg-destructive/10 border-destructive/20 text-destructive"
        )}>
          {toast.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

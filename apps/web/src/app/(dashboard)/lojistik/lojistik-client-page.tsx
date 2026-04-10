"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Truck,
  Plus,
  Search,
  RefreshCw,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { logisticsApi, type Shipment, type ShipmentStatus, type CarrierCode } from "@/services/logistics";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buildLojistikColumns, type LojistikRow, normalizeShipment } from "./lojistik-table";

const LIMIT = 20;

function Toast({ text, ok, onClose }: { text: string; ok: boolean; onClose: () => void }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm",
      ok
        ? "bg-primary/10 border-primary/30 text-primary"
        : "bg-destructive/10 border-destructive/30 text-destructive"
    )}>
      {ok ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{text}</span>
      <button onClick={onClose} className="ml-1 hover:opacity-70">
        <X size={13} />
      </button>
    </div>
  );
}

export default function LojistikClientPage() {
  const { t } = useI18n();

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCarrier, setFilterCarrier] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [data, setData] = useState<LojistikRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const [kpiKargoda, setKpiKargoda] = useState(0);
  const [kpiTeslim, setKpiTeslim] = useState(0);
  const [kpiBekliyor, setKpiBekliyor] = useState(0);
  const [kpiSorunlu, setKpiSorunlu] = useState(0);

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleTrack = useCallback(async (id: string) => {
    setTrackingId(id);
    try {
      await logisticsApi.track(id);
      showToast(t("logistics.statusUpdated"), true);
      setData(prev => prev.map(s => s.id === id ? { ...s } : s));
    } catch {
      showToast(t("logistics.trackError"), false);
    } finally {
      setTrackingId(null);
    }
  }, [showToast, t]);

  const columns = useMemo(() => buildLojistikColumns(t, handleTrack, !!trackingId, logisticsApi.getLabelUrl), [t, handleTrack, trackingId]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const STATUSES: ShipmentStatus[] = [
    "pending", "created", "in_transit", "out_for_delivery", "delivered", "failed", "returned"
  ];
  const CARRIERS: CarrierCode[] = ["aras", "yurtici", "ptt"];

  useEffect(() => {
    logisticsApi.list({ limit: 500 })
      .then((res) => {
        const resData = res as unknown as { data: Shipment[] };
        const items = resData.data ?? [];
        const normalized = items.map(normalizeShipment);
        setKpiKargoda(normalized.filter((s) => ["created", "in_transit", "out_for_delivery"].includes(s.status)).length);
        setKpiTeslim(normalized.filter((s) => s.status === "delivered").length);
        setKpiBekliyor(normalized.filter((s) => s.status === "pending").length);
        setKpiSorunlu(normalized.filter((s) => ["failed", "returned"].includes(s.status)).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await logisticsApi.list({
          // @ts-expect-error backend desteklemiyor henüz - sonra kaldırılacak
          search: search || undefined,
          status: filterStatus !== "all" ? filterStatus : undefined,
          carrier: filterCarrier !== "all" ? filterCarrier : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        const resData = res as unknown as { data: Shipment[]; total: number };
        setData((resData.data ?? []).map(normalizeShipment));
        setTotal(resData.total ?? 0);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, filterStatus, filterCarrier, page, limit]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Truck className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("logistics.title")}</h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <Button asChild>
          <Link href="/lojistik/yeni">
            <Plus className="h-4 w-4 mr-2" />
            {t("logistics.newShipment")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("logistics.status.in_transit")}
            </div>
            <p className="text-3xl font-bold text-amber-500">{kpiKargoda}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("logistics.status.delivered")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiTeslim}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("logistics.status.pending")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiBekliyor}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("logistics.problematic")}
            </div>
            <p className="text-3xl font-bold text-destructive">{kpiSorunlu}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("logistics.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder={t("common.all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`logistics.status.${s}` as never) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCarrier} onValueChange={(v) => { setFilterCarrier(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("logistics.allCarriers")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("logistics.allCarriers")}</SelectItem>
            {CARRIERS.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`logistics.carriers.${c.toUpperCase()}` as never) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && data.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <RefreshCw size={20} className="animate-spin" />
              {t("common.loading")}
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={data}
              showToolbar={false}
              showFooter={false}
              totalCount={total}
              page={page}
              serverLimit={limit}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("logistics.pagination.perPage")}</span>
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

      {toast && <Toast text={toast.text} ok={toast.ok} onClose={() => setToast(null)} />}
    </div>
  );
}

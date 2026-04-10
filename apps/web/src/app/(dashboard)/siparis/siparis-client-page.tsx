"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  Plus,
  Search,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  Loader2,
  Truck,
} from "lucide-react";
import { formatCurrency, kurusToTl, formatDate, fmtQty } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { orderApi, type SalesOrder, type SalesOrderStatus, type OrderChannel } from "@/services/order";
import { stockApi, type Warehouse } from "@/services/stock";
import { fleetApi, type Vehicle, type Driver } from "@/services/fleet";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { DateInput } from '@/components/ui/date-input';
import { cn } from "@/lib/utils";
import { buildSiparisColumns, type SiparisRow } from "./siparis-table";

const LIMIT = 20;
const ALL_SENTINEL = "__ALL__";

function normalizeOrder(p: SalesOrder): SiparisRow {
  return {
    id: p.id,
    soNumber: p.soNumber,
    channel: p.channel,
    customerName: p.customerName,
    customerEmail: p.customerEmail ?? null,
    status: p.status,
    totalKurus: String(p.totalKurus),
    kdvKurus: String(p.kdvKurus),
    orderDate: p.orderDate,
    invoiceId: p.invoiceId ?? null,
    lines: p.lines.map(l => ({
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      sku: l.sku ?? null,
      quantity: String(l.quantity),
      shippedQuantity: String(l.shippedQuantity),
      unitCode: l.unitCode ?? null,
      unitPriceKurus: String(l.unitPriceKurus),
      kdvKurus: String(l.kdvKurus),
      lineTotalKurus: String(l.lineTotalKurus),
    })),
    deliveryAddress: p.deliveryAddress ? { city: p.deliveryAddress.city, district: p.deliveryAddress.district ?? null } : null,
  };
}

function DeliveryModal({
  order,
  open,
  onClose,
  onSuccess,
  t,
}: {
  order: SiparisRow;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string) => string;
}) {
  const [mode, setMode] = useState<"kargo" | "filo">("kargo");
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouse] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [vehicleId, setVehicle] = useState(ALL_SENTINEL);
  const [driverId, setDriver] = useState(ALL_SENTINEL);
  const [destination, setDest] = useState(order.deliveryAddress?.city ?? order.customerName ?? "");
  const [qtys, setQtys] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.lines.map((l) => [l.id, Math.max(0, Number(l.quantity) - Number(l.shippedQuantity))]))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const W_NONE = "__W_NONE__";

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    if (!open) return;
    stockApi.warehouses.list()
      .then((r) => setWarehouses((r.data ?? []) as Warehouse[]))
      .catch(() => setWarehouses([]));
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "filo") return;
    Promise.all([
      fleetApi.vehicles.list({ status: "AKTIF", limit: 100 }),
      fleetApi.drivers.list({ status: "AKTIF", limit: 100 }),
    ])
      .then(([vRes, dRes]) => {
        const vData = vRes as unknown as { data: Vehicle[] };
        const dData = dRes as unknown as { data: Driver[] };
        setVehicles(vData.data ?? []);
        setDrivers(dData.data ?? []);
      })
      .catch(() => {
        setVehicles([]);
        setDrivers([]);
      });
  }, [open, mode]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await orderApi.createDelivery(order.id, {
        items: order.lines
          .filter((l) => (qtys[l.id] ?? 0) > 0)
          .map((l) => ({ productId: l.productId, productName: l.productName, warehouseId, quantity: qtys[l.id] ?? 0 })),
        shipDate,
        ...(mode === "kargo"
          ? { carrier: carrier || undefined, tracking: tracking || undefined }
          : {
              vehicleId: vehicleId === ALL_SENTINEL ? "" : vehicleId,
              driverId: driverId === ALL_SENTINEL ? "" : driverId,
              destination: destination || undefined,
            }),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setSubmitting(false);
    }
  };

  const vehicleIdReal = vehicleId === ALL_SENTINEL ? "" : vehicleId;
  const driverIdReal = driverId === ALL_SENTINEL ? "" : driverId;
  const filoValid = mode === "filo" ? vehicleIdReal !== "" && driverIdReal !== "" : true;
  const hasItems = Object.values(qtys).some((q) => q > 0);
  const canSubmit = hasItems && filoValid && warehouseId !== "" && warehouseId !== W_NONE;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck size={16} className="text-muted-foreground" />
            {t("order.shipmentTitle")} {order.soNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="flex rounded-lg border border-border overflow-hidden">
          {(["kargo", "filo"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 py-2 text-xs font-semibold transition-colors",
                mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              {m === "kargo" ? t("order.cargoMode") : t("order.fleetMode")}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("order.shipDate")} *</Label>
            <DateInput className="h-9 bg-muted/40" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("order.shipWarehouse")} *</Label>
            <Select value={warehouseId || W_NONE} onValueChange={(v) => setWarehouse(v === W_NONE ? "" : v)}>
              <SelectTrigger className="h-9 bg-muted/40"><SelectValue placeholder={t("order.selectWarehouse")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={W_NONE}>{t("order.selectWarehouse")}</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {mode === "kargo" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("order.shippingCarrier")}</Label>
              <Input className="h-9 bg-muted/40" placeholder={t("order.carrierPlaceholder")} value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("order.trackingNumber")}</Label>
              <Input className="h-9 bg-muted/40" placeholder={t("order.trackingPlaceholder")} value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </div>
          </div>
        )}

        {mode === "filo" && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("order.vehicle")} *</Label>
                <Select value={vehicleId} onValueChange={setVehicle}>
                  <SelectTrigger className="h-9 bg-muted/40"><SelectValue placeholder={t("order.selectVehicle")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SENTINEL}>{t("order.selectVehicle")}</SelectItem>
                    {vehicles.map((v) => <SelectItem key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("order.driver")} *</Label>
                <Select value={driverId} onValueChange={setDriver}>
                  <SelectTrigger className="h-9 bg-muted/40"><SelectValue placeholder={t("order.selectDriver")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_SENTINEL}>{t("order.selectDriver")}</SelectItem>
                    {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("order.destination")}</Label>
              <Input className="h-9 bg-muted/40" placeholder={t("order.variantNote")} value={destination} onChange={(e) => setDest(e.target.value)} />
            </div>
            {vehicles.length === 0 && (
              <Alert>
                <AlertCircle size={13} />
                <AlertDescription className="text-xs">{t("order.noActiveVehicle")}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t("order.shipmentQty")}</p>
          {order.lines.map((line) => {
            const remaining = Number(line.quantity) - Number(line.shippedQuantity);
            return (
              <div key={line.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{line.productName}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {t("order.orderAmt")} {Number(line.quantity)} | {t("order.shippedAmt")} {Number(line.shippedQuantity)} | {t("order.remainingAmt")} {remaining}
                  </p>
                </div>
                <Input
                  type="number" min={0} max={remaining}
                  className="w-20 h-8 text-right text-sm tabular-nums bg-background"
                  value={qtys[line.id] ?? 0}
                  onChange={(e) => setQtys((prev) => ({ ...prev, [line.id]: Math.min(remaining, Math.max(0, Number(e.target.value))) }))}
                />
              </div>
            );
          })}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle size={13} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="gap-2">
            {submitting && <Loader2 size={13} className="animate-spin" />}
            <Truck size={13} />
            {t("order.createShipmentBtn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SiparisClientPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LIMIT);
  const [data, setData] = useState<SiparisRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [mutating, setMutating] = useState(false);
  const [deliveryModalOrder, setDeliveryModalOrder] = useState<SiparisRow | null>(null);

  const [kpiTotal, setKpiTotal] = useState(0);
  const [kpiActive, setKpiActive] = useState(0);
  const [kpiCompleted, setKpiCompleted] = useState(0);
  const [kpiRevenue, setKpiRevenue] = useState(0);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleAction = useCallback(async (order: SiparisRow, action: "confirm" | "pick" | "invoice" | "cancel") => {
    setMutating(true);
    try {
      if (action === "confirm") await orderApi.confirm(order.id);
      else if (action === "pick") await orderApi.startPicking(order.id);
      else if (action === "invoice") await orderApi.createInvoice(order.id);
      else await orderApi.cancel(order.id);

      const msgs: Record<string, string> = {
        confirm: t("order.approved"),
        pick: t("order.pickingStarted"),
        invoice: t("order.invoiceCreated"),
        cancel: t("order.cancelled"),
      };
      showToast(msgs[action], "success");
      setData(prev => prev.filter(o => o.id !== order.id));
    } catch (e) {
      showToast(String((e as Error).message), "error");
    } finally {
      setMutating(false);
    }
  }, [t, showToast]);

  const handleDeliverySuccess = useCallback(() => {
    showToast(t("order.shipmentCreated"), "success");
    setData(prev => prev.map(o => o.id === deliveryModalOrder?.id ? { ...o, lines: o.lines } : o));
  }, [t, showToast, deliveryModalOrder]);

  const columns = useMemo(() => buildSiparisColumns(t, expanded, setExpanded, handleAction, setDeliveryModalOrder), [t, expanded, handleAction]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const STATUSES: SalesOrderStatus[] = [
    "TASLAK", "ONAYLANDI", "HAZIRLANIYOR", "KISMEN_SEVK",
    "SEVK_EDILDI", "TESLIM_EDILDI", "FATURALANMIS", "KAPALI", "IPTAL"
  ];
  const CHANNELS: OrderChannel[] = ["DIREKT", "TRENDYOL", "HEPSIBURADA", "WEB", "TELEFON"];

  useEffect(() => {
    orderApi.list({ limit: 500 })
      .then((res) => {
        const resData = res as unknown as { data: SalesOrder[] };
        const items = resData.data ?? [];
        const normalized = items.map(normalizeOrder);
        setKpiTotal(normalized.length);
        setKpiActive(normalized.filter((o) => ["TASLAK", "ONAYLANDI", "HAZIRLANIYOR", "KISMEN_SEVK"].includes(o.status)).length);
        setKpiCompleted(normalized.filter((o) => ["SEVK_EDILDI", "TESLIM_EDILDI", "FATURALANMIS", "KAPALI"].includes(o.status)).length);
        setKpiRevenue(normalized.filter((o) => o.status !== "IPTAL").reduce((s, o) => s + Number(o.totalKurus), 0));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await orderApi.list({
          // @ts-expect-error backend desteklemiyor henüz - sonra kaldırılacak
          search: search || undefined,
          status: statusFilter !== "all" ? statusFilter as SalesOrderStatus : undefined,
          channel: channelFilter !== "all" ? channelFilter as OrderChannel : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        const resData = res as unknown as { data: SalesOrder[]; total: number };
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
  }, [search, statusFilter, channelFilter, page, limit]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("order.title")}</h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <Button asChild>
          <Link href="/siparis/yeni">
            <Plus className="h-4 w-4 mr-2" />
            {t("order.newOrder")}
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("order.totalOrders")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiTotal}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("order.activeOrders")}
            </div>
            <p className="text-3xl font-bold text-foreground">{kpiActive}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("order.completedOrders")}
            </div>
            <p className="text-3xl font-bold text-primary">{kpiCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("order.totalRevenue")}
            </div>
            <p className="text-3xl font-bold text-primary">{formatCurrency(kurusToTl(kpiRevenue))}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("order.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("order.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("order.allStatuses")}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`order.status.${s}` as never) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("order.allChannels")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("order.allChannels")}</SelectItem>
            {CHANNELS.map((c) => (
              <SelectItem key={c} value={c}>
                {c === "DIREKT" ? "Direkt" : c === "TRENDYOL" ? "Trendyol" : c === "HEPSIBURADA" ? "Hepsiburada" : c === "WEB" ? "Web" : "Telefon"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && data.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
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
            <span>{t("order.pagination.perPage")}</span>
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

      {deliveryModalOrder && (
        <DeliveryModal
          order={deliveryModalOrder}
          open={!!deliveryModalOrder}
          onClose={() => setDeliveryModalOrder(null)}
          onSuccess={handleDeliverySuccess}
          t={t}
        />
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl border text-sm shadow-lg",
          toast.type === "success"
            ? "bg-primary/10 border-primary/20 text-primary"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        )}>
          {toast.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{toast.message}</span>
          <Button variant="ghost" size="icon" className="ml-2 size-5 opacity-70 hover:opacity-100" onClick={() => setToast(null)}>
            <X size={13} />
          </Button>
        </div>
      )}
    </div>
  );
}

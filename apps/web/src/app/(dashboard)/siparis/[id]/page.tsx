"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShoppingBag,
  Truck,
  FileText,
  Check,
  AlertCircle,
  X,
  Package,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import {
  orderApi,
  STATUS_LABELS,
  CHANNEL_LABELS,
  type SalesOrder,
  type SalesOrderStatus,
  type DeliveryItem,
} from "@/services/order";
import { formatCurrency, kurusToTl, formatDate, fmtQty } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatusBadge({ status }: { status: SalesOrderStatus }) {
  const cfgMap: Record<SalesOrderStatus, { variant: "outline" | "secondary" | "default" | "destructive"; className?: string }> = {
    TASLAK:        { variant: "outline" },
    ONAYLANDI:     { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
    HAZIRLANIYOR:  { variant: "secondary" },
    KISMEN_SEVK:   { variant: "secondary" },
    SEVK_EDILDI:   { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
    TESLIM_EDILDI: { variant: "default" },
    KAPALI:        { variant: "default" },
    IPTAL:         { variant: "destructive" },
  };
  const cfg = cfgMap[status] ?? { variant: "outline" as const };
  return (
    <Badge variant={cfg.variant} className={cfg.className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  return (
    <div className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm max-w-[380px] shadow-lg ${
      type === "success"
        ? "bg-primary/10 border-primary/20 text-primary"
        : "bg-destructive/10 border-destructive/20 text-destructive"
    }`}>
      {type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{message}</span>
      <Button variant="ghost" size="icon" className="ml-2 h-5 w-5 shrink-0" onClick={onClose}>
        <X size={13} />
      </Button>
    </div>
  );
}

interface DeliveryLineState {
  productId: string;
  productName: string;
  warehouseId: string;
  maxQty: number;
  quantity: number;
  enabled: boolean;
}

function CreateDeliveryModal({
  order,
  onClose,
  onSuccess,
  t,
}: {
  order: SalesOrder;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string) => string;
}) {
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10));
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [lines, setLines] = useState<DeliveryLineState[]>(
    order.lines
      .filter((l) => l.quantity - l.shippedQuantity > 0)
      .map((l) => ({
        productId: l.productId,
        productName: l.productName,
        warehouseId: l.warehouseId ?? "",
        maxQty: l.quantity - l.shippedQuantity,
        quantity: l.quantity - l.shippedQuantity,
        enabled: true,
      })),
  );

  const mutation = useMutation({
    mutationFn: () => {
      const items: DeliveryItem[] = lines
        .filter((l) => l.enabled && l.quantity > 0)
        .map((l) => ({
          productId: l.productId,
          productName: l.productName,
          warehouseId: l.warehouseId,
          quantity: l.quantity,
        }));
      return orderApi.createDelivery(order.id, {
        items,
        shipDate,
        carrier: carrier || undefined,
        tracking: tracking || undefined,
      });
    },
    onSuccess,
  });

  const updateLine = (idx: number, patch: Partial<DeliveryLineState>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const hasItems = lines.some((l) => l.enabled && l.quantity > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <Truck size={18} className="text-muted-foreground" />
            {t("order.createShipment")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("order.shipDate")} *</Label>
            <DateInput value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("order.shippingCarrier")}</Label>
            <Input placeholder="Aras, Yurtiçi..." value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">{t("order.trackingNumber")}</Label>
            <Input placeholder="Kargo takip kodu" value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
            {t("order.shipmentItems")}
          </div>
          {lines.length === 0 && (
            <p className="text-sm text-muted-foreground py-3">{t("order.allItemsShipped")}</p>
          )}
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="grid grid-cols-[auto_1fr_160px_120px] gap-2.5 items-center py-2 border-b border-border"
            >
              <input
                type="checkbox"
                checked={line.enabled}
                onChange={(e) => updateLine(idx, { enabled: e.target.checked })}
                className="w-4 h-4 cursor-pointer accent-primary"
              />
              <div>
                <div className={`text-sm ${line.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                  {line.productName}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("order.remainingUnit").replace("{qty}", String(line.maxQty))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">{t("order.warehouse")}</Label>
                <Input
                  placeholder="Depo ID"
                  value={line.warehouseId}
                  disabled={!line.enabled}
                  onChange={(e) => updateLine(idx, { warehouseId: e.target.value })}
                  className="text-xs h-8"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px] text-muted-foreground">{t("order.quantity")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={line.maxQty}
                  value={line.quantity}
                  disabled={!line.enabled}
                  onChange={(e) =>
                    updateLine(idx, { quantity: Math.min(line.maxQty, Math.max(1, Number(e.target.value))) })
                  }
                  className="text-xs h-8 tabular-nums"
                />
              </div>
            </div>
          ))}
        </div>

        {mutation.isError && (
          <Alert variant="destructive">
            <AlertCircle size={14} />
            <AlertDescription>{t("order.deliveryFailed")}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            disabled={!hasItems || !shipDate}
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("order.createDeliveryBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusActions({
  order,
  onAction,
  t,
}: {
  order: SalesOrder;
  onAction: (action: string) => void;
  t: (key: string) => string;
}) {
  const qc = useQueryClient();
  const orderId = order.id;

  const mutOpts = (action: string) => ({
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      onAction(action);
    },
  });

  const confirmMut = useMutation({ mutationFn: () => orderApi.confirm(orderId),       ...mutOpts(t("order.orderConfirmed"))    });
  const pickMut    = useMutation({ mutationFn: () => orderApi.startPicking(orderId),  ...mutOpts(t("order.preparationStarted")) });
  const invoiceMut = useMutation({ mutationFn: () => orderApi.createInvoice(orderId), ...mutOpts(t("order.invoiceCreated"))    });
  const cancelMut  = useMutation({ mutationFn: () => orderApi.cancel(orderId),        ...mutOpts(t("order.orderCancelled"))    });

  const { status } = order;
  const busy = confirmMut.isPending || pickMut.isPending || invoiceMut.isPending || cancelMut.isPending;

  return (
    <div className="flex gap-2 flex-wrap">
      {status === "TASLAK" && (
        <Button disabled={busy} isLoading={confirmMut.isPending} onClick={() => confirmMut.mutate()} className="gap-1.5">
          <Check size={14} /> {t("order.status.TASLAK")}
        </Button>
      )}
      {status === "ONAYLANDI" && (
        <Button disabled={busy} isLoading={pickMut.isPending} onClick={() => pickMut.mutate()} className="gap-1.5">
          <Package size={14} /> {t("order.prepare")}
        </Button>
      )}
      {(status === "HAZIRLANIYOR" || status === "KISMEN_SEVK") && (
        <Button disabled={busy} onClick={() => onAction("open-delivery")} className="gap-1.5">
          <Truck size={14} /> {t("order.createShipment")}
        </Button>
      )}
      {(status === "SEVK_EDILDI" || status === "KISMEN_SEVK") && !order.invoiceId && (
        <Button disabled={busy} isLoading={invoiceMut.isPending} onClick={() => invoiceMut.mutate()} className="gap-1.5">
          <FileText size={14} /> {t("order.createInvoice")}
        </Button>
      )}
      {order.invoiceId && (
        <Button variant="outline" asChild className="gap-1.5">
          <Link href={`/faturalar/${order.invoiceId}`}>
            <ExternalLink size={13} /> {t("order.viewInvoice")}
          </Link>
        </Button>
      )}
      {(status === "TASLAK" || status === "ONAYLANDI" || status === "HAZIRLANIYOR") && (
        <Button
          variant="destructive"
          disabled={busy}
          isLoading={cancelMut.isPending}
          onClick={() => { if (confirm(t("order.cancelConfirm"))) cancelMut.mutate(); }}
          className="gap-1.5"
        >
          <X size={13} /> {t("order.cancelBtn")}
        </Button>
      )}
    </div>
  );
}

function DeliveriesSection({ orderId, t }: { orderId: string; t: (key: string) => string }) {
  const [open, setOpen] = useState(true);
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["order-deliveries", orderId],
    queryFn: () => orderApi.getDeliveries(orderId).then((r) => r.data),
  });

  return (
    <Card className="shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors ${open ? "border-b border-border" : ""}`}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Truck size={15} className="text-muted-foreground" />
          {t("order.deliveries")}
          <Badge variant="secondary" className="rounded-full px-2">{deliveries.length}</Badge>
        </div>
        {open
          ? <ChevronUp size={15} className="text-muted-foreground" />
          : <ChevronDown size={15} className="text-muted-foreground" />}
      </button>

      {open && (
        <div>
          {isLoading && (
            <p className="px-5 py-3.5 text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          {!isLoading && deliveries.length === 0 && (
            <p className="px-5 py-3.5 text-sm text-muted-foreground">{t("order.noShipments")}</p>
          )}
          {deliveries.map((d) => (
            <div key={d.id} className="px-5 py-3.5 border-b border-border flex flex-col gap-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold text-primary tabular-nums">{d.deliveryNumber}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(d.shipDate)}</span>
                  {d.carrier && <span className="text-xs text-foreground">{d.carrier}</span>}
                  {d.trackingNumber && (
                    <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded tabular-nums">
                      {d.trackingNumber}
                    </span>
                  )}
                </div>
                <Badge
                  variant={d.stockSynced ? "secondary" : "outline"}
                  className={d.stockSynced ? "bg-primary/10 text-primary border-transparent" : "text-muted-foreground"}
                >
                  {d.stockSynced ? t("order.stockSynced") : t("order.stockSyncing")}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {d.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-md text-xs text-foreground">
                    <Package size={11} />
                    <span>{item.productName}</span>
                    <span className="font-semibold tabular-nums">×{fmtQty(item.quantity)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function SiparisDetayPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderApi.get(id).then((r) => r.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center py-8 gap-3">
          <AlertCircle size={32} className="text-destructive" />
          <p className="text-sm text-foreground">{t("order.orderNotFound")}</p>
          <Button variant="outline" onClick={() => router.push("/siparis")}>
            {t("order.goBack")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalOrdered = order.lines.reduce((s, l) => s + Number(l.quantity), 0);
  const totalShipped = order.lines.reduce((s, l) => s + Number(l.shippedQuantity), 0);
  const shipPct = totalOrdered > 0 ? Math.round((totalShipped / totalOrdered) * 100) : 0;

  const handleAction = (msg: string) => {
    if (msg === "open-delivery") {
      setShowDeliveryModal(true);
    } else {
      showToast(msg, "success");
      qc.invalidateQueries({ queryKey: ["order", id] });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Başlık */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
            <ArrowLeft size={13} /> {t("common.back")}
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <ShoppingBag size={20} className="text-muted-foreground" />
                <span className="tabular-nums">{order.soNumber}</span>
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <div className="text-sm text-muted-foreground mt-1 ml-7">
              {order.customerName}
              {order.channel && (
                <span className="ml-2 text-primary text-xs">· {CHANNEL_LABELS[order.channel]}</span>
              )}
              {order.marketplaceOrderRef && (
                <span className="ml-2 text-[11px] text-muted-foreground tabular-nums">#{order.marketplaceOrderRef}</span>
              )}
            </div>
          </div>
        </div>
        <StatusActions order={order} onAction={handleAction} t={t} />
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("order.orderDate")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-lg font-bold tracking-tight text-foreground tabular-nums">
              {formatDate(order.orderDate)}
            </div>
          </CardContent>
        </Card>

        {order.promisedDeliveryDate && (
          <Card className="shadow-sm">
            <CardHeader className="pb-1 pt-4 px-5">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("order.promisedDate")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className={`text-lg font-bold tracking-tight tabular-nums ${
                new Date(order.promisedDeliveryDate) < new Date() &&
                order.status !== "TESLIM_EDILDI" &&
                order.status !== "KAPALI"
                  ? "text-destructive"
                  : "text-foreground"
              }`}>
                {formatDate(order.promisedDeliveryDate)}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("order.totalAmount")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-lg font-bold tracking-tight text-primary tabular-nums">
              {formatCurrency(kurusToTl(order.totalKurus))}
            </div>
            <div className="text-[11px] text-muted-foreground">{t("order.kdvDahil")}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("order.shipmentProgress")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="text-lg font-bold tracking-tight text-foreground tabular-nums">{shipPct}%</div>
            <div className="text-[11px] text-muted-foreground">
              {totalShipped} / {totalOrdered} {t("order.quantity")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sevkiyat İlerleme Çubuğu */}
      {totalOrdered > 0 && (
        <Card className="shadow-sm">
          <CardContent className="px-5 py-3.5">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">{t("order.shipmentProgress")}</span>
              <span className="text-xs text-foreground tabular-nums">
                {totalShipped} / {totalOrdered} {t("order.quantity")} ({shipPct}%)
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-300"
                style={{ width: `${shipPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sipariş Kalemleri */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="px-5 py-3.5 border-b border-border flex flex-row items-center gap-2">
          <Package size={15} className="text-muted-foreground" />
          <CardTitle className="text-sm font-semibold text-foreground">{t("order.orderLines")}</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                {[
                  t("order.product"),
                  t("order.sku"),
                  t("order.quantity"),
                  t("order.shipped"),
                  t("order.remainingQty"),
                  t("order.unit"),
                  t("order.unitPrice"),
                  t("order.discount"),
                  "KDV",
                  t("order.totalAmount"),
                ].map((h) => (
                  <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.lines.map((line) => {
                const remaining = Number(line.quantity) - Number(line.shippedQuantity);
                const isComplete = remaining === 0;
                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium text-foreground">{line.productName}</TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{line.sku ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{fmtQty(line.quantity)}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`tabular-nums ${Number(line.shippedQuantity) > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {fmtQty(line.shippedQuantity)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`tabular-nums font-semibold ${isComplete ? "text-primary" : "text-foreground"}`}>
                        {fmtQty(remaining)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{line.unitCode ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums">{formatCurrency(kurusToTl(line.unitPriceKurus))}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`tabular-nums ${Number(line.discountRate) > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {Number(line.discountRate) > 0 ? `%${line.discountRate}` : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">%{line.kdvRate}</span>
                    </TableCell>
                    <TableCell>
                      <span className="tabular-nums font-semibold">
                        {formatCurrency(kurusToTl(Number(line.lineTotalKurus) + Number(line.kdvKurus)))}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={9} className="text-right text-xs text-muted-foreground font-medium">
                  {t("order.subtotal")}
                </TableCell>
                <TableCell>
                  <span className="tabular-nums font-semibold">{formatCurrency(kurusToTl(order.subtotalKurus))}</span>
                </TableCell>
              </TableRow>
              {Number(order.discountKurus) > 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-right text-xs text-muted-foreground font-medium">
                    {t("order.discount")}
                  </TableCell>
                  <TableCell>
                    <span className="tabular-nums text-foreground">- {formatCurrency(kurusToTl(order.discountKurus))}</span>
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={9} className="text-right text-xs text-muted-foreground font-medium">
                  KDV
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{formatCurrency(kurusToTl(order.kdvKurus))}</span>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={9} className="text-right text-sm text-foreground font-bold">
                  {t("order.grandTotal")}
                </TableCell>
                <TableCell>
                  <span className="text-base tabular-nums font-bold text-primary">
                    {formatCurrency(kurusToTl(order.totalKurus))}
                  </span>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Card>

      {/* Teslimat Adresi / Notlar */}
      {(order.deliveryAddress || order.notes) && (
        <div className={`grid gap-4 ${order.deliveryAddress && order.notes ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          {order.deliveryAddress && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("order.deliveryAddress")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-foreground leading-relaxed">
                  <div>{order.deliveryAddress.addressLine}</div>
                  {order.deliveryAddress.district && <div>{order.deliveryAddress.district}</div>}
                  <div>
                    {order.deliveryAddress.city}
                    {order.deliveryAddress.postalCode ? ` ${order.deliveryAddress.postalCode}` : ""}
                  </div>
                  <div>{order.deliveryAddress.country}</div>
                </div>
              </CardContent>
            </Card>
          )}
          {order.notes && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("order.deliveryNotes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Sevkiyatlar */}
      <DeliveriesSection orderId={id} t={t} />

      {showDeliveryModal && (
        <CreateDeliveryModal
          order={order}
          onClose={() => setShowDeliveryModal(false)}
          onSuccess={() => {
            setShowDeliveryModal(false);
            qc.invalidateQueries({ queryKey: ["order", id] });
            qc.invalidateQueries({ queryKey: ["order-deliveries", id] });
            showToast(t("order.shipmentCreated"));
          }}
          t={t}
        />
      )}
    </div>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ShoppingCart,
  ClipboardList,
  Truck,
  AlertCircle,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  purchaseApi,
  PURCHASE_STATUS_LABELS,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from "@/services/purchase";
import { formatCurrency, kurusToTl, formatDate, fmtQty } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function getStatusBadgeProps(status: PurchaseOrderStatus): {
  variant: "outline" | "secondary" | "default" | "destructive";
  className?: string;
} {
  const map: Record<
    PurchaseOrderStatus,
    { variant: "outline" | "secondary" | "default" | "destructive"; className?: string }
  > = {
    TASLAK:        { variant: "outline" },
    ONAY_BEKLIYOR: { variant: "secondary" },
    ONAYLANDI:     { variant: "secondary", className: "bg-primary/10 text-primary border-transparent" },
    KISMEN_TESLIM: { variant: "secondary" },
    TAMAMLANDI:    { variant: "default" },
    IPTAL:         { variant: "destructive" },
  };
  return map[status] ?? { variant: "outline" };
}

function StatusActions({ order }: { order: PurchaseOrder }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useI18n();

  const submit = useMutation({
    mutationFn: () => purchaseApi.submit(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["po", order.id] }),
  });
  const approve = useMutation({
    mutationFn: () => purchaseApi.approve(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["po", order.id] }),
  });
  const cancel = useMutation({
    mutationFn: () => purchaseApi.cancel(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["po", order.id] }),
  });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {order.status === "TASLAK" && (
        <Button
          onClick={() => submit.mutate()}
          isLoading={submit.isPending}
          className="gap-2"
        >
          <Send size={13} /> {t("purchase.sendForApproval")}
        </Button>
      )}
      {order.status === "ONAY_BEKLIYOR" && (
        <Button
          onClick={() => approve.mutate()}
          isLoading={approve.isPending}
          className="gap-2"
        >
          <CheckCircle2 size={13} /> {t("purchase.approve")}
        </Button>
      )}
      {["ONAYLANDI", "KISMEN_TESLIM"].includes(order.status) && (
        <Button
          onClick={() => router.push(`/satin-alma/${order.id}/mal-kabul`)}
          className="gap-2"
        >
          <Truck size={13} />
          {order.status === "KISMEN_TESLIM"
            ? t("purchase.receiveRemaining")
            : t("purchase.receive")}
        </Button>
      )}
      {["TASLAK", "ONAY_BEKLIYOR", "ONAYLANDI"].includes(order.status) && (
        <Button
          variant="ghost"
          className="gap-2 text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (confirm(t("purchase.cancelConfirm"))) cancel.mutate();
          }}
          isLoading={cancel.isPending}
        >
          <XCircle size={13} /> {t("purchase.cancel")}
        </Button>
      )}
    </div>
  );
}

export default function PurchaseOrderDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const {
    data: order,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["po", id],
    queryFn: () => purchaseApi.get(id).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <ShoppingCart size={28} className="text-muted-foreground animate-pulse opacity-25" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertCircle size={14} />
          <AlertDescription>{t("purchase.orderNotFound")}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => router.back()} className="w-fit gap-1.5">
          <ArrowLeft size={13} /> {t("purchase.goBack")}
        </Button>
      </div>
    );
  }

  const receivedTotal = order.lines.reduce(
    (s, l) => s + Number(l.receivedQuantity),
    0,
  );
  const orderedTotal = order.lines.reduce((s, l) => s + Number(l.quantity), 0);
  const receiptPct =
    orderedTotal > 0 ? Math.round((receivedTotal / orderedTotal) * 100) : 0;

  const badgeProps = getStatusBadgeProps(order.status);

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
            <ArrowLeft size={13} /> {t("common.back")}
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <ShoppingCart size={20} className="text-muted-foreground" />
              <span className="tabular-nums">{order.poNumber}</span>
              <Badge variant={badgeProps.variant} className={badgeProps.className}>
                {PURCHASE_STATUS_LABELS[order.status]}
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">{order.vendorName}</p>
          </div>
        </div>
        <StatusActions order={order} />
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("purchase.orderDate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {formatDate(order.orderDate)}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("purchase.expectedDate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : "—"}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("purchase.totalAmount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-primary tabular-nums">
              {formatCurrency(kurusToTl(order.totalKurus ?? 0))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t("purchase.kdvDahil")}</div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("purchase.deliveryCondition")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tracking-tight tabular-nums ${receiptPct === 100 ? "text-primary" : "text-foreground"}`}>
              %{receiptPct}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {fmtQty(receivedTotal)} / {fmtQty(orderedTotal)} {t("purchase.quantity")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Teslim İlerleme */}
      {orderedTotal > 0 && (
        <Card className="shadow-sm">
          <CardContent className="pt-4">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">
                {t("purchase.deliveryCondition")}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {fmtQty(receivedTotal)} / {fmtQty(orderedTotal)} {t("purchase.quantity")} (%{receiptPct})
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${receiptPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kalemler */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3 flex flex-row items-center gap-2">
          <ClipboardList size={15} className="text-muted-foreground" />
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("purchase.items")} ({order.lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.product")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.quantity")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.receivedTotal")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.unit")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.unitPrice")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">KDV</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.lineTotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.lines.map((line, i) => {
                  const qty = Number(line.quantity);
                  const received = Number(line.receivedQuantity);
                  const remaining = qty - received;
                  return (
                    <TableRow key={line.id ?? i}>
                      <TableCell>
                        <div className="text-sm font-medium text-foreground">{line.productName}</div>
                        {line.sku && (
                          <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">{line.sku}</div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">{fmtQty(qty)}</TableCell>
                      <TableCell>
                        <span className={`tabular-nums text-sm font-medium ${remaining > 0 ? "text-muted-foreground" : "text-primary"}`}>
                          {fmtQty(received)}
                        </span>
                        {remaining > 0 && (
                          <span className="text-[11px] text-muted-foreground ml-1">
                            ({fmtQty(remaining)} {t("purchase.remainingUnit").replace("{qty}", String(remaining))})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{line.unitCode ?? "—"}</TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(kurusToTl(line.unitPriceKurus))}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">%{line.kdvRate}</TableCell>
                      <TableCell className="tabular-nums text-sm font-semibold text-foreground">
                        {formatCurrency(kurusToTl(line.lineTotalKurus))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-xs text-muted-foreground font-medium">
                    {t("purchase.subtotal")}
                  </TableCell>
                  <TableCell className="tabular-nums font-semibold">
                    {formatCurrency(kurusToTl(order.subtotalKurus ?? 0))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-xs text-muted-foreground font-medium">
                    KDV
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(kurusToTl(order.kdvKurus ?? 0))}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={6} className="text-right text-sm font-bold text-foreground">
                    {t("purchase.grandTotal")}
                  </TableCell>
                  <TableCell className="tabular-nums text-base font-bold text-primary">
                    {formatCurrency(kurusToTl(order.totalKurus ?? 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notlar */}
      {order.notes && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center gap-2">
            <FileText size={14} className="text-muted-foreground" />
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("purchase.notes")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

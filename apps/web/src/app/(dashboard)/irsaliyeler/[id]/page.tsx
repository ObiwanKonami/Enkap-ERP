"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  FileText,
  ArrowLeft,
  Send,
  XCircle,
  CheckCircle,
  AlertCircle,
  Truck,
  Package,
  Building2,
  User,
  FileCode,
  Printer,
  Loader2,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  waybillApi,
  WAYBILL_STATUS_LABELS,
  WAYBILL_STATUS_VARIANTS,
  type Waybill,
} from "@/services/waybill";
import { stockApi } from "@/services/stock";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { IrsaliyeActions } from "./irsaliye-actions";

export default function IrsaliyeDetayPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancel] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const {
    data: waybill,
    isLoading,
    isError,
  } = useQuery<Waybill>({
    queryKey: ["waybill", id],
    queryFn: async () => (await waybillApi.get(id)).data,
    enabled: !!id,
  });

  // Calculate 7-day response deadline
  const responseDeadline = useMemo(() => {
    if (!waybill?.gibSentAt) return null;
    const sentDate = new Date(waybill.gibSentAt);
    const deadline = new Date(sentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    return deadline.toISOString();
  }, [waybill?.gibSentAt]);

  const { data: warehouseList } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => stockApi.warehouses.list().then((r) => r.data),
    staleTime: 300_000,
  });

  const warehouseMap = useMemo(() => {
    const map: Record<string, string> = {};
    (Array.isArray(warehouseList) ? warehouseList : []).forEach((w: { id: string; name: string }) => {
      map[w.id] = w.name;
    });
    return map;
  }, [warehouseList]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["waybill", id] });
  };

  const { mutate: approve, isPending: approving } = useMutation({
    mutationFn: () => waybillApi.approve(id),
    onSuccess: () => {
      invalidate();
      showToast(t("waybill.waybillApproved"), true);
    },
    onError: (e: Error) => showToast(e.message, false),
  });

  const { mutate: sendGib, isPending: sending } = useMutation({
    mutationFn: () => waybillApi.sendGib(id),
    onSuccess: () => {
      invalidate();
      showToast(t("waybill.waybillQueued"), true);
    },
    onError: (e: Error) => showToast(e.message, false),
  });

  const { mutate: cancelWaybill, isPending: cancelling } = useMutation({
    mutationFn: () => waybillApi.cancel(id, cancelReason),
    onSuccess: () => {
      setShowCancel(false);
      invalidate();
      showToast(t("waybill.waybillCancelled"), true);
    },
    onError: (e: Error) => showToast(e.message, false),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft size={16} />
          </Button>
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError || !waybill) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <AlertCircle size={28} className="text-destructive" />
        <p className="text-sm text-muted-foreground">{t("waybill.waybillNotFound")}</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/irsaliyeler")}>
          {t("waybill.goBack")}
        </Button>
      </div>
    );
  }

  const canApprove = waybill.status === "TASLAK";
  const canSendGib = ["ONAYLANDI", "GIB_REDDEDILDI"].includes(waybill.status);
  const canCancel = waybill.status !== "IPTAL";
  const gibApproved = waybill.status === "GIB_ONAYLANDI";

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {waybill.waybillNumber}
              </h1>
              <Badge variant={WAYBILL_STATUS_VARIANTS[waybill.status]}>
                {WAYBILL_STATUS_LABELS[waybill.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t(`waybill.types.${waybill.type}` as never)} {"•"} {formatDate(waybill.shipDate)}
              {waybill.refNumber && <>{" • "} Ref: {waybill.refNumber}</>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => waybillApi.downloadPdf(id, waybill.waybillNumber)}>
            <Printer size={14} className="mr-1.5" />
            {t("waybill.downloadPdf")}
          </Button>
          {["ONAYLANDI", "GIB_KUYRUKTA", "GIB_GONDERILDI", "GIB_ONAYLANDI", "GIB_REDDEDILDI"].includes(waybill.status) && (
            <Button variant="outline" size="sm" onClick={() => waybillApi.downloadXml(id, waybill.waybillNumber)}>
              <FileCode size={14} className="mr-1.5" />
              {t("waybill.downloadXml")}
            </Button>
          )}
          {canApprove && (
            <Button size="sm" onClick={() => approve()} isLoading={approving}>
              <CheckCircle size={14} className="mr-1.5" />
              {t("common.approve")}
            </Button>
          )}
          {canSendGib && (
            <Button size="sm" onClick={() => sendGib()} isLoading={sending}>
              <Send size={14} className="mr-1.5" />
              {t("waybill.sendToGib")}
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setShowCancel(true)}>
              <XCircle size={14} className="mr-1.5" />
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </div>

      {/* GİB Durumu */}
      {gibApproved && waybill.gibUuid && (
        <Alert>
          <CheckCircle size={14} />
          <AlertDescription className="flex items-center gap-2">
            <span>{t("waybill.gibApproved")} &mdash; {t("waybill.gibUuid")}</span>
            <span className="text-xs tabular-nums">{waybill.gibUuid}</span>
            {waybill.gibResponseAt && (
              <span className="text-xs text-muted-foreground ml-2">
                {formatDate(waybill.gibResponseAt)}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}
      {waybill.status === "GIB_REDDEDILDI" && (
        <Alert variant="destructive">
          <AlertCircle size={14} />
          <AlertDescription>
            {t("waybill.gibRejected")} &mdash; {t("waybill.gibStatus")}
            {waybill.gibStatusCode}: {waybill.gibStatusDesc}
          </AlertDescription>
        </Alert>
      )}

      {/* Receipt Advice Response (7-day window) */}
      {["GIB_GONDERILDI", "GIB_REDDEDILDI"].includes(waybill.status) &&
        responseDeadline && (
          <IrsaliyeActions
            waybill={waybill}
            responseDeadline={responseDeadline}
            onResponseSubmitted={() => {
              // Optionally refresh or navigate
              void qc.invalidateQueries({ queryKey: ["waybill", id] });
            }}
          />
        )}

      {/* KPI Kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("waybill.shipmentDate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold tracking-tight text-foreground tabular-nums">
              {formatDate(waybill.shipDate)}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("waybill.deliveryDate")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold tracking-tight text-foreground tabular-nums">
              {waybill.deliveryDate ? formatDate(waybill.deliveryDate) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("waybill.itemCount")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold tracking-tight text-foreground tabular-nums">
              {waybill.lines?.length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("waybill.gibSent")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold tracking-tight text-foreground tabular-nums">
              {waybill.gibSentAt ? formatDate(waybill.gibSentAt) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gönderici / Alıcı */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Building2 size={14} className="text-muted-foreground" />
              {t("waybill.sender")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("waybill.companyName")}
              </p>
              <p className="text-sm text-foreground">{waybill.senderName}</p>
            </div>
            {waybill.senderVkn && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.vkn")}
                </p>
                <p className="text-sm text-foreground tabular-nums">{waybill.senderVkn}</p>
              </div>
            )}
            {waybill.senderAddress && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.address")}
                </p>
                <p className="text-sm text-foreground">{waybill.senderAddress}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <User size={14} className="text-muted-foreground" />
              {t("waybill.receiver")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("waybill.companyName")}
              </p>
              <p className="text-sm text-foreground">{waybill.receiverName}</p>
            </div>
            {waybill.receiverVknTckn && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.vknTckn")}
                </p>
                <p className="text-sm text-foreground tabular-nums">{waybill.receiverVknTckn}</p>
              </div>
            )}
            {waybill.receiverAddress && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.address")}
                </p>
                <p className="text-sm text-foreground">{waybill.receiverAddress}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Taşıma Bilgileri */}
      {(waybill.vehiclePlate || waybill.driverName || waybill.carrierName || waybill.trackingNumber) && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Truck size={14} className="text-muted-foreground" />
              {t("waybill.transportInfo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {waybill.vehiclePlate && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.vehiclePlate")}
                </p>
                <p className="text-sm text-foreground tabular-nums">{waybill.vehiclePlate}</p>
              </div>
            )}
            {waybill.driverName && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.driver")}
                </p>
                <p className="text-sm text-foreground">{waybill.driverName}</p>
              </div>
            )}
            {waybill.carrierName && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.carrier")}
                </p>
                <p className="text-sm text-foreground">{waybill.carrierName}</p>
              </div>
            )}
            {waybill.trackingNumber && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("waybill.trackingNo")}
                </p>
                <p className="text-sm text-foreground tabular-nums">{waybill.trackingNumber}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Kalemler Tablosu */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Package size={14} className="text-muted-foreground" />
            {t("waybill.items")} ({waybill.lines?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase">{t("waybill.rowNum")}</TableHead>
                <TableHead className="text-[10px] uppercase">{t("waybill.product")}</TableHead>
                <TableHead className="text-[10px] uppercase">{t("waybill.sku")}</TableHead>
                <TableHead className="text-[10px] uppercase text-right">{t("waybill.qty")}</TableHead>
                <TableHead className="text-[10px] uppercase">{t("waybill.unit")}</TableHead>
                <TableHead className="text-[10px] uppercase">{t("waybill.warehouse")}</TableHead>
                <TableHead className="text-[10px] uppercase">{t("waybill.lotSerial")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(waybill.lines ?? []).map((line, i) => (
                <TableRow key={line.id}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="text-sm font-medium">{line.productName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {line.sku ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm font-bold text-right tabular-nums">
                    {Number(line.quantity).toLocaleString("tr-TR")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{line.unitCode}</TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {line.warehouseId
                      ? (warehouseMap[line.warehouseId] ?? line.warehouseId.slice(0, 8) + "…")
                      : "—"}
                    {line.targetWarehouseId
                      ? ` → ${warehouseMap[line.targetWarehouseId] ?? line.targetWarehouseId.slice(0, 8) + "…"}`
                      : ""}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {line.lotNumber ?? line.serialNumber ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Notlar */}
      {waybill.notes && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              {t("waybill.waybillNotes")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">{waybill.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* İptal Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle size={16} className="text-destructive" />
              {t("waybill.cancelWaybill")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {waybill.status === "GIB_ONAYLANDI"
              ? t("waybill.cancelGibConfirm")
              : t("waybill.cancelConfirm")}
          </p>
          <Textarea
            placeholder={t("waybill.cancelReason")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="min-h-[80px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>
              {t("waybill.giveUp")}
            </Button>
            <Button variant="destructive" onClick={() => cancelWaybill()} isLoading={cancelling}>
              {t("waybill.cancelWaybill")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm ${
            toast.ok
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span>{toast.text}</span>
          <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => setToast(null)}>
            <X size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}
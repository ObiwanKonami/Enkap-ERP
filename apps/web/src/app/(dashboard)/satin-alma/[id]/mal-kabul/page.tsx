"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Truck, Save, AlertCircle } from "lucide-react";
import { purchaseApi } from "@/services/purchase";
import { stockApi } from "@/services/stock";
import { fmtQty, kurusToTl } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DateInput } from '@/components/ui/date-input';

interface ReceiptItem {
  productId: string;
  productName: string;
  warehouseId: string;
  quantity: number;
  maxQty: number;
  unitCostKurus: number;
}

export default function MalKabulPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [receiptDate, setReceiptDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["po", id],
    queryFn: () => purchaseApi.get(id).then((r) => r.data),
  });

  if (order && !initialized) {
    setItems(
      order.lines
        .filter((l) => Number(l.quantity) > Number(l.receivedQuantity))
        .map((l) => ({
          productId: l.productId,
          productName: l.productName,
          warehouseId: l.warehouseId ?? "",
          quantity: Number(l.quantity) - Number(l.receivedQuantity),
          maxQty: Number(l.quantity) - Number(l.receivedQuantity),
          unitCostKurus: Number(l.unitPriceKurus),
        })),
    );
    setInitialized(true);
  }

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      stockApi.warehouses
        .list()
        .then((r) => r.data)
        .catch(() => []),
  });

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      purchaseApi.goodsReceipt(id, {
        items: items
          .filter((i) => i.warehouseId && i.quantity > 0)
          .map((i) => ({
            productId: i.productId,
            productName: i.productName,
            warehouseId: i.warehouseId,
            quantity: i.quantity,
            unitCostKurus: i.unitCostKurus,
          })),
        receiptDate,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["po", id] });
      router.push(`/satin-alma/${id}`);
    },
  });

  const setItem = <K extends keyof ReceiptItem>(
    i: number,
    k: K,
    v: ReceiptItem[K],
  ) =>
    setItems((its) => its.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const isValid = items.some((i) => i.warehouseId && i.quantity > 0);

  if (orderLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Truck size={28} className="text-muted-foreground animate-pulse opacity-25" />
      </div>
    );
  }

  if (!order) {
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

  if (items.length === 0 && initialized) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <Truck size={14} />
          <AlertDescription>{t("purchase.allItemsReceived")}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => router.back()} className="w-fit gap-1.5">
          <ArrowLeft size={13} /> {t("purchase.goBack")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-1.5">
            <ArrowLeft size={13} /> {t("common.back")}
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <Truck size={20} className="text-muted-foreground" />
              {t("purchase.goodsReceipt")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="tabular-nums">{order.poNumber}</span> — {order.vendorName}
            </p>
          </div>
        </div>
        <Button onClick={() => save()} disabled={!isValid} isLoading={isPending} className="gap-2">
          <Save size={13} /> {t("purchase.saveReceipt")}
        </Button>
      </div>

      {/* Tarih ve Not */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("purchase.receiptDate")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("purchase.receiptDate")} *
              </Label>
              <DateInput
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("purchase.receiptNote")}
              </Label>
              <Input
                value={notes}
                placeholder={t("purchase.receiptNotePlaceholder")}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kalemler */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("purchase.receiptItems")} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.product")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.remaining")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.receivedTotal")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider min-w-[160px]">{t("purchase.warehouse")}</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">{t("purchase.unitCost")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium text-foreground">
                      {item.productName}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">
                      {fmtQty(item.maxQty)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={item.maxQty}
                        className="tabular-nums w-24"
                        value={item.quantity}
                        onChange={(e) =>
                          setItem(
                            i,
                            "quantity",
                            Math.min(Number(e.target.value) || 0, item.maxQty),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={item.warehouseId || undefined}
                        onValueChange={(v) => setItem(i, "warehouseId", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("purchase.selectWarehouse")} />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((wh) => (
                            <SelectItem key={wh.id} value={wh.id}>
                              {wh.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        className="tabular-nums w-32"
                        value={kurusToTl(item.unitCostKurus)}
                        onChange={(e) =>
                          setItem(i, "unitCostKurus", Math.round((Number(e.target.value) || 0) * 100))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
} from "lucide-react";
import { purchaseApi } from "@/services/purchase";
import { stockApi } from "@/services/stock";
import { crmApi } from "@/services/crm";
import { kurusToTl } from "@/lib/format";
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
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from '@/components/ui/date-input';

interface LineState {
  productId: string;
  productName: string;
  sku: string;
  unitCode: string;
  quantity: number;
  unitPriceInput: string;
  kdvRate: number;
  warehouseId: string;
}

const BLANK_LINE: LineState = {
  productId: "",
  productName: "",
  sku: "",
  unitCode: "",
  quantity: 1,
  unitPriceInput: "",
  kdvRate: 20,
  warehouseId: "",
};

export default function YeniSatinAlmaPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [delivDate, setDelivDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([{ ...BLANK_LINE }]);

  const { data: products = [] } = useQuery({
    queryKey: ["products-search"],
    queryFn: () =>
      stockApi.products
        .list({ limit: 200 })
        .then((r) => r.data.data)
        .catch(() => []),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      stockApi.warehouses
        .list()
        .then((r) => r.data)
        .catch(() => []),
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () =>
      Promise.all([
        crmApi.contacts
          .list({ type: "VENDOR", limit: 200 })
          .then((r) => r.data.data),
        crmApi.contacts
          .list({ type: "BOTH", limit: 200 })
          .then((r) => r.data.data),
      ])
        .then(([v, b]) => [...v, ...b])
        .catch(() => []),
  });

  const addLine = () => setLines((ls) => [...ls, { ...BLANK_LINE }]);
  const removeLine = (i: number) =>
    setLines((ls) => ls.filter((_, j) => j !== i));
  const setLine = <K extends keyof LineState>(
    i: number,
    k: K,
    v: LineState[K],
  ) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const { mutate: create, isPending } = useMutation({
    mutationFn: () =>
      purchaseApi.create({
        vendorId,
        vendorName,
        orderDate,
        expectedDeliveryDate: delivDate || undefined,
        notes: notes || undefined,
        lines: lines
          .filter((l) => l.productId && l.unitPriceInput)
          .map((l) => ({
            productId: l.productId,
            productName: l.productName,
            sku: l.sku || undefined,
            quantity: l.quantity,
            unitPriceKurus: Math.round(
              parseFloat(l.unitPriceInput.replace(",", ".")) * 100,
            ),
            kdvRate: l.kdvRate,
            warehouseId: l.warehouseId || undefined,
          })),
      }),
    onSuccess: (res: { data: { id: string } }) =>
      router.push(`/satin-alma/${res.data.id}`),
  });

  const isValid =
    vendorId && lines.some((l) => l.productId && l.unitPriceInput);

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
              <ShoppingCart size={20} className="text-muted-foreground" />
              {t("purchase.newPurchaseOrder")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("purchase.manualOrderDesc")}
            </p>
          </div>
        </div>
        <Button onClick={() => create()} disabled={!isValid} isLoading={isPending} className="gap-2">
          <Save size={13} /> {t("purchase.createOrder")}
        </Button>
      </div>

      {/* Temel Bilgiler */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("purchase.basicInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("purchase.vendorRequired")}
              </Label>
              <Select
                value={vendorId}
                onValueChange={(v) => {
                  const vendor = vendors.find((vd) => vd.id === v);
                  setVendorId(v);
                  setVendorName(vendor?.name ?? "");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("purchase.selectVendor")} />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("purchase.orderDateRequired")}
              </Label>
              <DateInput
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("purchase.estimatedDelivery")}
              </Label>
              <DateInput
                value={delivDate}
                onChange={(e) => setDelivDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kalemler */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("purchase.linesTitle")} ({lines.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addLine} className="h-7 gap-1 text-xs">
            <Plus size={12} /> {t("purchase.addLine")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {[
                    t("purchase.productRequired"),
                    t("purchase.quantityRequired"),
                    t("purchase.unitPriceRequired"),
                    t("stock.warehouse"),
                    t("purchase.kdv"),
                    "",
                  ].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell className="min-w-[180px]">
                      <Select
                        value={line.productId || undefined}
                        onValueChange={(v) => {
                          const p = products.find((p) => p.id === v);
                          setLine(i, "productId", v);
                          if (p) {
                            setLine(i, "productName", p.name);
                            setLine(i, "unitCode", p.unitCode ?? "");
                            setLine(i, "sku", p.sku ?? "");
                            setLine(
                              i,
                              "unitPriceInput",
                              kurusToTl(p.listPriceKurus).toFixed(2),
                            );
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("purchase.selectProduct")} />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {line.sku && (
                        <div className="text-[10px] text-primary mt-0.5">✓ {line.sku}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="tabular-nums"
                        value={line.quantity}
                        onChange={(e) =>
                          setLine(i, "quantity", parseInt(e.target.value) || 1)
                        }
                      />
                      {line.unitCode && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{line.unitCode}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="tabular-nums"
                        value={line.unitPriceInput}
                        placeholder="0.00"
                        onChange={(e) =>
                          setLine(i, "unitPriceInput", e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-[140px]">
                      <Select
                        value={line.warehouseId || undefined}
                        onValueChange={(v) => setLine(i, "warehouseId", v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("purchase.selectWarehouse")} />
                        </SelectTrigger>
                        <SelectContent>
                          {warehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(line.kdvRate)}
                        onValueChange={(v) =>
                          setLine(i, "kdvRate", parseInt(v))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 1, 10, 20].map((r) => (
                            <SelectItem key={r} value={String(r)}>
                              %{r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:bg-destructive/10"
                        onClick={() => removeLine(i)}
                        disabled={lines.length <= 1}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Notlar */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("purchase.notes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[72px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("purchase.notesPlaceholder")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

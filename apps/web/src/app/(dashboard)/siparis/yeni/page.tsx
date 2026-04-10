"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ShoppingBag,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
} from "lucide-react";
import {
  orderApi,
  CHANNEL_LABELS,
  type OrderChannel,
  type CreateOrderDto,
  type CreateOrderLineDto,
} from "@/services/order";
import { crmApi } from "@/services/crm";
import { stockApi } from "@/services/stock";
import { fmtQty, formatCurrency, kurusToTl } from "@/lib/format";
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

function CustomerPicker({
  name,
  email,
  onChange,
  t,
}: {
  name: string;
  email: string;
  onChange: (name: string, email: string, contactId?: string) => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(name);
  const [debounced, setDebounced] = useState("");

  useEffect(() => { setQ(name); }, [name]);
  useEffect(() => {
    const t2 = setTimeout(() => setDebounced(q), 280);
    return () => clearTimeout(t2);
  }, [q]);

  const { data: contacts = [] } = useQuery({
    queryKey: ["contact-picker", debounced],
    queryFn: () =>
      crmApi.contacts.list({ q: debounced, limit: 8 }).then((r) => r.data.data),
    enabled: debounced.trim().length >= 1,
  });

  return (
    <div className="relative">
      <Input
        placeholder={t("order.customerSearch")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value, email, undefined);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open && contacts.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0.5 max-h-[200px] overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {contacts.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 border-b border-border flex flex-col gap-0.5 hover:bg-muted/40 transition-colors"
              onMouseDown={() => {
                setQ(c.name);
                onChange(c.name, c.email ?? "", c.id);
                setOpen(false);
              }}
            >
              <span className="text-sm text-foreground font-medium">{c.name}</span>
              {c.email && <span className="text-[11px] text-muted-foreground">{c.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PickedProduct {
  productId: string;
  productName: string;
  sku: string;
  unitPriceKurus: number;
  unitCode: string;
}

function ProductPicker({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (p: PickedProduct) => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const [debounced, setDebounced] = useState("");

  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => {
    const t2 = setTimeout(() => setDebounced(q), 280);
    return () => clearTimeout(t2);
  }, [q]);

  const { data: products = [] } = useQuery({
    queryKey: ["product-picker", debounced],
    queryFn: () =>
      stockApi.products
        .list({ q: debounced, limit: 10, includeStock: true })
        .then((r) => r.data.data),
    enabled: debounced.trim().length >= 1,
  });

  return (
    <div className="relative">
      <Input
        placeholder={t("order.productSearch")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange({ productId: "", productName: e.target.value, sku: "", unitPriceKurus: 0, unitCode: "" });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {open && products.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0.5 max-h-[220px] overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 border-b border-border hover:bg-muted/40 transition-colors"
              onMouseDown={() => {
                setQ(p.name);
                onChange({
                  productId: p.id,
                  productName: p.name,
                  sku: p.sku,
                  unitPriceKurus: p.listPriceKurus / 100,
                  unitCode: p.unitCode,
                });
                setOpen(false);
              }}
            >
              <div className="flex justify-between items-center gap-2">
                <span className="text-sm text-foreground font-medium">{p.name}</span>
                <span className="text-xs text-primary tabular-nums whitespace-nowrap">
                  {formatCurrency(kurusToTl(p.listPriceKurus))}
                </span>
              </div>
              <div className="flex gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground tabular-nums">{p.sku}</span>
                <span className="text-[11px] text-muted-foreground">· {p.unitCode}</span>
                <span className="text-[11px] text-muted-foreground">· {t("order.stock")} {fmtQty(p.totalStockQty)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type LineState = Partial<CreateOrderLineDto> & {
  _key: number;
  unitCode?: string;
};

const BLANK_LINE: LineState = {
  _key: Date.now(),
  kdvRate: 20,
  discountRate: 0,
  quantity: 1,
};

const CHANNELS: OrderChannel[] = [
  "DIREKT", "TRENDYOL", "HEPSIBURADA", "WEB", "TELEFON",
];

export default function YeniSiparisPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [customerName,  setCustomerName ] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerId,    setCustomerId   ] = useState<string | undefined>();
  const [orderDate,     setOrderDate    ] = useState(new Date().toISOString().slice(0, 10));
  const [channel,       setChannel      ] = useState<OrderChannel>("DIREKT");
  const [notes,         setNotes        ] = useState("");
  const [lines,         setLines        ] = useState<LineState[]>([{ ...BLANK_LINE }]);

  const addLine = () =>
    setLines((prev) => [...prev, { _key: Date.now(), kdvRate: 20, discountRate: 0, quantity: 1 }]);
  const removeLine = (key: number) =>
    setLines((prev) => prev.filter((l) => l._key !== key));
  const updateLine = (key: number, field: keyof CreateOrderLineDto, val: unknown) =>
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: val } : l)));

  const { mutate: create, isPending } = useMutation({
    mutationFn: () => {
      const dto: CreateOrderDto = {
        customerId: customerId || undefined,
        customerName,
        customerEmail: customerEmail || undefined,
        orderDate,
        channel,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          productId: l.productId ?? "",
          productName: l.productName ?? "",
          sku: l.sku,
          quantity: Number(l.quantity ?? 1),
          unitPriceKurus: Math.round(Number(l.unitPriceKurus ?? 0) * 100),
          discountRate: Number(l.discountRate ?? 0),
          kdvRate: Number(l.kdvRate ?? 20),
          warehouseId: l.warehouseId,
        })),
      };
      return orderApi.create(dto);
    },
    onSuccess: (res: { data: { id: string } }) => router.push(`/siparis/${res.data.id}`),
  });

  const isValid = customerName.trim() !== "" && lines.length > 0;

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
              <ShoppingBag size={20} className="text-muted-foreground" />
              {t("order.newSalesOrder")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("order.createManualOrder")}</p>
          </div>
        </div>
        <Button onClick={() => create()} disabled={!isValid} isLoading={isPending} className="gap-2">
          <Save size={13} /> {t("order.createOrder")}
        </Button>
      </div>

      {/* Müşteri Bilgileri */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("order.customerInfo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3 flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("order.customerRequired")}
                {customerId && (
                  <span className="ml-2 text-[10px] text-primary">{t("order.crmSelected")}</span>
                )}
              </Label>
              <CustomerPicker
                name={customerName}
                email={customerEmail}
                onChange={(n, e, id) => { setCustomerName(n); setCustomerEmail(e); setCustomerId(id); }}
                t={t}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("order.customerEmail")}</Label>
              <Input
                type="email"
                placeholder="musteri@firma.com"
                value={customerEmail}
                onChange={(e) => { setCustomerEmail(e.target.value); setCustomerId(undefined); }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("order.orderDateRequired")}</Label>
              <DateInput
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">{t("order.channel")}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as OrderChannel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>{CHANNEL_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kalemler */}
      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("order.linesTitle")} ({lines.length})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={addLine} className="h-7 gap-1 text-xs">
            <Plus size={12} /> {t("order.addLine")}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {[t("order.productRequired"), t("order.quantityRequired"), t("order.unitPriceRequired"), t("order.discount"), t("purchase.kdv"), ""].map((h) => (
                    <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, idx) => (
                  <TableRow key={line._key}>
                    <TableCell className="min-w-[200px]">
                      <ProductPicker
                        value={line.productName ?? ""}
                        onChange={(p) =>
                          setLines((prev) =>
                            prev.map((l) => {
                              if (l._key !== line._key) return l;
                              if (!p.productId)
                                return { ...l, productName: p.productName, productId: undefined, sku: undefined };
                              return { ...l, productId: p.productId, productName: p.productName, sku: p.sku, unitPriceKurus: p.unitPriceKurus, unitCode: p.unitCode };
                            })
                          )
                        }
                        t={t}
                      />
                      {line.productId && (
                        <div className="text-[10px] text-primary mt-0.5">✓ {line.sku}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={1}
                        className="tabular-nums"
                        value={line.quantity ?? 1}
                        onChange={(e) => updateLine(line._key, "quantity", e.target.value)}
                      />
                      {line.unitCode && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{line.unitCode}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} step={0.01}
                        className="tabular-nums"
                        placeholder="0,00"
                        value={line.unitPriceKurus ?? ""}
                        onChange={(e) => updateLine(line._key, "unitPriceKurus", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number" min={0} max={100}
                        className="tabular-nums"
                        value={line.discountRate ?? 0}
                        onChange={(e) => updateLine(line._key, "discountRate", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(line.kdvRate ?? 20)}
                        onValueChange={(v) => updateLine(line._key, "kdvRate", Number(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0, 1, 10, 20].map((r) => (
                            <SelectItem key={r} value={String(r)}>%{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 text-destructive hover:bg-destructive/10"
                        onClick={() => removeLine(line._key)}
                        disabled={lines.length <= 1}
                      >
                        <Trash2 size={13} />
                      </Button>
                      <div className="text-[9px] text-muted-foreground mt-0.5">#{idx + 1}</div>
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
            {t("order.notes")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[72px] resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("order.notesPlaceholder")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

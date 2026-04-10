"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { financialApi, type InvoiceType } from "@/services/financial";
import { crmApi, type Contact } from "@/services/crm";
import { stockApi, type Product } from "@/services/stock";
import { tenantApi } from "@/services/tenant";
import { useSession } from "next-auth/react";
import { invoiceFormSchema, INVOICE_PROFILE_ID } from "@/lib/validations/invoice.schema";
import { SectorialFieldsForm } from "@/components/invoices/sectorial-fields-form";
import Link from "next/link";
import {
  FileText,
  Plus,
  Trash2,
  ArrowLeft,
  AlertCircle,
  Check,
  Search,
  X,
  Loader2,
  User,
  Package,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { formatCurrency, kurusToTl } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const KDV_RATES = [0, 1, 10, 20] as const;

const INVOICE_TYPES: { value: InvoiceType; label: string }[] = [
  { value: "E_FATURA", label: "e-Fatura" },
  { value: "E_ARSIV",  label: "e-Arşiv"  },
  { value: "PROFORMA", label: "Proforma" },
  { value: "PURCHASE", label: "Alış Faturası" },
];

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function dueDateDefault() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

// ─── Kalem tipi ───────────────────────────────────────────────────────────────

interface LineItem {
  key: number;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: (typeof KDV_RATES)[number];
}

function lineSubtotal(l: LineItem) { return l.quantity * l.unitPrice; }
function lineVat(l: LineItem)      { return Math.round((lineSubtotal(l) * l.vatRate) / 100); }
function lineTotal(l: LineItem)    { return lineSubtotal(l) + lineVat(l); }

// ─── Müşteri Seçici Modal ─────────────────────────────────────────────────────

function ContactPickerModal({
  open, onSelect, onClose, t,
}: {
  open: boolean;
  onSelect: (c: Contact) => void;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contacts-picker", q],
    queryFn: () => crmApi.contacts.list({ q: q || undefined, type: "CUSTOMER", limit: 30 }),
    select: (r) => r.data.data,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User size={16} className="text-muted-foreground" />
            {t("invoice.customer")}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9 h-9 bg-muted/40"
            placeholder={`${t("invoice.customer")} / ${t("invoice.vkn")}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ScrollArea className="h-80 rounded-lg border">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : !data?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {q ? t("common.noRecord") : t("common.search")}
            </div>
          ) : (
            data.map((c) => (
              <button
                key={c.id}
                onClick={() => { onSelect(c); onClose(); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-left border-b last:border-b-0 hover:bg-muted/50 transition-colors"
              >
                <div className="size-8 rounded-lg bg-muted border border-border flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                  {(c.name ?? "?")[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  {c.vkn && (
                    <p className="text-xs text-muted-foreground tabular-nums">{t("invoice.vkn")}: {c.vkn}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ürün Seçici Modal ────────────────────────────────────────────────────────

function ProductPickerModal({
  open, onSelect, onClose, t,
}: {
  open: boolean;
  onSelect: (p: Product) => void;
  onClose: () => void;
  t: (key: string) => string;
}) {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["products-picker", q],
    queryFn: () => stockApi.products.list({ q: q || undefined, limit: 30, includeStock: false }),
    select: (r) => r.data.data,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package size={16} className="text-muted-foreground" />
            {t("stock.product")}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9 h-9 bg-muted/40"
            placeholder={`${t("stock.product")} / ${t("stock.sku")}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <ScrollArea className="h-80 rounded-lg border">
          {isLoading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : !data?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {q ? t("common.noRecord") : t("common.search")}
            </div>
          ) : (
            data.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); onClose(); }}
                className="flex items-center gap-3 w-full px-4 py-3 text-left border-b last:border-b-0 hover:bg-muted/50 transition-colors"
              >
                <div className="size-9 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground shrink-0">
                  <Package size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{t("stock.sku")}: {p.sku} · {p.unitCode}</p>
                </div>
                {p.listPriceKurus > 0 && (
                  <span className="text-sm font-semibold text-primary tabular-nums shrink-0">
                    {formatCurrency(kurusToTl(p.listPriceKurus))}
                  </span>
                )}
              </button>
            ))
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Kalem Satırı ─────────────────────────────────────────────────────────────

function LineRow({
  line, idx, onChange, onRemove, canRemove, onPickProduct, t,
}: {
  line: LineItem;
  idx: number;
  onChange: (key: number, patch: Partial<LineItem>) => void;
  onRemove: (key: number) => void;
  canRemove: boolean;
  onPickProduct: (key: number) => void;
  t: (key: string) => string;
}) {
  return (
    <TableRow className="group">
      <TableCell className="text-xs text-muted-foreground text-center w-8 py-2">
        {idx + 1}
      </TableCell>
      <TableCell className="py-2 px-1">
        <div className="flex gap-1.5">
          <Input
            className="flex-1 h-8 text-sm bg-muted/30"
            placeholder={t("invoice.description")}
            value={line.description}
            onChange={(e) => onChange(line.key, { description: e.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => onPickProduct(line.key)}
            title="Ürün seç"
          >
            <Package size={13} />
          </Button>
        </div>
      </TableCell>
      <TableCell className="py-2 px-1 w-20">
        <Input
          className="h-8 text-sm text-right tabular-nums bg-muted/30"
          type="number"
          min={1}
          step={1}
          value={line.quantity}
          onChange={(e) => onChange(line.key, { quantity: Math.max(1, parseFloat(e.target.value) || 1) })}
        />
      </TableCell>
      <TableCell className="py-2 px-1 w-28">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₺</span>
          <Input
            className="h-8 text-sm pl-6 text-right tabular-nums bg-muted/30"
            type="number"
            min={0}
            step={0.01}
            value={(line.unitPrice / 100).toFixed(2)}
            onChange={(e) => onChange(line.key, { unitPrice: Math.round((parseFloat(e.target.value) || 0) * 100) })}
          />
        </div>
      </TableCell>
      <TableCell className="py-2 px-1 w-20">
        <Select
          value={String(line.vatRate)}
          onValueChange={(v) => onChange(line.key, { vatRate: parseInt(v) as (typeof KDV_RATES)[number] })}
        >
          <SelectTrigger className="h-8 text-sm bg-muted/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KDV_RATES.map((r) => (
              <SelectItem key={r} value={String(r)}>%{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-2 px-3 text-right text-xs text-muted-foreground tabular-nums w-24">
        {formatCurrency(kurusToTl(lineVat(line)))}
      </TableCell>
      <TableCell className="py-2 px-3 text-right text-sm font-bold tabular-nums text-foreground w-28">
        {formatCurrency(kurusToTl(lineTotal(line)))}
      </TableCell>
      <TableCell className="py-2 px-1 w-10 text-center">
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(line.key)}
          >
            <Trash2 size={13} />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

let keySeq = 1;

export default function YeniFaturaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { t } = useI18n();
  const tenantId = (session?.user as { tenantId?: string })?.tenantId ?? "";

  const [invoiceType,       setInvoiceType]       = useState<InvoiceType>("E_FATURA");
  const [issueDate,         setIssueDate]          = useState(today());
  const [dueDate,           setDueDate]            = useState(dueDateDefault());
  const [currency,          setCurrency]           = useState("TRY");
  const [notes,             setNotes]              = useState("");
  const [customer,          setCustomer]           = useState<Contact | null>(null);
  const [showPicker,        setShowPicker]         = useState(false);
  const [productPickerKey,  setProductPickerKey]   = useState<number | null>(null);
  const [initialized,       setInitialized]        = useState(false);
  const [error,             setError]              = useState("");
  const [validationError,   setValidationError]    = useState<string>("");

  // ─── Sektörel GİB Profili ─────────────────────────────────────────────────
  const [profileId,         setProfileId]          = useState<string>(INVOICE_PROFILE_ID.STANDART);
  const [sectoral,          setSectoral]           = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialized) return;
    const contactId   = searchParams.get("contactId");
    const contactName = searchParams.get("contactName");
    if (contactId && contactName)
      setCustomer({ id: contactId, name: contactName } as Contact);
    setInitialized(true);
  }, [searchParams, initialized]);

  const [lines, setLines] = useState<LineItem[]>([
    { key: keySeq++, description: "", quantity: 1, unitPrice: 0, vatRate: 20 },
  ]);

  useQuery({
    queryKey: ["invoice-number", tenantId],
    queryFn: () => tenantApi.nextInvoiceNumber(tenantId),
    enabled: !!tenantId,
  });

  const updateLine = useCallback((key: number, patch: Partial<LineItem>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((key: number) => {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }, []);

  const subtotal   = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const vatTotal   = lines.reduce((s, l) => s + lineVat(l), 0);
  const grandTotal = subtotal + vatTotal;

  const vatGroups = KDV_RATES.filter((r) => r > 0)
    .map((rate) => ({
      rate,
      base: lines.filter((l) => l.vatRate === rate).reduce((s, l) => s + lineSubtotal(l), 0),
      vat:  lines.filter((l) => l.vatRate === rate).reduce((s, l) => s + lineVat(l), 0),
    }))
    .filter((g) => g.vat > 0);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      setValidationError("");

      // ─── Zod Validasyon ─────────────────────────────────────────────────
      const formData = {
        invoiceType,
        profileId,
        contactId: customer?.id ?? "",
        customerName: customer?.name ?? "",
        issueDate,
        dueDate: dueDate || undefined,
        currency,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: "adet",
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
          discountPct: 0,
          productId: undefined,
        })),
        subtotal,
        vatTotal,
        total: grandTotal,
        notes: notes || undefined,
        sectoral,
      };

      const validationResult = invoiceFormSchema.safeParse(formData);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        const errorMsg = firstError.message || t("invoice.validationError");
        setValidationError(errorMsg);
        throw new Error(errorMsg);
      }

      // ─── API'ye Gönder ──────────────────────────────────────────────────
      const payload = {
        invoiceType,
        direction: (invoiceType === "PURCHASE" ? "IN" : "OUT") as "IN" | "OUT",
        issueDate, dueDate, currency,
        customerName: customer?.name ?? "",
        contactId: customer?.id ?? undefined,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
          lineTotal: lineTotal(l),
        })),
        subtotal, vatTotal, total: grandTotal,
        notes: notes || undefined,
        profileId,
        sectoral,
      };
      return financialApi.invoices.create(
        payload as unknown as Partial<import("@/services/financial").Invoice>,
      );
    },
    onSuccess: (res) => router.push(`/faturalar/${res.data.id}`),
    onError: () => setError(t("invoice.invoiceError")),
  });

  const canSubmit = !!customer && lines.every((l) => l.description.trim() && l.unitPrice > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild className="size-8 shrink-0">
          <Link href="/faturalar">
            <ArrowLeft size={15} />
          </Link>
        </Button>
        <FileText size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("invoice.newInvoice")}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-5 items-start">
        {/* Sol — Form */}
        <div className="flex flex-col gap-5">
          {/* Fatura Bilgileri */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("invoice.invoiceInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("common.type")}
                  </Label>
                  <Select value={invoiceType} onValueChange={(v) => setInvoiceType(v as InvoiceType)}>
                    <SelectTrigger className="h-9 bg-muted/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVOICE_TYPES.map((ty) => (
                        <SelectItem key={ty.value} value={ty.value}>{ty.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("invoice.date")}
                  </Label>
                  <DateInput className="h-9 bg-muted/40 " value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("invoice.dueDate")}
                  </Label>
                  <DateInput className="h-9 bg-muted/40 " value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("invoice.currency")}
                  </Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-9 bg-muted/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["TRY", "USD", "EUR", "GBP"].map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sektörel GİB Profili */}
                <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-4">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Sektörel GİB Profili (Opsiyonel)
                  </Label>
                  <Select value={profileId} onValueChange={setProfileId}>
                    <SelectTrigger className="h-9 bg-muted/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={INVOICE_PROFILE_ID.STANDART}>Standart</SelectItem>
                      <SelectItem value={INVOICE_PROFILE_ID.SGK}>🏥 SGK</SelectItem>
                      <SelectItem value={INVOICE_PROFILE_ID.ENERJI}>⚡ ENERJI</SelectItem>
                      <SelectItem value={INVOICE_PROFILE_ID.IDIS}>📦 IDIS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sektörel Alanlar */}
          {profileId !== INVOICE_PROFILE_ID.STANDART && (
            <SectorialFieldsForm
              profileId={profileId}
              values={sectoral}
              onChange={(field, value) => setSectoral((prev) => ({ ...prev, [field]: value }))}
              errors={{}}
            />
          )}

          {/* Müşteri / Tedarikçi */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {invoiceType === "PURCHASE" ? t("invoice.vendor") : t("invoice.customer")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customer ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="size-9 rounded-lg bg-muted border border-border flex items-center justify-center text-sm font-bold text-foreground shrink-0">
                    {(customer.name ?? "?")[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{customer.name}</p>
                    {customer.vkn && (
                      <p className="text-xs text-muted-foreground tabular-nums">{t("invoice.vkn")}: {customer.vkn}</p>
                    )}
                    {customer.email && (
                      <p className="text-xs text-muted-foreground">{customer.email}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => setCustomer(null)}>
                    <X size={14} />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPicker(true)}
                  className="flex items-center justify-center gap-2 w-full py-5 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <User size={15} /> {t("invoice.customer")}
                </button>
              )}
            </CardContent>
          </Card>

          {/* Kalemler */}
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("invoice.lineItems")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-8 text-center">#</TableHead>
                      <TableHead className="font-semibold">{t("invoice.tableHeaders.description")}</TableHead>
                      <TableHead className="font-semibold w-20">{t("invoice.tableHeaders.quantity")}</TableHead>
                      <TableHead className="font-semibold w-28">{t("invoice.tableHeaders.unitPrice")}</TableHead>
                      <TableHead className="font-semibold w-20">{t("invoice.tableHeaders.vat")}</TableHead>
                      <TableHead className="text-right font-semibold w-24">{t("invoice.tableHeaders.vatAmount")}</TableHead>
                      <TableHead className="text-right font-semibold w-28">{t("invoice.tableHeaders.total")}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l, i) => (
                      <LineRow
                        key={l.key}
                        line={l}
                        idx={i}
                        onChange={updateLine}
                        onRemove={removeLine}
                        canRemove={lines.length > 1}
                        onPickProduct={(key) => setProductPickerKey(key)}
                        t={t}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() =>
                    setLines((ls) => [
                      ...ls,
                      { key: keySeq++, description: "", quantity: 1, unitPrice: 0, vatRate: 20 },
                    ])
                  }
                >
                  <Plus size={13} /> {t("invoice.addLine")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notlar */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {`${t("common.notes")} (${t("common.optional")})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className={cn(
                  "w-full min-h-[72px] resize-y rounded-md border border-input bg-muted/40 px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0",
                  "font-inherit"
                )}
                placeholder={t("invoice.description")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Validasyon Hatası */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription className="flex items-center justify-between">
                {validationError}
                <button onClick={() => setValidationError("")} className="ml-auto">
                  <X size={13} />
                </button>
              </AlertDescription>
            </Alert>
          )}

          {/* API Hatası */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription className="flex items-center justify-between">
                {error}
                <button onClick={() => setError("")} className="ml-auto">
                  <X size={13} />
                </button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Sağ — Özet */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          {/* Tutar Özeti */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("invoice.invoiceSummary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-xs">{t("invoice.subtotal")}</span>
                <span className="tabular-nums text-foreground font-medium">{formatCurrency(kurusToTl(subtotal))}</span>
              </div>

              {vatGroups.map((g) => (
                <div key={g.rate} className="flex justify-between">
                  <span className="text-muted-foreground text-xs">KDV %{g.rate}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(kurusToTl(g.vat))}</span>
                </div>
              ))}

              {vatTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">{t("invoice.total_kdv")}</span>
                  <span className="tabular-nums text-foreground">{formatCurrency(kurusToTl(vatTotal))}</span>
                </div>
              )}

              <Separator className="my-1" />
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-semibold text-foreground">{t("invoice.grandTotal")}</span>
                <span className="text-xl font-bold text-primary tabular-nums">{formatCurrency(kurusToTl(grandTotal))}</span>
              </div>
            </CardContent>
          </Card>

          {/* Müşteri özeti */}
          {customer && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {invoiceType === "PURCHASE" ? t("invoice.vendor") : t("invoice.customer")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-semibold text-foreground">{customer.name}</p>
                {customer.vkn && (
                  <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                    {t("invoice.vkn")}: {customer.vkn}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Gönder */}
          <Button
            className="w-full h-9 gap-2 shadow-sm"
            onClick={() => mutate()}
            disabled={!canSubmit}
            isLoading={isPending}
          >
            <Check size={14} /> {t("invoice.createInvoice")}
          </Button>

          {!canSubmit && (
            <p className="text-center text-xs text-muted-foreground leading-relaxed">
              {!customer ? t("invoice.selectCustomerFirst") : t("invoice.fillAllLines")}
            </p>
          )}

          <Button variant="ghost" asChild className="w-full text-xs text-muted-foreground">
            <Link href="/faturalar">{t("common.cancel")}</Link>
          </Button>
        </div>
      </div>

      {/* Müşteri Seçici */}
      <ContactPickerModal
        open={showPicker}
        onSelect={(c) => { setCustomer(c); setShowPicker(false); }}
        onClose={() => setShowPicker(false)}
        t={t}
      />

      {/* Ürün Seçici */}
      <ProductPickerModal
        open={productPickerKey !== null}
        onSelect={(p) => {
          if (productPickerKey !== null)
            updateLine(productPickerKey, { description: p.name, unitPrice: p.listPriceKurus });
          setProductPickerKey(null);
        }}
        onClose={() => setProductPickerKey(null)}
        t={t}
      />
    </div>
  );
}

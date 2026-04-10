"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  FileText,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Loader2,
  Search,
  Truck,
  Package,
  Building2,
  X,
} from "lucide-react";
import {
  waybillApi,
  type CreateWaybillDto,
  type CreateWaybillLineDto,
} from "@/services/waybill";
import { purchaseApi, type PurchaseOrder } from "@/services/purchase";
import { crmApi, type Contact } from "@/services/crm";
import { stockApi, type Product, type Warehouse } from "@/services/stock";
import { fleetApi, type Vehicle, type Driver } from "@/services/fleet";
import { tenantApi } from "@/services/tenant";
import { useTenant } from "@/hooks/use-tenant";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from '@/components/ui/date-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ShipMode = "CARGO" | "OWN";

const BLANK_LINE = (): CreateWaybillLineDto => ({
  productName: "",
  unitCode: "ADET",
  quantity: 1,
});

// ─── Section Title ─────────────────────────────────────────────────────────────

function SectionTitle({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
      {label}
    </p>
  );
}

// ─── Search Dropdown ───────────────────────────────────────────────────────────

interface SearchDropdownProps<T> {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelect: (item: T) => void;
  items: T[];
  loading: boolean;
  renderItem: (item: T) => React.ReactNode;
  getLabel: (item: T) => string;
  t: (key: string) => string;
}

function SearchDropdown<T>({
  placeholder,
  value,
  onChange,
  onSelect,
  items,
  loading,
  renderItem,
  getLabel,
  t,
}: SearchDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          className="pl-7 pr-7"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-muted-foreground"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <X size={12} />
          </Button>
        )}
      </div>
      {open && (value.length >= 1 || items.length > 0) && (
        <div className="absolute top-full left-0 right-0 z-50 bg-background border border-border rounded-md mt-1 max-h-56 overflow-y-auto shadow-lg">
          {loading && (
            <div className="px-3.5 py-2.5 text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {t("waybill.searching")}
            </div>
          )}
          {!loading && items.length === 0 && value.length >= 2 && (
            <div className="px-3.5 py-2.5 text-xs text-muted-foreground">
              {t("waybill.noResults")}
            </div>
          )}
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(item);
                onChange(getLabel(item));
                setOpen(false);
              }}
              className={cn(
                "w-full text-left px-3.5 py-2 text-xs hover:bg-muted/50 transition-colors",
                idx < items.length - 1 && "border-b border-border",
              )}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function YeniIrsaliyePage() {
  const router = useRouter();
  const { tenantId } = useTenant();
  const { t } = useI18n();

  const [form, setForm] = useState<Partial<CreateWaybillDto>>({
    type: "SATIS",
    shipDate: new Date().toISOString().slice(0, 10),
    lines: [BLANK_LINE()],
  });

  const [shipMode, setShipMode] = useState<ShipMode>("OWN");
  const [senderSearch, setSenderSearch] = useState("");
  const [receiverSearch, setReceiverSearch] = useState("");
  const [poSearch, setPoSearch] = useState("");
  const [productSearch, setProductSearch] = useState<string[]>([""]);

  const set = <K extends keyof CreateWaybillDto>(
    k: K,
    v: CreateWaybillDto[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  const setLine = (
    i: number,
    k: keyof CreateWaybillLineDto,
    v: CreateWaybillLineDto[typeof k],
  ) =>
    setForm((f) => {
      const lines = [...(f.lines ?? [])];
      lines[i] = { ...lines[i]!, [k]: v };
      return { ...f, lines };
    });

  const addLine = () => {
    setForm((f) => ({ ...f, lines: [...(f.lines ?? []), BLANK_LINE()] }));
    setProductSearch((ps) => [...ps, ""]);
  };
  const removeLine = (i: number) => {
    setForm((f) => ({
      ...f,
      lines: (f.lines ?? []).filter((_, idx) => idx !== i),
    }));
    setProductSearch((ps) => ps.filter((_, idx) => idx !== i));
  };

  const { data: senderContacts, isFetching: senderLoading } = useQuery({
    queryKey: ["contacts-search", senderSearch],
    queryFn: () =>
      crmApi.contacts
        .list({ q: senderSearch, limit: 8 })
        .then((r) => (r.data?.data ?? r.data ?? []) as Contact[]),
    enabled: senderSearch.length >= 1,
    staleTime: 10_000,
  });

  const { data: receiverContacts, isFetching: receiverLoading } = useQuery({
    queryKey: ["contacts-search", receiverSearch],
    queryFn: () =>
      crmApi.contacts
        .list({ q: receiverSearch, limit: 8 })
        .then((r) => (r.data?.data ?? r.data ?? []) as Contact[]),
    enabled: receiverSearch.length >= 1,
    staleTime: 10_000,
  });

  const [activeProductLine, setActiveProductLine] = useState<number | null>(
    null,
  );

  const { data: activeProducts, isFetching: productsLoading } = useQuery({
    queryKey: [
      "products-search",
      activeProductLine !== null ? productSearch[activeProductLine] : "",
    ],
    queryFn: () =>
      stockApi.products
        .list({
          q:
            activeProductLine !== null
              ? (productSearch[activeProductLine] ?? "")
              : "",
          limit: 8,
        })
        .then((r) => {
          const res = r.data;
          return ((res as { data?: Product[] }).data ??
            (Array.isArray(res) ? res : [])) as Product[];
        }),
    enabled:
      activeProductLine !== null &&
      (productSearch[activeProductLine]?.length ?? 0) >= 1,
    staleTime: 10_000,
  });

  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () =>
      stockApi.warehouses
        .list()
        .then((r) => (Array.isArray(r.data) ? r.data : []) as Warehouse[]),
    staleTime: 60_000,
  });

  const { data: vehicles } = useQuery({
    queryKey: ["fleet-vehicles-active"],
    queryFn: () =>
      fleetApi.vehicles.list({ status: "AKTIF", limit: 100 }).then((r) => {
        const res = r.data as { items?: Vehicle[]; data?: Vehicle[] } | Vehicle[];
        if (Array.isArray(res)) return res;
        return (res.items ?? res.data ?? []) as Vehicle[];
      }),
    staleTime: 60_000,
  });

  const { data: drivers } = useQuery({
    queryKey: ["fleet-drivers-active"],
    queryFn: () =>
      fleetApi.drivers.list({ status: "AKTIF", limit: 100 }).then((r) => {
        const res = r.data as { items?: Driver[]; data?: Driver[] } | Driver[];
        if (Array.isArray(res)) return res;
        return (res.items ?? res.data ?? []) as Driver[];
      }),
    staleTime: 60_000,
  });

  const { data: tenantProfile } = useQuery({
    queryKey: ["tenant-profile", tenantId],
    queryFn: () => tenantApi.getProfile(tenantId!).then((r) => r.data),
    enabled: !!tenantId,
    staleTime: 300_000,
  });

  // tenantProfile henüz yüklenmemişken PO seçilirse, profil gelince alıcıyı doldur
  const pendingReceiverFill = useRef(false);
  useEffect(() => {
    if (pendingReceiverFill.current && tenantProfile) {
      set("receiverName", (tenantProfile as { companyName?: string }).companyName ?? "");
      set("receiverVknTckn", (tenantProfile as { vkn?: string }).vkn ?? undefined);
      set("receiverAddress", (tenantProfile as { address?: string }).address ?? undefined);
      pendingReceiverFill.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantProfile]);

  const { data: approvedPOs } = useQuery({
    queryKey: ["purchase-orders-approved"],
    queryFn: () =>
      purchaseApi.list({ limit: 200 }).then((r) => {
        const items = (r as unknown as { data: { data: PurchaseOrder[] } }).data?.data ?? [];
        return items.filter(
          (po) => ["sent", "partial"].includes(po.status) && !!po.approvedBy,
        );
      }),
    enabled: form.type === "ALIS",
    staleTime: 30_000,
  });

  const selectPO = async (po: PurchaseOrder) => {
    // Gönderici = tedarikçi
    set("senderName", po.vendorName ?? "");
    setSenderSearch(po.vendorName ?? "");
    if (po.vendorId) {
      try {
        const res = await crmApi.contacts.get(po.vendorId);
        const vendor = (res as unknown as { data: import("@/services/crm").Contact }).data;
        set("senderName", vendor.name ?? po.vendorName ?? "");
        setSenderSearch(vendor.name ?? po.vendorName ?? "");
        set("senderVkn", vendor.vkn ?? undefined);
        set("senderAddress", vendor.address ?? undefined);
      } catch {
        // vendor bulunamazsa po.vendorName ile devam et
      }
    }
    // Alıcı = biz (tenant)
    if (tenantProfile) {
      set("receiverName", (tenantProfile as { companyName?: string }).companyName ?? "");
      set("receiverVknTckn", (tenantProfile as { vkn?: string }).vkn ?? undefined);
      set("receiverAddress", (tenantProfile as { address?: string }).address ?? undefined);
      setReceiverSearch("");
    } else {
      // Profil henüz yüklenmediyse useEffect ile doldurulacak
      pendingReceiverFill.current = true;
    }
    // Referans bağlantısı
    set("refType", "purchase_order");
    set("refId", po.id);
    set("refNumber", po.poNumber);
    setPoSearch(`${po.poNumber} – ${po.vendorName ?? ""}`);
    // Kalemleri aktar — PO'dan gelen temel verilerle hemen doldur
    if (po.lines?.length) {
      const baseLines = po.lines.map((l) => ({
        productId:   l.productId ?? undefined,
        productName: l.productName,
        sku:         undefined as string | undefined,
        unitCode:    String(l.unitCode || "ADET"),
        quantity:    Math.max(Number(String(l.quantity)) || 1, 0.001),
        warehouseId: undefined as string | undefined,
      }));
      set("lines", baseLines);
      setProductSearch(po.lines.map((l) => l.productName));

      // SKU ve kesin unitCode için stock-service'den ürünleri arka planda çek
      const indexed = po.lines
        .map((l, i) => ({ productId: l.productId, i }))
        .filter((x): x is { productId: string; i: number } => !!x.productId);
      if (indexed.length > 0) {
        Promise.all(
          indexed.map(({ productId }) =>
            stockApi.products.get(productId).then((r) => r.data as Product)
          )
        ).then((products) => {
          setForm((f) => {
            const lines = [...(f.lines ?? [])];
            indexed.forEach(({ i }, idx) => {
              const p = products[idx];
              if (p && lines[i]) {
                lines[i] = {
                  ...lines[i]!,
                  sku: p.sku || undefined,
                  unitCode: p.unitCode || lines[i]!.unitCode || "ADET",
                };
              }
            });
            return { ...f, lines };
          });
        }).catch(() => {
          // stock-service erişilemezse PO'dan gelen unitCode ile devam et
        });
      }
    }
  };

  const selectSender = (c: Contact) => {
    set("senderName", c.name);
    set("senderVkn", c.vkn ?? undefined);
    set("senderAddress", c.address ?? undefined);
    setSenderSearch(c.name);
  };
  const selectReceiver = (c: Contact) => {
    set("receiverName", c.name);
    set("receiverVknTckn", c.vkn ?? c.tckn ?? undefined);
    set("receiverAddress", c.address ?? undefined);
    setReceiverSearch(c.name);
  };

  const fillAsSender = () => {
    if (!tenantProfile) return;
    set("senderName", tenantProfile.companyName ?? "");
    set("senderVkn", tenantProfile.vkn ?? undefined);
    set("senderAddress", tenantProfile.address ?? undefined);
    setSenderSearch("");
  };
  const fillAsReceiver = () => {
    if (!tenantProfile) return;
    set("receiverName", tenantProfile.companyName ?? "");
    set("receiverVknTckn", tenantProfile.vkn ?? undefined);
    set("receiverAddress", tenantProfile.address ?? undefined);
    setReceiverSearch("");
  };

  const selectProduct = (i: number, p: Product) => {
    setLine(i, "productId", p.id);
    setLine(i, "productName", p.name);
    setLine(i, "sku", p.sku);
    setLine(i, "unitCode", p.unitCode);
    setProductSearch((ps) => {
      const n = [...ps];
      n[i] = p.name;
      return n;
    });
  };

  const [submitError, setSubmitError] = useState("");

  const { mutate: create, isPending } = useMutation({
    mutationFn: () => waybillApi.create(form as CreateWaybillDto),
    onSuccess: (res) => {
      const id =
        (res.data as { id?: string })?.id ??
        (res as unknown as { id?: string })?.id;
      if (id) router.push(`/irsaliyeler/${id}`);
      else setSubmitError(t("waybill.waybillCreatedNoId"));
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err instanceof Error ? err.message : t("waybill.unexpectedError"));
      setSubmitError(msg);
    },
  });

  const canSubmit = !!(
    form.senderName?.trim() &&
    form.receiverName?.trim() &&
    form.shipDate
  );

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
            <ArrowLeft size={13} /> {t("common.back")}
          </Button>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <FileText size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {t("waybill.newWaybillPage")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("waybill.manualWaybillDesc")}
              </p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => create()}
          disabled={isPending || !canSubmit}
          isLoading={isPending}
          className="gap-2"
          title={!canSubmit ? t("waybill.requiredFields") : undefined}
        >
          <Save size={13} />
          {t("waybill.createWaybill")}
        </Button>
      </div>

      {/* Basic Info */}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <SectionTitle label={t("waybill.basicInfo")} />
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("waybill.typeRequired")}
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  set("type", v as CreateWaybillDto["type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SATIS">{t("waybill.salesWaybill")}</SelectItem>
                  <SelectItem value="ALIS">{t("waybill.purchaseWaybill")}</SelectItem>
                  <SelectItem value="TRANSFER">{t("waybill.transferWaybill")}</SelectItem>
                  <SelectItem value="IADE">{t("waybill.returnWaybill")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("waybill.shipDateRequired")}
              </Label>
              <DateInput
                value={form.shipDate ?? ""}
                onChange={(e) => set("shipDate", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("waybill.estimatedDelivery")}
              </Label>
              <DateInput
                value={form.deliveryDate ?? ""}
                onChange={(e) => set("deliveryDate", e.target.value)}
              />
            </div>
          </div>

          {form.type === "ALIS" && (
            <div className="mt-4 flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("waybill.linkPurchaseOrder")}
              </Label>
              <SearchDropdown<PurchaseOrder>
                placeholder={t("waybill.searchPurchaseOrder")}
                value={poSearch}
                onChange={setPoSearch}
                onSelect={selectPO}
                items={(approvedPOs ?? []).filter((po) =>
                  !poSearch ||
                  po.poNumber.toLowerCase().includes(poSearch.toLowerCase()) ||
                  (po.vendorName ?? "").toLowerCase().includes(poSearch.toLowerCase()),
                )}
                loading={false}
                getLabel={(po) => `${po.poNumber} – ${po.vendorName ?? ""}`}
                renderItem={(po) => (
                  <div>
                    <div className="text-xs font-semibold text-foreground">{po.poNumber}</div>
                    <div className="text-[11px] text-muted-foreground">{po.vendorName}</div>
                  </div>
                )}
                t={t}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sender / Receiver */}
      <div className="grid grid-cols-2 gap-3">

        {/* Sender */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-muted-foreground" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("waybill.sender")}
                </p>
              </div>
              {tenantProfile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2.5 text-primary border-primary/30 bg-primary/10 hover:bg-primary/20"
                  onClick={fillAsSender}
                >
                  {t("waybill.us")}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.selectFromPerson")}
                </Label>
                <SearchDropdown<Contact>
                  placeholder={t("waybill.searchCrm")}
                  value={senderSearch}
                  onChange={setSenderSearch}
                  onSelect={selectSender}
                  items={senderContacts ?? []}
                  loading={senderLoading}
                  getLabel={(c) => c.name}
                  renderItem={(c) => (
                    <div>
                      <div className="text-xs font-medium text-foreground">{c.name}</div>
                      {c.vkn && (
                        <div className="text-[11px] text-muted-foreground">
                          {t("waybill.vkn")}: {c.vkn}
                        </div>
                      )}
                    </div>
                  )}
                  t={t}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.nameRequired")}
                </Label>
                <Input
                  value={form.senderName ?? ""}
                  onChange={(e) => set("senderName", e.target.value)}
                  placeholder="Firma / Şahıs adı"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.vkn")}
                </Label>
                <Input
                  value={form.senderVkn ?? ""}
                  onChange={(e) => set("senderVkn", e.target.value)}
                  placeholder="1234567890"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.address")}
                </Label>
                <Textarea
                  className="min-h-[60px] resize-y"
                  value={form.senderAddress ?? ""}
                  onChange={(e) => set("senderAddress", e.target.value)}
                  placeholder={t("waybill.notesPlaceholder")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receiver */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-muted-foreground" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("waybill.receiver")}
                </p>
              </div>
              {tenantProfile && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2.5 text-primary border-primary/30 bg-primary/10 hover:bg-primary/20"
                  onClick={fillAsReceiver}
                >
                  {t("waybill.us")}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.selectFromPerson")}
                </Label>
                <SearchDropdown<Contact>
                  placeholder={t("waybill.searchCrm")}
                  value={receiverSearch}
                  onChange={setReceiverSearch}
                  onSelect={selectReceiver}
                  items={receiverContacts ?? []}
                  loading={receiverLoading}
                  getLabel={(c) => c.name}
                  renderItem={(c) => (
                    <div>
                      <div className="text-xs font-medium text-foreground">{c.name}</div>
                      {(c.vkn || c.tckn) && (
                        <div className="text-[11px] text-muted-foreground">
                          {c.vkn
                            ? `${t("waybill.vkn")}: ${c.vkn}`
                            : `${t("waybill.tckn")}: ${c.tckn}`}
                        </div>
                      )}
                    </div>
                  )}
                  t={t}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.nameRequired")}
                </Label>
                <Input
                  value={form.receiverName ?? ""}
                  onChange={(e) => set("receiverName", e.target.value)}
                  placeholder="Firma / Şahıs adı"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.vknTckn")}
                </Label>
                <Input
                  value={form.receiverVknTckn ?? ""}
                  onChange={(e) => set("receiverVknTckn", e.target.value)}
                  placeholder="VKN (10 hane) veya TCKN (11 hane)"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.address")}
                </Label>
                <Textarea
                  className="min-h-[60px] resize-y"
                  value={form.receiverAddress ?? ""}
                  onChange={(e) => set("receiverAddress", e.target.value)}
                  placeholder={t("waybill.notesPlaceholder")}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transport */}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("waybill.transportInfo")}
            </p>
            <div className="flex gap-1.5">
              {(
                [
                  { v: "OWN",   label: t("waybill.ownFleet"),     icon: <Truck   size={12} /> },
                  { v: "CARGO", label: t("waybill.cargoCompany"), icon: <Package size={12} /> },
                ] as const
              ).map(({ v, label, icon }) => {
                const active = shipMode === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setShipMode(v)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors",
                      active
                        ? "bg-primary/10 border-primary/30 text-primary font-semibold"
                        : "bg-muted border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {icon} {label}
                  </button>
                );
              })}
            </div>
          </div>

          {shipMode === "OWN" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.vehicle")}
                </Label>
                <Select
                  value={form.vehiclePlate ?? ""}
                  onValueChange={(v) => set("vehiclePlate", v || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("waybill.selectVehicle")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(vehicles ?? []).filter((v) => v.plate).map((v) => (
                      <SelectItem key={v.id} value={v.plate}>
                        {v.plate} · {v.brand} {v.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.vehiclePlate ?? ""}
                  onChange={(e) => set("vehiclePlate", e.target.value || undefined)}
                  placeholder={t("waybill.orEnterPlate")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.driver")}
                </Label>
                <Select
                  value={form.driverName ?? ""}
                  onValueChange={(v) => set("driverName", v || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("waybill.selectDriver")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(drivers ?? []).map((d) => (
                      <SelectItem key={d.id} value={`${d.firstName} ${d.lastName}`}>
                        {d.firstName} {d.lastName}
                        {d.licenseClass ? ` · ${d.licenseClass}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.driverName ?? ""}
                  onChange={(e) => set("driverName", e.target.value || undefined)}
                  placeholder={t("waybill.orEnterDriver")}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.carrierName")}
                </Label>
                <Input
                  value={form.carrierName ?? ""}
                  onChange={(e) => set("carrierName", e.target.value)}
                  placeholder="Aras Kargo, Yurtiçi, MNG…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("waybill.trackingNumber")}
                </Label>
                <Input
                  value={form.trackingNumber ?? ""}
                  onChange={(e) => set("trackingNumber", e.target.value)}
                  placeholder="1234567890"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card className="shadow-sm overflow-visible">
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("waybill.items")} ({form.lines?.length ?? 0})
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={addLine}
            className="h-8 px-3 gap-1.5 text-xs"
          >
            <Plus size={12} /> {t("waybill.addItem")}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">{t("waybill.productRequired")}</TableHead>
              <TableHead className="text-[11px] w-28">SKU</TableHead>
              <TableHead className="text-[11px] w-24">{t("waybill.quantityRequired")}</TableHead>
              <TableHead className="text-[11px] w-28">{t("waybill.unit")}</TableHead>
              <TableHead className="text-[11px] w-40">{t("stock.warehouse")}</TableHead>
              <TableHead className="text-[11px] w-32">Lot No</TableHead>
              <TableHead className="text-[11px] w-32">Seri No</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(form.lines ?? []).map((line, i) => (
              <TableRow key={i}>
                <TableCell className="min-w-[200px]">
                  <SearchDropdown<Product>
                    placeholder={t("waybill.searchProduct")}
                    value={productSearch[i] ?? ""}
                    onChange={(val) => {
                      setProductSearch((ps) => {
                        const n = [...ps];
                        n[i] = val;
                        return n;
                      });
                      setActiveProductLine(i);
                      if (!val) {
                        setLine(i, "productId", undefined);
                        setLine(i, "productName", "");
                      }
                    }}
                    onSelect={(p) => selectProduct(i, p)}
                    items={
                      activeProductLine === i ? (activeProducts ?? []) : []
                    }
                    loading={activeProductLine === i && productsLoading}
                    getLabel={(p) => p.name}
                    renderItem={(p) => (
                      <div>
                        <div className="text-xs font-medium text-foreground">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.sku} · {p.unitCode}
                        </div>
                      </div>
                    )}
                    t={t}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={line.sku ?? ""}
                    onChange={(e) => setLine(i, "sku", e.target.value)}
                    placeholder="SKU"
                    className="h-8 text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0.0001}
                    step="any"
                    value={Number(line.quantity) || ""}
                    onChange={(e) =>
                      setLine(i, "quantity", Number(e.target.value))
                    }
                    className="h-8 text-xs"
                  />
                </TableCell>
                <TableCell>
                  {(() => {
                    const STANDARD_UNITS = ["ADET", "KG", "TON", "LT", "M", "M2", "M3", "KUTU", "PAKET", "TAKIM"];
                    const cur = line.unitCode && !STANDARD_UNITS.includes(line.unitCode) ? line.unitCode : null;
                    return (
                      <Select
                        value={line.unitCode ?? "ADET"}
                        onValueChange={(v) => setLine(i, "unitCode", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {cur && <SelectItem key={cur} value={cur}>{cur}</SelectItem>}
                          {STANDARD_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <Select
                    value={line.warehouseId ?? ""}
                    onValueChange={(v) =>
                      setLine(i, "warehouseId", v || undefined)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={t("waybill.selectWarehouse")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(warehouses ?? []).map((wh) => (
                        <SelectItem key={wh.id} value={wh.id}>
                          {wh.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    value={line.lotNumber ?? ""}
                    onChange={(e) => setLine(i, "lotNumber", e.target.value || undefined)}
                    placeholder="LOT-001"
                    className="h-8 text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={line.serialNumber ?? ""}
                    onChange={(e) => setLine(i, "serialNumber", e.target.value || undefined)}
                    placeholder="SN-001"
                    className="h-8 text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeLine(i)}
                    disabled={(form.lines?.length ?? 0) <= 1}
                  >
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Submit Error */}
      {submitError && (
        <div className="flex items-center gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <X size={14} className="shrink-0" />
          <span className="flex-1">{submitError}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setSubmitError("")}
          >
            <X size={12} />
          </Button>
        </div>
      )}

      {/* Notes */}
      <Card className="shadow-sm">
        <CardContent className="p-5">
          <SectionTitle label={t("waybill.notes")} />
          <Textarea
            className="min-h-[72px] resize-y"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder={t("waybill.notesPlaceholder")}
          />
        </CardContent>
      </Card>

    </div>
  );
}

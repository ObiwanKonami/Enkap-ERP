"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { stockApi } from "@/services/stock";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import {
  Package,
  ArrowLeft,
  Save,
  AlertCircle,
  Loader2,
  Hash,
  Tag,
  Barcode,
  Layers,
  DollarSign,
  TrendingDown,
  Plus,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Birim Kodları (UN/CEFACT — GİB UBL-TR) ───────────────────────────────────

function getUnitCodes(tt: (k: string) => string) {
  return [
    { value: "C62", label: `${tt("stock.adet")} (C62)`   },
    { value: "KGM", label: `${tt("stock.kg")} (KGM)`     },
    { value: "GRM", label: `${tt("stock.gr")} (GRM)`     },
    { value: "LTR", label: `${tt("stock.litre")} (LTR)`  },
    { value: "MTR", label: `${tt("stock.metre")} (MTR)`  },
    { value: "MTK", label: `${tt("stock.m2")} (MTK)`     },
    { value: "MTQ", label: `Metreküp (MTQ)`               },
    { value: "BX",  label: `${tt("stock.kutu")} (BX)`    },
    { value: "SET", label: `${tt("stock.takim")} (SET)`   },
    { value: "PR",  label: `Çift (PR)`                    },
    { value: "HUR", label: `Saat (HUR)`                   },
    { value: "DAY", label: `Gün (DAY)`                    },
    { value: "MON", label: `Ay (MON)`                     },
  ];
}

const KDV_OPTIONS = [
  { value: 0,  label: "%0 KDV"  },
  { value: 1,  label: "%1 KDV"  },
  { value: 10, label: "%10 KDV" },
  { value: 20, label: "%20 KDV" },
];

// ─── Alan Bileşeni ─────────────────────────────────────────────────────────────

function Field({
  label, icon, required, hint, children, error: fieldErr,
}: {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{icon}</span>
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {fieldErr ? (
        <p className="text-[11px] text-red-400">{fieldErr}</p>
      ) : hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// ─── Kategori Seçici ──────────────────────────────────────────────────────────

function CategorySelect({
  value, onChange, t,
}: {
  value: string;
  onChange: (v: string) => void;
  t: (key: string) => string;
}) {
  const [newCatName, setNewCatName] = useState("");
  const [creating,   setCreating  ] = useState(false);

  const { data: cats, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn:  () => stockApi.products.categories(),
    select:   (r) => r.data,
  });

  const { mutate: createCat, isPending } = useMutation({
    mutationFn: () => stockApi.products.createCategory({ name: newCatName.trim() }),
    onSuccess: (res) => {
      void refetch();
      onChange(res.data.id);
      setNewCatName("");
      setCreating(false);
    },
  });

  const NONE = "__none__";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select
          value={value || NONE}
          onValueChange={(v) => onChange(v === NONE ? "" : v)}
        >
          <SelectTrigger className="flex-1 h-9 bg-muted/40">
            <SelectValue placeholder={t("stock.kategorisiz")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("stock.kategorisiz")}</SelectItem>
            {cats?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={creating ? "secondary" : "outline"}
          size="icon"
          className={cn("size-9 shrink-0", creating && "text-sky-400 border-sky-500/30 bg-sky-500/10")}
          title={t("stock.yeniKategori")}
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? <X size={13} /> : <Plus size={13} />}
        </Button>
      </div>

      {creating && (
        <div className="flex gap-2">
          <Input
            className="flex-1 h-9 bg-muted/40"
            autoFocus
            placeholder={t("stock.yeniKategoriAdi")}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newCatName.trim()) createCat(); }}
          />
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5"
            disabled={!newCatName.trim() || isPending}
            onClick={() => createCat()}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : null}
            {t("stock.ekle")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────────

export default function YeniUrunPage() {
  const router = useRouter();
  const { t }  = useI18n();

  const [sku,          setSku         ] = useState("");
  const [name,         setName        ] = useState("");
  const [barcode,      setBarcode     ] = useState("");
  const [categoryId,   setCategoryId  ] = useState("");
  const [unitCode,     setUnitCode    ] = useState("C62");
  const [kdvRate,      setKdvRate     ] = useState<number>(20);
  const [costMethod,   setCostMethod  ] = useState<"FIFO" | "AVG">("FIFO");
  const [listPriceTl,  setListPriceTl ] = useState("");
  const [unitCostTl,   setUnitCostTl  ] = useState("");
  const [reorderPoint, setReorderPoint] = useState("0");
  const [error,        setError       ] = useState("");

  const autoSku = (n: string) =>
    n.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "").slice(0, 20);

  const canSubmit = sku.trim().length >= 2 && name.trim().length >= 2;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      stockApi.products.create({
        sku:              sku.trim().toUpperCase(),
        name:             name.trim(),
        barcode:          barcode || undefined,
        categoryId:       categoryId || undefined,
        unitCode: unitCode as "C62"|"KGM"|"GRM"|"LTR"|"MTR"|"MTK"|"MTQ"|"BX"|"SET"|"PR"|"HUR"|"DAY"|"MON",
        kdvRate,
        costMethod,
        listPriceKurus:   listPriceTl  ? Math.round(parseFloat(listPriceTl)  * 100) : 0,
        avgUnitCostKurus: unitCostTl   ? Math.round(parseFloat(unitCostTl)   * 100) : 0,
        reorderPoint:     parseInt(reorderPoint) || 0,
        isActive:         true,
      }),
    onSuccess: (res) => router.push(`/stok/${res.data.id}`),
    onError:   ()    => setError(t("stock.createFailed")),
  });

  // Önizleme hesaplamaları
  const previewPrice  = listPriceTl ? formatCurrency(parseFloat(listPriceTl)) : "—";
  const previewCost   = unitCostTl  ? formatCurrency(parseFloat(unitCostTl))  : "—";
  const previewMargin =
    listPriceTl && unitCostTl && parseFloat(unitCostTl) > 0
      ? `%${(((parseFloat(listPriceTl) - parseFloat(unitCostTl)) / parseFloat(listPriceTl)) * 100).toFixed(1)}`
      : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => router.back()}>
            <ArrowLeft size={13} /> {t("common.back")}
          </Button>
          <div className="flex items-center gap-2">
            <Package size={20} className="text-sky-400" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("stock.newProduct")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">{t("stock.addTocatalog")}</p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 gap-2 shadow-sm"
          onClick={() => mutate()}
          disabled={isPending || !canSubmit}
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {isPending ? t("common.loading") : t("stock.createProduct")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">
        {/* Sol — Form */}
        <div className="flex flex-col gap-5">
          {/* Ürün Kimliği */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.productIdentity")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label={t("stock.urunAdi")} icon={<Tag size={11} />} required>
                <Input
                  className="h-9 bg-muted/40"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!sku || sku === autoSku(name)) setSku(autoSku(e.target.value));
                  }}
                  placeholder={t("stock.ornekA4")}
                  autoFocus
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t("stock.skuStokKodu")} icon={<Hash size={11} />} required hint={t("stock.buyukHarfRakamTire")}>
                  <Input
                    className="h-9 bg-muted/40 uppercase"
                    value={sku}
                    onChange={(e) =>
                      setSku(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 30))
                    }
                    placeholder={t("stock.ornekA4Sku")}
                  />
                </Field>
                <Field label={t("stock.barkodEanGtin")} icon={<Barcode size={11} />} hint={t("stock.istegeBagli")}>
                  <Input
                    className="h-9 bg-muted/40 "
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))}
                    placeholder={t("stock.ornekBarkod")}
                  />
                </Field>
              </div>

              <Field label={t("stock.category")} icon={<Layers size={11} />} hint={t("stock.mevcutVeyaYeni")}>
                <CategorySelect value={categoryId} onChange={setCategoryId} t={t} />
              </Field>
            </CardContent>
          </Card>

          {/* Fiyat & Maliyet */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.priceAndCost")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("stock.unit")} icon={<Tag size={11} />} required>
                  <Select value={unitCode} onValueChange={setUnitCode}>
                    <SelectTrigger className="h-9 bg-muted/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getUnitCodes(t).map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          {u.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="KDV Oranı" icon={<Tag size={11} />} required>
                  <Select
                    value={String(kdvRate)}
                    onValueChange={(v) => setKdvRate(parseInt(v))}
                  >
                    <SelectTrigger className="h-9 bg-muted/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KDV_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <Field label={t("stock.maliyetYontemi")} icon={<TrendingDown size={11} />}>
                  <div className="flex gap-2">
                    {(["FIFO", "AVG"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCostMethod(m)}
                        className={cn(
                          "flex-1 py-2 rounded-lg border text-xs font-medium transition-all",
                          costMethod === m
                            ? "bg-sky-500/10 border-sky-500/30 text-sky-400 font-semibold"
                            : "bg-transparent border-border text-muted-foreground hover:bg-muted/40"
                        )}
                      >
                        <div>{m === "FIFO" ? t("stock.fifoIlkGirenIlkCikar") : t("stock.agirlikliOrtalama")}</div>
                        <div className={cn("text-[10px] mt-0.5", costMethod === m ? "text-sky-400" : "text-muted-foreground/50")}>
                          {m}
                        </div>
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t("stock.listPrice")} icon={<DollarSign size={11} />} hint={t("stock.kdvHaric")}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₺</span>
                    <Input
                      className="h-9 bg-muted/40 pl-7 "
                      type="number" min={0} step={0.01}
                      value={listPriceTl}
                      onChange={(e) => setListPriceTl(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </Field>

                <Field label={t("stock.birimMaliyet")} icon={<DollarSign size={11} />} hint={t("stock.alisUretim")}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₺</span>
                    <Input
                      className="h-9 bg-muted/40 pl-7 "
                      type="number" min={0} step={0.01}
                      value={unitCostTl}
                      onChange={(e) => setUnitCostTl(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t("stock.yenidenSiparisNoktasi")} icon={<TrendingDown size={11} />} hint={t("stock.buSeviyeninAltinaDusunce")}>
                  <Input
                    className="h-9 bg-muted/40 "
                    type="number" min={0} step={1}
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    placeholder="10"
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Hata */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle size={14} />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Sağ — Önizleme */}
        <div className="sticky top-20">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("common.preview")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Ürün Kartı Önizleme */}
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="size-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-3">
                  <Package size={16} className="text-sky-400" />
                </div>
                <p className={cn("text-sm font-semibold text-foreground mb-1", !name && "text-muted-foreground font-normal")}>
                  {name || t("stock.urunAdiPlaceholder")}
                </p>
                <p className="text-xs text-sky-400 mb-3">{sku || t("stock.yoktur")}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px] uppercase">{unitCode}</Badge>
                  <Badge variant="secondary" className="text-[10px] text-sky-400 bg-sky-500/10">{costMethod}</Badge>
                </div>
              </div>

              <Separator />

              {/* Metrikler */}
              <div className="flex flex-col gap-2">
                {[
                  { label: t("stock.listPrice"),      value: previewPrice  },
                  { label: t("stock.birimMaliyet"),   value: previewCost   },
                  { label: t("stock.margin"),         value: previewMargin },
                  { label: t("stock.siparisNoktasi"), value: reorderPoint ? `${reorderPoint} ${unitCode}` : t("stock.yoktur") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="tabular-nums font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

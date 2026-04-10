"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { stockApi } from "@/services/stock";
import {
  Building2,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  MapPin,
} from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
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

// ─── Türkiye İlleri ───────────────────────────────────────────────────────────

const NONE_CITY = "__none__";

const TURKISH_CITIES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Aksaray","Amasya","Ankara","Antalya",
  "Ardahan","Artvin","Aydın","Balıkesir","Bartın","Batman","Bayburt","Bilecik",
  "Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum",
  "Denizli","Diyarbakır","Düzce","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir",
  "Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Iğdır","Isparta","İstanbul",
  "İzmir","Kahramanmaraş","Karabük","Karaman","Kars","Kastamonu","Kayseri","Kilis",
  "Kırıkkale","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya","Manisa",
  "Mardin","Mersin","Muğla","Muş","Nevşehir","Niğde","Ordu","Osmaniye","Rize",
  "Sakarya","Samsun","Şanlıurfa","Siirt","Sinop","Şırnak","Sivas","Tekirdağ",
  "Tokat","Trabzon","Tunceli","Uşak","Van","Yalova","Yozgat","Zonguldak",
];

// ─── Kod Türetme ──────────────────────────────────────────────────────────────

function derivedCode(n: string) {
  return n
    .toUpperCase()
    .replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ş/g, "S")
    .replace(/İ/g, "I").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12);
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────────

export default function YeniDepoPage() {
  const router = useRouter();
  const qc     = useQueryClient();
  const { t }  = useI18n();

  const [name,      setName     ] = useState("");
  const [code,      setCode     ] = useState("");
  const [city,      setCity     ] = useState("");
  const [isActive,  setIsActive ] = useState(true);
  const [formError, setFormError] = useState("");

  function handleNameChange(v: string) {
    setName(v);
    if (!code || code === derivedCode(name)) setCode(derivedCode(v));
  }

  const canSubmit = name.trim().length >= 2 && code.trim().length >= 2;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      stockApi.warehouses.create({
        name:     name.trim(),
        code:     code.trim().toUpperCase(),
        city:     city || undefined,
        isActive,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      router.push(`/depo/${res.data.id}`);
    },
    onError: () => setFormError(t("stock.warehouses.createFailed")),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Başlık */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => router.back()}>
            <ArrowLeft size={13} /> {t("common.back")}
          </Button>
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-sky-400" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("stock.warehouses.newWarehouse")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("stock.warehouses.defineWarehouse")}
              </p>
            </div>
          </div>
        </div>
        <Button
          className="h-9 gap-2 shadow-sm"
          onClick={() => mutate()}
          disabled={isPending || !canSubmit}
        >
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {isPending ? t("stock.warehouses.saving") : t("stock.warehouses.createWarehouse")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
        {/* Sol — Form */}
        <div className="flex flex-col gap-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.warehouses.warehouseInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Depo Adı */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("stock.warehouses.warehouseName")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  className="h-9 bg-muted/40"
                  placeholder={t("stock.onizlemeExample")}
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Kod */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("stock.warehouses.warehouseCode")} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className="h-9 bg-muted/40 uppercase"
                    placeholder="IST-001"
                    maxLength={12}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">Max 12 karakter</p>
                </div>

                {/* Şehir */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("stock.warehouses.city")}{" "}
                    <span className="text-[10px] normal-case font-normal text-muted-foreground/60">
                      {t("stock.warehouses.cityOptional")}
                    </span>
                  </Label>
                  <Select
                    value={city || NONE_CITY}
                    onValueChange={(v) => setCity(v === NONE_CITY ? "" : v)}
                  >
                    <SelectTrigger className="h-9 bg-muted/40">
                      <SelectValue placeholder={t("common.select")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_CITY}>{t("common.select")}</SelectItem>
                      {TURKISH_CITIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Aktif Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("stock.warehouses.activeStatus")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isActive ? t("stock.warehouses.activeHint") : t("stock.warehouses.inactiveHint")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive((v) => !v)}
                  className={cn(
                    "relative w-10 h-6 rounded-full transition-colors shrink-0",
                    isActive ? "bg-sky-500" : "bg-muted-foreground/30"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
                      isActive ? "left-5" : "left-1"
                    )}
                  />
                </button>
              </div>

              {/* Hata */}
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle size={13} />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sağ — Önizleme */}
        <div className="sticky top-20">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("stock.onizleme")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
                <div className="size-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                  <Building2 size={16} className="text-sky-400" />
                </div>

                <div>
                  <p className={cn("text-sm font-semibold", !name && "text-muted-foreground font-normal")}>
                    {name || "Depo adı..."}
                  </p>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {code && (
                      <span className="text-[11px] text-sky-400 tabular-nums">{code}</span>
                    )}
                    {city && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin size={10} /> {city}
                      </span>
                    )}
                  </div>
                </div>

                <Separator />

                <Badge
                  variant="secondary"
                  className={cn(
                    "w-fit text-[10px] font-semibold uppercase tracking-wider",
                    isActive
                      ? "bg-emerald-500/10 text-emerald-500 border-transparent"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isActive ? t("stock.warehouses.active") : t("stock.warehouses.passive")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

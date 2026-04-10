"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { stockApi } from "@/services/stock";
import Link from "next/link";
import { toast } from "sonner";
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
  ChevronDown,
  DollarSign,
  TrendingDown,
  Plus,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

// ─── Birim Kodları ────────────────────────────────────────────────────────────

function getUnitCodes(tt: (k: string) => string) {
  return [
    { value: "ADET", label: tt("stock.adet") },
    { value: "KG", label: tt("stock.kg") },
    { value: "GR", label: tt("stock.gr") },
    { value: "LITRE", label: tt("stock.litre") },
    { value: "ML", label: tt("stock.ml") },
    { value: "METRE", label: tt("stock.metre") },
    { value: "CM", label: tt("stock.cm") },
    { value: "M2", label: tt("stock.m2") },
    { value: "KUTU", label: tt("stock.kutu") },
    { value: "PAKET", label: tt("stock.paket") },
    { value: "TAKIM", label: tt("stock.takim") },
    { value: "TON", label: tt("stock.ton") },
  ];
}

// ─── Yardımcı bileşenler ──────────────────────────────────────────────────────

function Field({
  label,
  icon,
  required,
  hint,
  children,
  error: fieldErr,
}: {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          color: "var(--text-3)",
          marginBottom: 6,
        }}
      >
        <span style={{ color: "#475569" }}>{icon}</span>
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 1 }}>*</span>}
      </label>
      {children}
      {fieldErr ? (
        <div style={{ fontSize: 11, color: "#F87171", marginTop: 3 }}>
          {fieldErr}
        </div>
      ) : hint ? (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  t: (key: string) => string;
}) {
  const [newCatName, setNewCatName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: cats, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: () => stockApi.products.categories(),
    select: (r) => r.data,
  });

  const { mutate: createCat, isPending } = useMutation({
    mutationFn: () =>
      stockApi.products.createCategory({ name: newCatName.trim() }),
    onSuccess: (res) => {
      void refetch();
      onChange(res.data.id);
      setNewCatName("");
      setCreating(false);
    },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <select
            className="input"
            style={{ width: "100%", appearance: "none", paddingRight: 28 }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{t("stock.kategorisiz")}</option>
            {cats?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#475569",
              pointerEvents: "none",
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          title={t("stock.yeniKategori")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            flexShrink: 0,
            background: creating
              ? "rgba(14,165,233,0.12)"
              : "rgba(30,58,95,0.2)",
            border: `1px solid ${creating ? "rgba(14,165,233,0.3)" : "rgba(30,58,95,0.5)"}`,
            color: creating ? "#38BDF8" : "#64748B",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {creating ? <X size={13} /> : <Plus size={13} />}
        </button>
      </div>
      {creating && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            autoFocus
            placeholder={t("stock.yeniKategoriAdi")}
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCatName.trim()) createCat();
            }}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!newCatName.trim() || isPending}
            onClick={() => createCat()}
            style={{ padding: "0 14px", fontSize: 12 }}
          >
            {isPending ? "..." : t("stock.ekle")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function UrunDuzenlePage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const { t } = useI18n();
  const { id } = params;

  // Mevcut ürün verisi
  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => stockApi.products.get(id).then((r) => r.data),
  });

  // Form state
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitCode, setUnitCode] = useState("ADET");
  const [costMethod, setCostMethod] = useState<"FIFO" | "AVG">("FIFO");
  const [listPriceTl, setListPriceTl] = useState("");
  const [unitCostTl, setUnitCostTl] = useState("");
  const [reorderPoint, setReorderPoint] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // API cevabından form alanlarını tek kez doldur
  if (product && !initialized) {
    setSku(product.sku);
    setName(product.name);
    setBarcode(product.barcode ?? "");
    setCategoryId(product.categoryId ?? "");
    setUnitCode(product.unitCode);
    setCostMethod(product.costMethod);
    setListPriceTl(
      product.listPriceKurus ? (product.listPriceKurus / 100).toFixed(2) : "",
    );
    setUnitCostTl(
      product.avgUnitCostKurus
        ? (product.avgUnitCostKurus / 100).toFixed(2)
        : "",
    );
    setReorderPoint(String(product.reorderPoint ?? 0));
    setIsActive(product.isActive ?? true);
    setInitialized(true);
  }

  const canSubmit = sku.trim().length >= 2 && name.trim().length >= 2;

  // Canlı kar marjı
  const priceTl = parseFloat(listPriceTl) || 0;
  const costTl = parseFloat(unitCostTl) || 0;
  const margin =
    priceTl > 0 && costTl > 0
      ? (((priceTl - costTl) / priceTl) * 100).toFixed(1)
      : null;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      stockApi.products.update(id, {
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        barcode: barcode || undefined,
        categoryId: categoryId || undefined,
        unitCode,
        costMethod,
        listPriceKurus: listPriceTl
          ? Math.round(parseFloat(listPriceTl) * 100)
          : 0,
        avgUnitCostKurus: unitCostTl
          ? Math.round(parseFloat(unitCostTl) * 100)
          : 0,
        reorderPoint: parseInt(reorderPoint) || 0,
        isActive,
      }),
    onSuccess: () => {
      toast.success(t("stock.urunBasariylaGuncellendi"));
      router.push(`/stok/${id}`);
    },
    onError: () => {
      setFormError(t("stock.guncellemeBasarisiz"));
      toast.error(t("stock.urunBasariylaGuncellendi"));
    },
  });

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          gap: 10,
          color: "#475569",
          fontSize: 14,
        }}
      >
        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        {t("stock.yukleniyor")}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { width: "100%" };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 4px" }}>
      {/* Başlık */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Link
          href={`/stok/${id}`}
          style={{
            color: "#475569",
            display: "flex",
            padding: 6,
            borderRadius: 6,
            textDecoration: "none",
            transition: "color 0.1s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "#94A3B8";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "#475569";
          }}
        >
          <ArrowLeft size={16} />
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(14,165,233,0.12)",
              border: "1px solid rgba(14,165,233,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={15} style={{ color: "#0EA5E9" }} />
          </div>
          <div>
            <h1
              style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}
            >
              {t("stock.urunuDuzenle")}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>
              {product?.name ?? t("stock.stokUrunBilgileriniGuncelle")}
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 260px",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Sol — form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Kimlik Bilgileri */}
          <div className="card" style={{ padding: "20px 22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
              }}
            >
              <Package size={14} style={{ color: "#64748B" }} />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--text-2)",
                }}
              >
                {t("stock.urunKimligi")}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Field
                label={t("stock.urunAdi")}
                icon={<Tag size={11} />}
                required
              >
                <input
                  className="input"
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("stock.ornekA4")}
                  autoFocus
                />
              </Field>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <Field
                  label={t("stock.skuStokKodu")}
                  icon={<Hash size={11} />}
                  required
                  hint={t("stock.benzersizOlmali")}
                >
                  <input
                    className="input num"
                    style={inputStyle}
                    value={sku}
                    onChange={(e) =>
                      setSku(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9-]/g, "")
                          .slice(0, 30),
                      )
                    }
                    placeholder={t("stock.ornekA4Sku")}
                  />
                </Field>
                <Field
                  label={t("stock.barkodEanGtin")}
                  icon={<Barcode size={11} />}
                  hint={t("stock.istegeBagli")}
                >
                  <input
                    className="input num"
                    style={inputStyle}
                    value={barcode}
                    onChange={(e) =>
                      setBarcode(e.target.value.replace(/\D/g, "").slice(0, 14))
                    }
                    placeholder={t("stock.ornekBarkod")}
                  />
                </Field>
              </div>

              <Field
                label={t("stock.category")}
                icon={<Layers size={11} />}
                hint={t("stock.mevcutVeyaYeni")}
              >
                <CategorySelect
                  value={categoryId}
                  onChange={setCategoryId}
                  t={t}
                />
              </Field>
            </div>
          </div>

          {/* Ölçü & Maliyet */}
          <div className="card" style={{ padding: "20px 22px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 18,
              }}
            >
              <DollarSign size={14} style={{ color: "#64748B" }} />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 13,
                  color: "var(--text-2)",
                }}
              >
                {t("stock.olcuFiyatMaliyet")}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                {/* Birim */}
                <Field label={t("stock.unit")} icon={<Layers size={11} />}>
                  <div style={{ position: "relative" }}>
                    <select
                      className="input"
                      style={{
                        width: "100%",
                        appearance: "none",
                        paddingRight: 28,
                      }}
                      value={unitCode}
                      onChange={(e) => setUnitCode(e.target.value)}
                    >
                      {getUnitCodes(t).map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#475569",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </Field>

                {/* Yeniden Sipariş Noktası */}
                <Field
                  label={t("stock.yenidenSiparisNoktasi")}
                  icon={<TrendingDown size={11} />}
                  hint={t("stock.kritikEsk")}
                >
                  <input
                    className="input num"
                    style={inputStyle}
                    type="number"
                    min={0}
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </div>

              {/* Maliyet Yöntemi */}
              <Field
                label={t("stock.maliyetYontemi")}
                icon={<Hash size={11} />}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  {(["FIFO", "AVG"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setCostMethod(m)}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: costMethod === m ? 600 : 400,
                        color: costMethod === m ? "#38BDF8" : "#64748B",
                        background:
                          costMethod === m
                            ? "rgba(14,165,233,0.1)"
                            : "transparent",
                        border: `1px solid ${costMethod === m ? "rgba(14,165,233,0.3)" : "rgba(30,58,95,0.5)"}`,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {m === "FIFO"
                        ? t("stock.fifoIlkGirenIlkCikar")
                        : t("stock.agirlikliOrtalama")}
                    </button>
                  ))}
                </div>
              </Field>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                {/* Liste Fiyatı */}
                <Field
                  label={t("stock.listPrice")}
                  icon={<DollarSign size={11} />}
                >
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 9,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#475569",
                        fontSize: 13,
                      }}
                    >
                      ₺
                    </span>
                    <input
                      className="input num"
                      style={{ ...inputStyle, paddingLeft: 22 }}
                      type="number"
                      min={0}
                      step={0.01}
                      value={listPriceTl}
                      onChange={(e) => setListPriceTl(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </Field>
                {/* Birim Maliyet */}
                <Field
                  label={t("stock.birimMaliyet")}
                  icon={<DollarSign size={11} />}
                >
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 9,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "#475569",
                        fontSize: 13,
                      }}
                    >
                      ₺
                    </span>
                    <input
                      className="input num"
                      style={{ ...inputStyle, paddingLeft: 22 }}
                      type="number"
                      min={0}
                      step={0.01}
                      value={unitCostTl}
                      onChange={(e) => setUnitCostTl(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </Field>
              </div>
            </div>
          </div>

          {/* Aktif Durum */}
          <div className="card" style={{ padding: "16px 20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-1)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isActive ? (
                    <ToggleRight size={16} style={{ color: "#10B981" }} />
                  ) : (
                    <ToggleLeft size={16} style={{ color: "#475569" }} />
                  )}
                  {t("stock.aktifDurum")}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}
                >
                  {isActive ? t("stock.urunAktif") : t("stock.urunPasif")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: isActive ? "#10B981" : "rgba(30,58,95,0.6)",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: isActive ? 22 : 4,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          </div>

          {/* Hata */}
          {formError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 7,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#FCA5A5",
                fontSize: 13,
              }}
            >
              <AlertCircle size={14} />
              {formError}
            </div>
          )}

          {/* Aksiyon Butonları */}
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "flex-end",
              paddingBottom: 24,
            }}
          >
            <Link
              href={`/stok/${id}`}
              style={{
                padding: "9px 20px",
                borderRadius: 6,
                fontSize: 13,
                background: "transparent",
                border: "1px solid rgba(30,58,95,0.6)",
                color: "#64748B",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              {t("common.cancel")}
            </Link>
            <button
              className="btn-primary"
              onClick={() => {
                if (canSubmit && !isPending) mutate();
              }}
              disabled={isPending || !canSubmit}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minWidth: 180,
                opacity: canSubmit && !isPending ? 1 : 0.45,
              }}
            >
              {isPending ? (
                <>
                  <Loader2
                    size={13}
                    style={{ animation: "spin 1s linear infinite" }}
                  />{" "}
                  {t("stock.kaydediliyor")}
                </>
              ) : (
                <>
                  <Save size={14} /> {t("stock.degisiklikleriKaydet")}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sağ — canlı önizleme */}
        <div
          style={{
            position: "sticky",
            top: 80,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Ürün Kartı Önizleme */}
          <div className="card" style={{ padding: "16px 18px" }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 12,
              }}
            >
              {t("stock.onizleme")}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: "rgba(14,165,233,0.1)",
                  border: "1px solid rgba(14,165,233,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Package size={16} style={{ color: "#38BDF8" }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--text-1)",
                    wordBreak: "break-word",
                  }}
                >
                  {name || (
                    <span
                      style={{ color: "var(--text-3)", fontStyle: "italic" }}
                    >
                      {t("stock.urunAdi")}
                    </span>
                  )}
                </div>
                <div
                  className="num"
                  style={{ fontSize: 11, color: "#475569", marginTop: 2 }}
                >
                  {sku || t("stock.yoktur")}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {listPriceTl && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {t("stock.listPrice")}
                  </span>
                  <span
                    className="num"
                    style={{ fontSize: 13, fontWeight: 700, color: "#38BDF8" }}
                  >
                    ₺
                    {parseFloat(listPriceTl).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {unitCostTl && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {t("stock.birimMaliyet")}
                  </span>
                  <span
                    className="num"
                    style={{ fontSize: 12, color: "#94A3B8" }}
                  >
                    ₺
                    {parseFloat(unitCostTl).toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {margin !== null && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: 6,
                    marginTop: 4,
                    background:
                      parseFloat(margin) >= 20
                        ? "rgba(16,185,129,0.08)"
                        : "rgba(245,158,11,0.08)",
                    border: `1px solid ${parseFloat(margin) >= 20 ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}`,
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {t("stock.margin")}
                  </span>
                  <span
                    className="num"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: parseFloat(margin) >= 20 ? "#10B981" : "#F59E0B",
                    }}
                  >
                    %{margin}
                  </span>
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: "1px solid rgba(30,58,95,0.3)",
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "#475569",
                  background: "rgba(30,58,95,0.3)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {unitCode}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "#475569",
                  background: "rgba(30,58,95,0.3)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                {costMethod}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  color: isActive ? "#10B981" : "#94A3B8",
                  background: isActive
                    ? "rgba(16,185,129,0.1)"
                    : "rgba(30,58,95,0.3)",
                }}
              >
                {isActive
                  ? t("stock.urunAktifDurum")
                  : t("stock.urunPasifDurum")}
              </span>
            </div>
          </div>

          {/* Bilgi notu */}
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(30,58,95,0.15)",
              border: "1px solid rgba(30,58,95,0.3)",
              fontSize: 11,
              color: "var(--text-3)",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "var(--text-2)" }}>
              {t("common.note") ?? "Not:"}
            </strong>{" "}
            {t("stock.notSkuAciklama")}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

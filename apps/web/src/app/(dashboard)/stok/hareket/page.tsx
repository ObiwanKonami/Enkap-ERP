"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { stockApi, type StockMovement } from "@/services/stock";
import { fmtQty } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import Link from "next/link";

const t = createTranslator(DEFAULT_LOCALE);
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  SlidersHorizontal,
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  Search,
  Package,
  Boxes,
  FileText,
} from "lucide-react";

type MovementType = StockMovement["type"];

interface MovementTypeOption {
  value: MovementType;
  label: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

function getMovementTypes(t: (key: string) => string): MovementTypeOption[] {
  return [
    {
      value: "GIRIS" as MovementType,
      label: t("stock.stockIn"),
      desc: t("stock.stockInDesc"),
      icon: <ArrowDownToLine size={18} />,
      color: "#10B981",
      bg: "rgba(16,185,129,0.12)",
    },
    {
      value: "CIKIS" as MovementType,
      label: t("stock.stockOut"),
      desc: t("stock.stockOutDesc"),
      icon: <ArrowUpFromLine size={18} />,
      color: "#EF4444",
      bg: "rgba(239,68,68,0.12)",
    },
    {
      value: "TRANSFER" as MovementType,
      label: t("stock.movement"),
      desc: t("stock.transferDesc"),
      icon: <ArrowLeftRight size={18} />,
      color: "#0EA5E9",
      bg: "rgba(14,165,233,0.12)",
    },
    {
      value: "SAYIM" as MovementType,
      label: t("stock.adjustment"),
      desc: t("stock.adjustmentDesc"),
      icon: <SlidersHorizontal size={18} />,
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.12)",
    },
  ];
}

function getRefTypes(t: (key: string) => string) {
  return [
    { value: "", label: t("stock.referansYok") },
    { value: "INVOICE", label: t("stock.fatura") },
    { value: "PURCHASE", label: t("stock. satinAlma") },
    { value: "RETURN", label: t("stock.iade") },
    { value: "MANUAL", label: t("stock.manuel") },
  ];
}

interface SelectedProduct {
  id: string;
  name: string;
  sku: string;
  unitCode: string;
}

function ProductSearch({
  value,
  onChange,
  t,
}: {
  value: SelectedProduct | null;
  onChange: (p: SelectedProduct | null) => void;
  t: (key: string) => string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["products-search", q],
    queryFn: () => stockApi.products.list({ q: q || undefined, limit: 20 }),
    enabled: open && q.length >= 1,
    select: (r) => r.data.data,
  });

  if (value) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 7,
          background: "rgba(14,165,233,0.06)",
          border: "1px solid rgba(14,165,233,0.25)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            flexShrink: 0,
            background: "rgba(14,165,233,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Package size={14} style={{ color: "#38BDF8" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}
          >
            {value.name}
          </div>
          <div className="num" style={{ fontSize: 11, color: "#38BDF8" }}>
            {value.sku} · {value.unitCode}
          </div>
        </div>
        <button
          onClick={() => onChange(null)}
          style={{
            color: "var(--text-3)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search
          size={13}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-3)",
          }}
        />
        <input
          className="input"
          style={{ width: "100%", paddingLeft: 32 }}
          placeholder={t("stock.productSearch")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && data && data.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: 4,
            borderRadius: 7,
            overflow: "hidden",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {data.map((p) => (
            <button
              key={p.id}
              onMouseDown={() => {
                onChange({
                  id: p.id,
                  name: p.name,
                  sku: p.sku,
                  unitCode: p.unitCode,
                });
                setQ("");
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 12px",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "none";
              }}
            >
              <Package size={13} style={{ color: "#38BDF8", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: "var(--text-1)" }}>
                  {p.name}
                </div>
                <div
                  className="num"
                  style={{ fontSize: 11, color: "var(--text-3)" }}
                >
                  {p.sku}
                </div>
              </div>
              <div
                className="num"
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  color: "var(--text-3)",
                  flexShrink: 0,
                }}
              >
                {t("stock.stok")}: {fmtQty(p.totalStockQty)} {p.unitCode}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WarehouseSelect({
  label,
  value,
  onChange,
  exclude,
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
  t: (key: string) => string;
}) {
  const { data: warehouses } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => stockApi.warehouses.list(),
    select: (r) => r.data.filter((w) => w.isActive && w.id !== exclude),
  });

  return (
    <div>
      <label
        style={{
          fontSize: 11,
          color: "var(--text-3)",
          display: "block",
          marginBottom: 5,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 500,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Boxes size={11} style={{ color: "var(--text-3)" }} />
          {label} <span style={{ color: "#EF4444" }}>*</span>
        </span>
      </label>
      <select
        className="input"
        style={{ width: "100%" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t("stock.selectWarehouse")}</option>
        {warehouses?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {w.city ? ` (${w.city})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

const LABEL_STYLE = {
  fontSize: 11,
  color: "var(--text-3)",
  display: "block",
  marginBottom: 5,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  fontWeight: 500,
};

const SECTION_TITLE = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-3)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  marginBottom: 14,
};

export default function StokHareketPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [movementType, setMovementType] = useState<MovementType>("GIRIS");
  const [product, setProduct] = useState<SelectedProduct | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [targetWhId, setTargetWhId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCostTl, setUnitCostTl] = useState("");
  const [refType, setRefType] = useState("");
  const [refId, setRefId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const isTransfer = movementType === "TRANSFER";
  const showCost = movementType === "GIRIS";

  const canSubmit =
    !!product &&
    !!warehouseId &&
    parseFloat(quantity) > 0 &&
    (!isTransfer || !!targetWhId);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      stockApi.movements.create({
        productId: product!.id,
        warehouseId,
        targetWarehouseId: isTransfer ? targetWhId : undefined,
        type: movementType,
        quantity: parseFloat(quantity),
        unitCostKurus:
          showCost && unitCostTl ? Math.round(parseFloat(unitCostTl) * 100) : 0,
        referenceType: refType || null,
        referenceId: refId || null,
        notes: notes || null,
      }),
    onSuccess: (res) => {
      router.push(`/stok/${res.data.productId}`);
    },
    onError: () => setError(t("stock.movementFailed")),
  });

  const movementTypes = getMovementTypes(t);
  const refTypes = getRefTypes(t);
  const activeType = movementTypes.find((mt) => mt.value === movementType)!;

  return (
    <div className="space-y-5">
      {/* ─── Başlık ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.back()}
            style={{
              background: "rgba(30,58,95,0.3)",
              border: "1px solid rgba(30,58,95,0.5)",
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
              color: "var(--text-2)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
            }}
          >
            <ArrowLeft size={13} /> {t("common.back")}
          </button>
          <div>
            <h1
              className="text-xl font-bold text-text-1"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  flexShrink: 0,
                  background: activeType.bg,
                  border: `1px solid ${activeType.color}40`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ color: activeType.color, display: "flex" }}>
                  {activeType.icon}
                </span>
              </div>
              {t("stock.enterMovementTitle")}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {t("stock.enterMovementDesc")}
            </p>
          </div>
        </div>
        <button
          className="btn-primary h-9 px-4 text-sm"
          onClick={() => mutate()}
          disabled={isPending || !canSubmit}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          {isPending ? (
            <>
              <Loader2 size={13} className="animate-spin" />{" "}
              {t("stock.kaydediliyor")}
            </>
          ) : (
            <>
              <Save size={13} /> {t("stock.saveMovement")}
            </>
          )}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 240px",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Sol — form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Hareket Tipi */}
          <div className="card p-5">
            <div style={SECTION_TITLE}>{t("stock.hareketTuru")}</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: 8,
              }}
            >
              {movementTypes.map((mt) => {
                const active = movementType === mt.value;
                return (
                  <button
                    key={mt.value}
                    onClick={() => {
                      setMovementType(mt.value);
                      setTargetWhId("");
                    }}
                    style={{
                      padding: "12px 8px",
                      borderRadius: 8,
                      cursor: "pointer",
                      textAlign: "center",
                      background: active ? mt.bg : "transparent",
                      border: `1px solid ${active ? mt.color + "40" : "var(--border)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <div
                      style={{
                        color: active ? mt.color : "var(--text-3)",
                        marginBottom: 6,
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      {mt.icon}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        color: active ? mt.color : "var(--text-2)",
                      }}
                    >
                      {mt.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-3)",
                        marginTop: 2,
                      }}
                    >
                      {mt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ürün & Depo */}
          <div className="card p-5">
            <div style={SECTION_TITLE}>{t("stock.urunDepo")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LABEL_STYLE}>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <Package size={11} style={{ color: "var(--text-3)" }} />
                    {t("stock.product")}{" "}
                    <span style={{ color: "#EF4444" }}>*</span>
                  </span>
                </label>
                <ProductSearch t={t} value={product} onChange={setProduct} />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isTransfer ? "1fr 1fr" : "1fr",
                  gap: 14,
                }}
              >
                <WarehouseSelect
                  t={t}
                  label={
                    isTransfer ? t("stock.kaynakDepo") : t("stock.depoZorunlu")
                  }
                  value={warehouseId}
                  onChange={setWarehouseId}
                  exclude={isTransfer ? targetWhId : undefined}
                />
                {isTransfer && (
                  <WarehouseSelect
                    t={t}
                    label={t("stock.hedefDepo")}
                    value={targetWhId}
                    onChange={setTargetWhId}
                    exclude={warehouseId}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Miktar & Maliyet */}
          <div className="card p-5">
            <div style={SECTION_TITLE}>{t("stock.miktarMaliyet")}</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: showCost ? "1fr 1fr" : "1fr",
                gap: 14,
              }}
            >
              <div>
                <label style={LABEL_STYLE}>
                  {t("stock.quantity")}
                  {product ? ` (${product.unitCode})` : ""}{" "}
                  <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  className="input num"
                  style={{ width: "100%", fontSize: 14 }}
                  type="number"
                  min={0.001}
                  step={
                    movementType === "GIRIS" || movementType === "CIKIS" ? 1 : 0.001
                  }
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  autoFocus={!!product}
                />
              </div>

              {showCost && (
                <div>
                  <label style={LABEL_STYLE}>{t("stock.unitCost")}</label>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-3)",
                        fontSize: 13,
                      }}
                    >
                      ₺
                    </span>
                    <input
                      className="input num"
                      style={{ width: "100%", paddingLeft: 24 }}
                      type="number"
                      min={0}
                      step={0.01}
                      value={unitCostTl}
                      onChange={(e) => setUnitCostTl(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Referans & Notlar */}
          <div className="card p-5">
            <div style={SECTION_TITLE}>{t("stock.referansNotlar")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <div>
                  <label style={LABEL_STYLE}>
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <FileText size={11} style={{ color: "var(--text-3)" }} />
                      {t("stock.referenceType")}
                    </span>
                  </label>
                  <select
                    className="input"
                    style={{ width: "100%" }}
                    value={refType}
                    onChange={(e) => {
                      setRefType(e.target.value);
                      if (!e.target.value) setRefId("");
                    }}
                  >
                    {refTypes.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                {refType && (
                  <div>
                    <label style={LABEL_STYLE}>{t("stock.referenceNo")}</label>
                    <input
                      className="input"
                      style={{ width: "100%" }}
                      value={refId}
                      onChange={(e) => setRefId(e.target.value)}
                      placeholder={t("stock.referenceNo")}
                    />
                  </div>
                )}
              </div>

              <div>
                <label style={LABEL_STYLE}>{t("stock.noteField")}</label>
                <textarea
                  className="input"
                  style={{
                    width: "100%",
                    minHeight: 72,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("stock.descriptionPlaceholder")}
                />
              </div>
            </div>
          </div>

          {/* Hata */}
          {error && (
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
              {error}
            </div>
          )}
        </div>

        {/* Sağ — Özet */}
        <div
          style={{
            position: "sticky",
            top: 80,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div className="card p-5">
            <div style={SECTION_TITLE}>{t("stock.summary")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Tip göstergesi */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderRadius: 7,
                  background: activeType.bg,
                  border: `1px solid ${activeType.color}30`,
                }}
              >
                <span style={{ color: activeType.color }}>
                  {activeType.icon}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: activeType.color,
                    }}
                  >
                    {activeType.label}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {activeType.desc}
                  </div>
                </div>
              </div>

              {/* Özet satırları */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {[
                  {
                    label: t("stock.product"),
                    value: product?.name ?? t("stock.yoktur"),
                  },
                  {
                    label: t("stock.sku"),
                    value: product?.sku ?? t("stock.yoktur"),
                  },
                  {
                    label: t("stock.quantity"),
                    value:
                      quantity && product
                        ? `${quantity} ${product.unitCode}`
                        : t("stock.yoktur"),
                    highlight: true,
                  },
                  ...(showCost && unitCostTl
                    ? [
                        {
                          label: t("stock.totalCost"),
                          value: `₺${(parseFloat(quantity || "0") * parseFloat(unitCostTl)).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}`,
                          highlight: true,
                        },
                      ]
                    : []),
                ].map(({ label, value, highlight }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ color: "var(--text-3)" }}>{label}</span>
                    <span
                      className="num"
                      style={{
                        color: highlight ? activeType.color : "var(--text-2)",
                        fontWeight: highlight ? 600 : 400,
                        textAlign: "right",
                        wordBreak: "break-all",
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Kısayollar */}
          <div
            style={{
              fontSize: 11,
              color: "var(--text-3)",
              padding: "4px 2px",
              lineHeight: 1.8,
            }}
          >
            <div>
              • {t("stock.stockIn")}: {t("stock.ureticimAlim")}
            </div>
            <div>
              • {t("stock.stockOut")}: {t("stock.satisFireImha")}
            </div>
            <div>
              • {t("stock.movement")}: {t("stock.depolarArasi")}
            </div>
            <div>
              • {t("stock.adjustment")}: {t("stock.sayimFarki")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

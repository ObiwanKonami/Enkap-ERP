"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

const TURKISH_CITIES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Aksaray",
  "Amasya",
  "Ankara",
  "Antalya",
  "Ardahan",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bartın",
  "Batman",
  "Bayburt",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Düzce",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkari",
  "Hatay",
  "Iğdır",
  "Isparta",
  "İstanbul",
  "İzmir",
  "Kahramanmaraş",
  "Karabük",
  "Karaman",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kilis",
  "Kırıkkale",
  "Kırklareli",
  "Kırşehir",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Mardin",
  "Mersin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Osmaniye",
  "Rize",
  "Sakarya",
  "Samsun",
  "Şanlıurfa",
  "Siirt",
  "Sinop",
  "Şırnak",
  "Sivas",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Uşak",
  "Van",
  "Yalova",
  "Yozgat",
  "Zonguldak",
];

export default function DepoSepPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState("");

  const { data: depo, isLoading } = useQuery({
    queryKey: ["warehouse", id],
    queryFn: () => stockApi.warehouses.get(id).then((r) => r.data),
  });

  useEffect(() => {
    if (depo) {
      setName(depo.name);
      setCode(depo.code);
      setCity(depo.city ?? "");
      setIsActive(depo.isActive);
    }
  }, [depo]);

  const canSubmit = name.trim().length >= 2 && code.trim().length >= 2;

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      stockApi.warehouses.update(id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        city: city || undefined,
        isActive,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["warehouse", id] });
      router.push(`/depo/${id}`);
    },
    onError: () => setFormError(t("stock.warehouses.createFailed")),
  });

  const w = "100%";

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
        }}
      >
        <Loader2
          size={20}
          className="animate-spin"
          style={{ color: "var(--text-3)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
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
              <Building2 size={20} style={{ color: "#38BDF8" }} />
              {t("stock.warehouses.editWarehouse")}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {depo?.name}
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
              {t("stock.warehouses.saving")}
            </>
          ) : (
            <>
              <Save size={13} /> {t("common.save")}
            </>
          )}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div
          className="card p-5"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <h2
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 2,
            }}
          >
            {t("stock.warehouses.warehouseInfo")}
          </h2>

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
              {t("stock.warehouses.warehouseName")}{" "}
              <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              className="input"
              style={{ width: w }}
              placeholder={t("stock.onizlemeExample")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
          >
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
                {t("stock.warehouses.warehouseCode")}{" "}
                <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                className="input num"
                style={{ width: w, textTransform: "uppercase" }}
                placeholder="IST-001"
                maxLength={12}
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
                  )
                }
              />
              <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>
                Max 12 karakter
              </p>
            </div>
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
                {t("stock.warehouses.city")}{" "}
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-3)",
                    fontWeight: 400,
                    textTransform: "none",
                  }}
                >
                  {t("stock.warehouses.cityOptional")}
                </span>
              </label>
              <select
                className="input"
                style={{ width: w }}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">{t("common.select")}</option>
                {TURKISH_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-1)",
                  fontWeight: 500,
                }}
              >
                {t("stock.warehouses.activeStatus")}
              </div>
              <div
                style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}
              >
                {isActive
                  ? t("stock.warehouses.activeHint")
                  : t("stock.warehouses.inactiveHint")}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                flexShrink: 0,
                background: isActive ? "#0EA5E9" : "var(--bg-hover)",
                border: "none",
                cursor: "pointer",
                position: "relative",
                transition: "background 0.2s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: isActive ? 20 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "white",
                  transition: "left 0.2s",
                }}
              />
            </button>
          </div>

          {formError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "8px 12px",
                borderRadius: 6,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.3)",
                color: "#FCA5A5",
                fontSize: 12,
              }}
            >
              <AlertCircle size={13} />
              {formError}
            </div>
          )}
        </div>

        <div style={{ position: "sticky", top: 80 }}>
          <div className="card p-5">
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 14,
              }}
            >
              {t("stock.onizleme")}
            </h2>
            <div
              style={{
                padding: "14px 16px",
                borderRadius: 8,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  marginBottom: 10,
                  background: "var(--accent-dim)",
                  border: "1px solid rgba(14,165,233,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={16} style={{ color: "#38BDF8" }} />
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-1)",
                  marginBottom: 4,
                  minHeight: 18,
                }}
              >
                {name || (
                  <span style={{ color: "var(--text-3)", fontWeight: 400 }}>
                    Depo adı...
                  </span>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {code && (
                  <span
                    className="num"
                    style={{ fontSize: 11, color: "#38BDF8" }}
                  >
                    {code}
                  </span>
                )}
                {city && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-3)",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <MapPin size={10} />
                    {city}
                  </span>
                )}
              </div>
              <span className={isActive ? "badge-success" : "badge-default"}>
                {isActive
                  ? t("stock.warehouses.active")
                  : t("stock.warehouses.passive")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import { ArApClient } from "./ar-ap-client";

const t = createTranslator(DEFAULT_LOCALE);

export const metadata = { title: `${t('arAp.pageTitle')} — Enkap` };

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface AgingBucket {
  bucket: "not_due" | "1_30" | "31_60" | "61_90" | "90_plus";
  totalAmount: number;
  invoiceCount: number;
}

interface AgingSummary {
  buckets: AgingBucket[];
  grandTotal: number;
  currency: string;
}

interface AgingDetail {
  contactId: string;
  contactName: string;
  buckets: AgingBucket[];
  total: number;
}

// ─── Veri yükleme ─────────────────────────────────────────────────────────────

function toArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
  }
  return [];
}

function toSummary(val: unknown): AgingSummary {
  const empty: AgingSummary = { buckets: [], grandTotal: 0, currency: "TRY" };
  if (!val || typeof val !== "object") return empty;
  const obj = val as Record<string, unknown>;
  return {
    buckets: Array.isArray(obj.buckets) ? (obj.buckets as AgingBucket[]) : [],
    grandTotal: typeof obj.grandTotal === "number" ? obj.grandTotal : 0,
    currency: typeof obj.currency === "string" ? obj.currency : "TRY",
  };
}

async function fetchAgingData(token: string) {
  const [ar, ap, arDetail, apDetail] = await Promise.allSettled([
    serverFetch<unknown>(
      "financial",
      "/ar-ap/aging/receivables/summary",
      token,
    ),
    serverFetch<unknown>("financial", "/ar-ap/aging/payables/summary", token),
    serverFetch<unknown>("financial", "/ar-ap/aging/receivables/detail", token),
    serverFetch<unknown>("financial", "/ar-ap/aging/payables/detail", token),
  ]);

  return {
    ar: toSummary(ar.status === "fulfilled" ? ar.value : null),
    ap: toSummary(ap.status === "fulfilled" ? ap.value : null),
    arDetail: toArray<AgingDetail>(
      arDetail.status === "fulfilled" ? arDetail.value : [],
    ),
    apDetail: toArray<AgingDetail>(
      apDetail.status === "fulfilled" ? apDetail.value : [],
    ),
  };
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default async function ArApPage() {
  const session = await getServerSession(authOptions);
  const { ar, ap, arDetail, apDetail } = await fetchAgingData(
    session?.user.accessToken ?? "",
  );

  return <ArApClient ar={ar} ap={ap} arDetail={arDetail} apDetail={apDetail} />;
}

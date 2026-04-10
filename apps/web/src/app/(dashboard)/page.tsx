import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { serverFetch } from "@/lib/api-client";
import { KpiCard } from "@/components/ui/kpi-card";
import { RevenueChart } from "@/components/ui/revenue-chart";
import { formatCurrency, formatCompact, formatDate, kurusToTl } from "@/lib/format";
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import {
  FileText,
  Package,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Brain,
  Activity,
  ArrowUpRight,
  Zap,
  Target,
} from "lucide-react";

const t = createTranslator(DEFAULT_LOCALE);

interface InvoiceListResponse {
  data: Array<{
    id: string;
    invoiceNumber: string;
    direction: "OUT" | "IN";
    status: string;
    customerName?: string;
    vendorName?: string;
    issueDate: string;
    total: number;
  }>;
  total: number;
}

interface Product {
  totalStockQty: number;
  reorderPoint: number;
}

interface ProductListResponse {
  data: Product[];
  total: number;
}

interface BalanceItem {
  currency: string;
  totalKurus: number;
}

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  ACCEPTED_GIB: {
    label: t("dashboard.statusBadge.ACCEPTED_GIB"),
    class: "badge-emerald",
  },
  PENDING_GIB: {
    label: t("dashboard.statusBadge.PENDING_GIB"),
    class: "badge-amber",
  },
  SENT_GIB: { label: t("dashboard.statusBadge.SENT_GIB"), class: "badge-sky" },
  DRAFT: { label: t("dashboard.statusBadge.DRAFT"), class: "badge-slate" },
  REJECTED_GIB: {
    label: t("dashboard.statusBadge.REJECTED_GIB"),
    class: "badge-rose",
  },
  CANCELLED: {
    label: t("dashboard.statusBadge.CANCELLED"),
    class: "badge-slate",
  },
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = session?.user?.accessToken ?? "";

  const [invoiceRes, pendingRes, productRes, balanceRes] =
    await Promise.allSettled([
      serverFetch<InvoiceListResponse>("financial", "/invoices?limit=5", token),
      serverFetch<InvoiceListResponse>(
        "financial",
        "/invoices?status=PENDING_GIB&limit=1",
        token,
      ),
      serverFetch<ProductListResponse>("stock", "/products?limit=200", token),
      serverFetch<BalanceItem[]>(
        "treasury",
        "/accounts/summary/balances",
        token,
      ),
    ]);

  const activeInvoices =
    pendingRes.status === "fulfilled" ? (pendingRes.value.total ?? 0) : 0;

  const lowStockCount =
    productRes.status === "fulfilled"
      ? (
          productRes.value.data ??
          (productRes.value as unknown as { items?: Product[] }).items ??
          []
        ).filter((p) => Number(p.totalStockQty) <= Number(p.reorderPoint))
          .length
      : 0;

  const cashBalance =
    balanceRes.status === "fulfilled"
      ? (balanceRes.value.find((b) => b.currency === "TRY")?.totalKurus ?? 0) /
        100
      : 0;

  const kpi = {
    totalRevenue: 0,
    activeInvoices,
    lowStockCount,
    cashflowForecast: cashBalance,
  };

  const invoiceItems =
    invoiceRes.status === "fulfilled"
      ? (invoiceRes.value.data ??
        (invoiceRes.value as unknown as { items?: InvoiceListResponse["data"] })
          .items ??
        [])
      : [];
  const transactions = invoiceItems.map((inv) => ({
    id: inv.id,
    no: inv.invoiceNumber,
    customer: inv.customerName ?? inv.vendorName ?? "—",
    amount: inv.total,
    type: inv.direction === "OUT" ? "out" : "in",
    status: inv.status,
    date: formatDate(inv.issueDate),
  }));

  const chartData: { ay: string; gelir: number; gider: number }[] = [];
  const forecast: {
    period: string;
    amount: number;
    confidence: number;
    change: number;
  }[] = [];
  const anomalies: {
    id: string;
    type: string;
    description: string;
    severity: string;
    time: string;
  }[] = [];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return t("dashboard.greeting.night");
    if (h < 12) return t("dashboard.greeting.morning");
    if (h < 18) return t("dashboard.greeting.afternoon");
    return t("dashboard.greeting.evening");
  })();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 700,
              fontSize: 22,
              color: "#E2E8F0",
              letterSpacing: "-0.02em",
            }}
          >
            {greeting} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("tr-TR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-emerald text-xs">
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 inline-block"
              style={{ boxShadow: "0 0 4px #34D399" }}
            />
            {t("dashboard.allSystemsActive")}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title={t("dashboard.totalCiro")}
          value={formatCompact(kpi.totalRevenue)}
          icon={<Wallet size={15} />}
          accent="sky"
          note={t("dashboard.demoNote")}
        />
        <KpiCard
          title={t("dashboard.aktifFatura")}
          value={kpi.activeInvoices.toString()}
          icon={<FileText size={15} />}
          accent="emerald"
          note={t("dashboard.pendingGib")}
        />
        <KpiCard
          title={t("dashboard.kritikStok")}
          value={kpi.lowStockCount.toString()}
          icon={<Package size={15} />}
          accent="amber"
          note={t("dashboard.urunEsikAltinda")}
        />
        <KpiCard
          title={t("dashboard.nakitBakiye")}
          value={formatCompact(kpi.cashflowForecast)}
          icon={<TrendingUp size={15} />}
          accent="sky"
          note={t("dashboard.hesaplarTRY")}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {t("dashboard.revenueAnalysis")}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t("dashboard.last6Months")}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-0.5 rounded-full inline-block"
                  style={{ background: "#0EA5E9" }}
                />
                {t("dashboard.gelir")}
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-0.5 rounded-full inline-block"
                  style={{ background: "#EF4444", opacity: 0.7 }}
                />
                {t("dashboard.gider")}
              </span>
            </div>
          </div>
          <RevenueChart data={chartData} />
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Brain size={15} style={{ color: "#38BDF8" }} />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {t("dashboard.salesForecast")}
              </h2>
              <p className="text-xs text-slate-500">
                {t("dashboard.forecastAccuracy")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {forecast.map((f, i) => (
              <div key={f.period}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-500">{f.period}</span>
                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-medium text-slate-200">
                      {formatCompact(f.amount)}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: f.change > 0 ? "#34D399" : "#F87171" }}
                    >
                      {f.change > 0 ? "+" : ""}
                      {f.change}%
                    </span>
                  </div>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(30,58,95,0.5)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${f.confidence}%`,
                      background:
                        i === 0
                          ? "linear-gradient(90deg, #0EA5E9, #38BDF8)"
                          : i === 1
                            ? "linear-gradient(90deg, #0284C7, #0EA5E9)"
                            : "linear-gradient(90deg, #1E3A5F, #0284C7)",
                    }}
                  />
                </div>
                <div className="text-right text-xs text-slate-600 mt-0.5">
                  {f.confidence}% {t("dashboard.confidence")}
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-5 pt-4 flex items-center gap-2 text-xs"
            style={{
              borderTop: "1px solid rgba(30,58,95,0.4)",
              color: "#475569",
            }}
          >
            <Zap size={11} style={{ color: "#F59E0B" }} />
            {t("dashboard.modelUpdate")}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 card">
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid rgba(30,58,95,0.4)" }}
          >
            <div className="flex items-center gap-2">
              <Activity size={14} style={{ color: "#38BDF8" }} />
              <h2 className="text-sm font-semibold text-slate-200">
                {t("dashboard.recentTransactions")}
              </h2>
            </div>
            <a
              href="/faturalar"
              className="text-xs text-sky-500 flex items-center gap-1 hover:text-sky-400 transition-colors"
            >
              {t("dashboard.viewAll")} <ArrowUpRight size={11} />
            </a>
          </div>
          <div>
            {transactions.map((tx, i) => {
              const badge = STATUS_BADGE[tx.status] ?? {
                label: tx.status,
                class: "badge-slate",
              };
              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[rgba(30,58,95,0.2)]"
                  style={{
                    borderBottom:
                      i < transactions.length - 1
                        ? "1px solid rgba(30,58,95,0.3)"
                        : "none",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                    style={{
                      background:
                        tx.type === "out"
                          ? "rgba(14,165,233,0.12)"
                          : "rgba(16,185,129,0.12)",
                    }}
                  >
                    <FileText
                      size={13}
                      style={{
                        color: tx.type === "out" ? "#38BDF8" : "#34D399",
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-slate-300 truncate">
                      {tx.customer}
                    </div>
                    <div className="text-xs text-slate-600 num mt-0.5">
                      {tx.no}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="num text-sm font-medium"
                      style={{
                        color: tx.type === "out" ? "#38BDF8" : "#34D399",
                      }}
                    >
                      {tx.type === "out" ? "" : "+"}
                      {formatCurrency(kurusToTl(tx.amount))}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {tx.date}
                    </div>
                  </div>
                  <span className={badge.class}>{badge.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div
            className="flex items-center gap-2 px-5 py-4"
            style={{ borderBottom: "1px solid rgba(30,58,95,0.4)" }}
          >
            <Target size={14} style={{ color: "#F59E0B" }} />
            <h2 className="text-sm font-semibold text-slate-200">
              {t("dashboard.anomalyDetection")}
            </h2>
            <span className="badge-amber ml-auto">{anomalies.length}</span>
          </div>
          <div className="p-3 space-y-2">
            {anomalies.map((a) => (
              <div
                key={a.id}
                className="p-3 rounded-md transition-colors"
                style={{
                  background: "rgba(30,58,95,0.2)",
                  border: "1px solid rgba(30,58,95,0.3)",
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle
                    size={11}
                    style={{
                      color:
                        a.severity === "high"
                          ? "#F87171"
                          : a.severity === "medium"
                            ? "#FBBF24"
                            : "#64748B",
                    }}
                  />
                  <span className="text-xs font-medium text-slate-300">
                    {a.type}
                  </span>
                  <span className="text-xs text-slate-600 ml-auto">
                    {a.time}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {a.description}
                </p>
              </div>
            ))}
          </div>
          <div className="px-5 pb-4">
            <a
              href="/ai-asistan"
              className="block w-full text-xs text-center py-2 rounded transition-colors text-slate-500 hover:text-slate-400"
              style={{
                background: "rgba(30,58,95,0.2)",
                border: "1px solid rgba(30,58,95,0.3)",
              }}
            >
              {t("dashboard.viewAllAnalysis")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Wallet,
  Building2,
  TrendingUp,
  TrendingDown,
  ReceiptText,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import {
  treasuryApi,
  type TreasuryAccount,
  type TransactionType,
} from "@/services/treasury";
import { useI18n } from "@/hooks/use-i18n";
import {
import { DateInput } from '@/components/ui/date-input';
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

const fmtTRY = (kurus: number, currency = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(
    Number(kurus) / 100,
  );

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
};

const TX_IN_TYPES: TransactionType[] = [
  "TAHSILAT",
  "FAIZ_GELIRI",
  "DIGER_GELIR",
];
const TX_TYPES: TransactionType[] = [
  "TAHSILAT",
  "ODEME",
  "TRANSFER",
  "FAIZ_GELIRI",
  "BANKA_MASRAFI",
  "DIGER_GELIR",
  "DIGER_GIDER",
];

const LIMIT = 20;

type DateFilter = "thisMonth" | "last3Months" | "thisYear" | "all";

function getDateRange(filter: DateFilter): {
  fromDate?: string;
  toDate?: string;
} {
  const now = new Date();
  if (filter === "thisMonth") {
    return {
      fromDate: new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10),
      toDate: now.toISOString().slice(0, 10),
    };
  }
  if (filter === "last3Months") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 3);
    return {
      fromDate: d.toISOString().slice(0, 10),
      toDate: now.toISOString().slice(0, 10),
    };
  }
  if (filter === "thisYear") {
    return {
      fromDate: `${now.getFullYear()}-01-01`,
      toDate: now.toISOString().slice(0, 10),
    };
  }
  return {};
}

// ─── Sayfa ────────────────────────────────────────────────────────────────────

export default function KasaBankaDetailPage() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [dateFilter, setDateFilter] = useState<DateFilter>("thisMonth");
  const [page,       setPage      ] = useState(1);
  const [newTxModal, setNewTxModal] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const { data: account, isLoading: accLoading } = useQuery({
    queryKey: ["treasury-account", id],
    queryFn: () => treasuryApi.accounts.get(id).then((r) => r.data),
  });

  function changeDateFilter(f: DateFilter) { setDateFilter(f); setPage(1); }

  const { fromDate, toDate } = getDateRange(dateFilter);

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["treasury-tx", id, dateFilter, page],
    queryFn: () =>
      treasuryApi.transactions
        .list(id, { limit: LIMIT, offset: (page - 1) * LIMIT, fromDate, toDate })
        .then((r) => r.data)
        .catch(() => ({ data: [], total: 0 })),
    enabled: !!account,
  });

  const transactions = txData?.data ?? [];
  const txTotal      = txData?.total ?? 0;
  const txTotalPages = Math.max(1, Math.ceil(txTotal / LIMIT));

  const totalIn = transactions
    .filter((tx) => TX_IN_TYPES.includes(tx.transactionType))
    .reduce((s, tx) => s + Number(tx.amountKurus), 0);
  const totalOut = transactions
    .filter(
      (tx) =>
        !TX_IN_TYPES.includes(tx.transactionType) &&
        tx.transactionType !== "TRANSFER",
    )
    .reduce((s, tx) => s + Number(tx.amountKurus), 0);

  const deactivateMut = useMutation({
    mutationFn: () => treasuryApi.accounts.deactivate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury-account", id] });
      qc.invalidateQueries({ queryKey: ["treasury-accounts"] });
      showToast(t("finance.treasury.deactivated"), true);
    },
    onError: () => showToast(t("finance.treasury.failed"), false),
  });

  if (accLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-64 bg-ink-800 rounded-lg" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-ink-800 rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-ink-800 rounded-xl" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="card p-12 text-center text-text-3">
        <Landmark size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm">{t("finance.treasury.accountNotFound")}</p>
        <Link
          href="/kasa-banka"
          className="btn-ghost mt-4 h-8 px-4 text-xs inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={12} />
          {t("finance.treasury.back")}
        </Link>
      </div>
    );
  }

  const isKasa = account.accountType === "KASA";
  const balance = Number(account.balanceKurus);

  return (
    <div className="space-y-6">
      {/* ─── Üst: Geri + Başlık + Aksiyonlar ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            href="/kasa-banka"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-text-3 hover:text-text-1 bg-ink-800 border border-ink-700 transition-colors"
          >
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg border ${
                  isKasa
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                    : "bg-sky-500/10 border-sky-500/20 text-sky-400"
                }`}
              >
                {isKasa ? <Wallet size={14} /> : <Building2 size={14} />}
              </div>
              <h1 className="text-xl font-bold text-text-1">
                {account.name}
              </h1>
              {!account.isActive && (
                <span className="badge-default text-xs opacity-60">
                  {t("finance.treasury.passive")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-text-3">
                {isKasa
                  ? t("finance.treasury.cashAccount")
                  : t("finance.treasury.bankAccount")}
              </span>
              {account.bankName && (
                <>
                  <span className="text-text-4">·</span>
                  <span className="text-xs text-text-3">
                    {account.bankName}
                  </span>
                </>
              )}
              {account.iban && (
                <>
                  <span className="text-text-4">·</span>
                  <span className="num text-xs text-text-3 tracking-wider">
                    {account.iban}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewTxModal(true)}
            className="btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
          >
            <Plus size={13} />
            {t("finance.treasury.addMovement")}
          </button>
          {account.isActive && (
            <button
              onClick={() => {
                if (confirm(t("finance.treasury.deactivateConfirm"))) {
                  deactivateMut.mutate();
                }
              }}
              disabled={deactivateMut.isPending}
              className="btn-ghost h-8 px-3 text-xs flex items-center gap-1.5 text-rose-400 hover:text-rose-300 border-rose-500/20 hover:border-rose-500/40"
            >
              {deactivateMut.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <AlertTriangle size={12} />
              )}
              {t("finance.treasury.deactivate")}
            </button>
          )}
        </div>
      </div>

      {/* ─── KPI Kartlar ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("finance.treasury.currentBalance")}
          value={fmtTRY(balance, account.currency)}
          icon={<Landmark size={14} />}
          color={balance >= 0 ? "sky" : "rose"}
        />
        <KpiCard
          label={t("finance.treasury.totalIn")}
          value={fmtTRY(totalIn, account.currency)}
          icon={<TrendingUp size={14} />}
          color="emerald"
          sub={t(`finance.treasury.${dateFilter}`)}
        />
        <KpiCard
          label={t("finance.treasury.totalOut")}
          value={fmtTRY(totalOut, account.currency)}
          icon={<TrendingDown size={14} />}
          color="rose"
          sub={t(`finance.treasury.${dateFilter}`)}
        />
        <KpiCard
          label={t("finance.treasury.movementCount")}
          value={`${txData?.total ?? 0}`}
          icon={<ReceiptText size={14} />}
          color="amber"
          sub={t(`finance.treasury.${dateFilter}`)}
        />
      </div>

      {/* ─── İşlemler Tablosu ─── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ink-700 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-text-1 flex items-center gap-2">
            <ArrowLeftRight size={14} className="text-text-3" />
            {t("finance.treasury.movementHistory")}
          </h2>
          <div className="flex items-center gap-1">
            {(
              ["thisMonth", "last3Months", "thisYear", "all"] as DateFilter[]
            ).map((f) => (
              <button
                key={f}
                onClick={() => changeDateFilter(f)}
                className={`h-7 px-3 rounded-md text-xs transition-colors ${
                  dateFilter === f
                    ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                    : "text-text-3 hover:text-text-2 hover:bg-ink-700"
                }`}
              >
                {t(`finance.treasury.${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-700/50 bg-ink-800/30">
                <th className="text-left px-4 py-2.5 text-text-3 font-medium">
                  {t("finance.treasury.date")}
                </th>
                <th className="text-left px-4 py-2.5 text-text-3 font-medium">
                  {t("finance.treasury.accountType")}
                </th>
                <th className="text-left px-4 py-2.5 text-text-3 font-medium hidden md:table-cell">
                  {t("finance.treasury.description")}
                </th>
                <th className="text-left px-4 py-2.5 text-text-3 font-medium hidden lg:table-cell">
                  {t("finance.treasury.status")}
                </th>
                <th className="text-right px-4 py-2.5 text-text-3 font-medium">
                  {t("finance.treasury.amount")}
                </th>
                <th className="text-right px-4 py-2.5 text-text-3 font-medium hidden md:table-cell">
                  {t("finance.treasury.balance")}
                </th>
              </tr>
            </thead>
            <tbody>
              {txLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-ink-700/30">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-3 bg-ink-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-16 text-text-3">
                    <ArrowLeftRight
                      size={28}
                      className="mx-auto mb-2 opacity-30"
                    />
                    <p>{t("finance.treasury.noMovementsPeriod")}</p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isIn = TX_IN_TYPES.includes(tx.transactionType);
                  const recon = tx.reconciliationStatus;

                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-ink-700/30 hover:bg-ink-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-text-2 num whitespace-nowrap">
                        {fmtDate(tx.transactionDate)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={
                              isIn ? "text-emerald-400" : "text-rose-400"
                            }
                          >
                            {isIn ? (
                              <ArrowDownLeft size={12} />
                            ) : (
                              <ArrowUpRight size={12} />
                            )}
                          </span>
                          <span className="text-text-2">
                            {t(`finance.treasury.txTypes.${tx.transactionType}`)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-text-3 max-w-xs truncate hidden md:table-cell">
                        {tx.description ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 hidden lg:table-cell">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${
                            recon === "ESLESTI"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : recon === "ESLESMEDI"
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                : "bg-ink-700 border-ink-600 text-text-3"
                          }`}
                        >
                          {recon === "ESLESTI"
                            ? t("finance.treasury.matched")
                            : recon === "ESLESMEDI"
                              ? t("finance.treasury.unmatched")
                              : t("finance.treasury.pending")}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right num font-semibold whitespace-nowrap ${
                          isIn ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isIn ? "+" : "−"}
                        {fmtTRY(Number(tx.amountKurus), account.currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right num text-text-2 hidden md:table-cell whitespace-nowrap">
                        {fmtTRY(Number(tx.runningBalance), account.currency)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {txTotal > 0 && (
          <div className="px-4 py-2 border-t border-ink-700/30 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, txTotal)} / {txTotal} {t("finance.treasury.movementsShown")}
            </span>
            {txTotalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-disabled={page === 1}
                      className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, txTotalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, txTotalPages - 4));
                    const n = start + i;
                    return (
                      <PaginationItem key={n}>
                        <PaginationLink onClick={() => setPage(n)} isActive={n === page} className="cursor-pointer">
                          {n}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(txTotalPages, p + 1))}
                      aria-disabled={page === txTotalPages}
                      className={page === txTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>

      {/* ─── Hesap Bilgileri ─── */}
      <div className="card p-5 space-y-4">
        <h3 className="text-xs font-semibold text-text-3 uppercase tracking-wider flex items-center gap-2">
          <ChevronRight size={12} />
          {t("finance.treasury.accountInfo")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
          {[
            { label: t("finance.treasury.accountName"), value: account.name },
            {
              label: t("finance.treasury.accountType"),
              value: isKasa
                ? t("finance.treasury.kasa")
                : t("finance.treasury.banka"),
            },
            {
              label: t("finance.treasury.currencyLabel"),
              value: account.currency,
            },
            {
              label: t("finance.treasury.status"),
              value: account.isActive
                ? t("finance.budget.management")
                : t("finance.treasury.passive"),
            },
            ...(account.bankName
              ? [
                  {
                    label: t("finance.treasury.bankName"),
                    value: account.bankName,
                  },
                ]
              : []),
            ...(account.iban
              ? [{ label: t("finance.treasury.iban"), value: account.iban }]
              : []),
            ...(account.bankAccountNo
              ? [
                  {
                    label: t("finance.treasury.accountNo"),
                    value: account.bankAccountNo,
                  },
                ]
              : []),
            {
              label: t("finance.treasury.createdAt"),
              value: fmtDate(account.createdAt),
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] text-text-3 uppercase tracking-wide">
                {label}
              </p>
              <p className="text-sm text-text-1 mt-0.5 num">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Yeni Hareket Modalı ─── */}
      {newTxModal && (
        <NewTransactionModal
          t={t}
          account={account}
          onClose={() => setNewTxModal(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["treasury-account", id] });
            qc.invalidateQueries({ queryKey: ["treasury-accounts"] });
            qc.invalidateQueries({ queryKey: ["treasury-tx", id] });
            setNewTxModal(false);
            showToast(t("finance.treasury.movementSaved"), true);
          }}
          onError={() => showToast(t("finance.treasury.movementFailed"), false)}
        />
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-xl text-sm font-medium ${
            toast.ok
              ? "bg-emerald-950/95 border-emerald-500/40 text-emerald-200"
              : "bg-rose-950/95 border-rose-500/40 text-rose-200"
          }`}
        >
          {toast.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ─── KPI Kart ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: "sky" | "emerald" | "rose" | "amber";
  sub?: string;
}) {
  const cls = {
    sky: "text-sky-400     bg-sky-500/10     border-sky-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    rose: "text-rose-400    bg-rose-500/10    border-rose-500/20",
    amber: "text-amber-400   bg-amber-500/10   border-amber-500/20",
  }[color];
  const textCls = {
    sky: "text-sky-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
  }[color];

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`p-1.5 rounded-md border ${cls}`}>{icon}</span>
        <span className="text-[11px] text-text-3">{label}</span>
      </div>
      <p className={`text-lg font-bold num leading-none ${textCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-text-3">{sub}</p>}
    </div>
  );
}

// ─── Yeni Hareket Modalı ──────────────────────────────────────────────────────

function NewTransactionModal({
  t,
  account,
  onClose,
  onSuccess,
  onError,
}: {
  t: (key: string) => string;
  account: TreasuryAccount;
  onClose: () => void;
  onSuccess: () => void;
  onError: () => void;
}) {
  const [form, setForm] = useState({
    transactionType: "TAHSILAT" as TransactionType,
    amountInput: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    description: "",
    referenceId: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      treasuryApi.transactions.create(account.id, {
        transactionType: form.transactionType,
        amountKurus: Math.round(
          parseFloat(form.amountInput.replace(",", ".")) * 100,
        ),
        transactionDate: form.transactionDate,
        description: form.description || undefined,
        referenceId: form.referenceId || undefined,
      }),
    onSuccess,
    onError,
  });

  const isValid =
    form.amountInput && parseFloat(form.amountInput.replace(",", ".")) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-1">
            {t("finance.treasury.movementTitle")}{" "}
            <span className="text-sky-400">{account.name}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text-1 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-3 mb-1">
              {t("finance.treasury.movementType")}
            </label>
            <select
              className="input w-full h-9 text-sm"
              value={form.transactionType}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  transactionType: e.target.value as TransactionType,
                }))
              }
            >
              {TX_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`finance.treasury.txTypes.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-3 mb-1">
                {t("finance.treasury.amountInput")} ({account.currency}) *
              </label>
              <input
                className="input w-full h-9 text-sm num"
                placeholder={t("finance.treasury.amountPlaceholder")}
                value={form.amountInput}
                onChange={(e) =>
                  setForm((f) => ({ ...f, amountInput: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="block text-xs text-text-3 mb-1">
                {t("finance.treasury.date")}
              </label>
              <DateInput
                className="input w-full h-9 text-sm num"
                value={form.transactionDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transactionDate: e.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-3 mb-1">
              {t("finance.treasury.description")}
            </label>
            <input
              className="input w-full h-9 text-sm"
              placeholder={t("finance.treasury.descriptionPlaceholder")}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-xs text-text-3 mb-1">
              {t("finance.treasury.referenceNo")}
            </label>
            <input
              className="input w-full h-9 text-sm num"
              placeholder={t("finance.treasury.referenceNoPlaceholder")}
              value={form.referenceId}
              onChange={(e) =>
                setForm((f) => ({ ...f, referenceId: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1 h-9 text-sm">
            {t("finance.treasury.cancelAction")}
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isValid}
            className="btn-primary flex-1 h-9 text-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {mutation.isPending && (
              <Loader2 size={13} className="animate-spin" />
            )}
            {t("finance.treasury.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

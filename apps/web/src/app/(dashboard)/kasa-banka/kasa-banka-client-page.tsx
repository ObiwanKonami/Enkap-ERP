"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Landmark,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  X,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Building2,
  Wallet,
  ExternalLink,
  ChevronsLeft,
  ChevronLeft,
  ChevronsRight,
} from "lucide-react";
import { treasuryApi } from "@/services/treasury";
import { formatCurrency, kurusToTl, formatDate } from "@/lib/format";
import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DateInput } from '@/components/ui/date-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import {
  buildKasaBankaColumns,
  type TreasuryAccount,
  type TreasuryTransaction,
  type AccountType,
  type TransactionType,
} from "./kasa-banka-table";

// ─── Sabitler ─────────────────────────────────────────────────────────────────

const TX_IN_TYPES: TransactionType[] = ["TAHSILAT", "FAIZ_GELIRI", "DIGER_GELIR"];
const TX_TYPES: TransactionType[] = [
  "TAHSILAT", "ODEME", "TRANSFER", "FAIZ_GELIRI",
  "BANKA_MASRAFI", "DIGER_GELIR", "DIGER_GIDER",
];

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function KasaBankaClientPage() {
  const { t } = useI18n();
  const columns = useMemo(() => buildKasaBankaColumns(t), [t]);

  // ── Tablo state ────────────────────────────────────────────────────────────
  const [typeFilter,      setTypeFilter     ] = useState("all");
  const [page,            setPage           ] = useState(1);
  const [limit,           setLimit          ] = useState(20);
  const [accounts,        setAccounts       ] = useState<TreasuryAccount[]>([]);
  const [total,           setTotal          ] = useState(0);
  const [loading,         setLoading        ] = useState(true);
  const [fetchError,      setFetchError     ] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<TreasuryAccount | null>(null);
  const [refreshKey,      setRefreshKey     ] = useState(0);
  const [txRefreshKey,    setTxRefreshKey   ] = useState(0);

  // ── KPI state ──────────────────────────────────────────────────────────────
  const [totalTRY,   setTotalTRY  ] = useState(0);
  const [kasaCount,  setKasaCount ] = useState(0);
  const [bankaCount, setBankaCount] = useState(0);
  const [kpiTotal,   setKpiTotal  ] = useState(0);

  // ── Modal / toast state ───────────────────────────────────────────────────
  const [newAccountModal, setNewAccountModal] = useState(false);
  const [newTxModal,      setNewTxModal     ] = useState<TreasuryAccount | null>(null);
  const [toast,           setToast          ] = useState<{ text: string; ok: boolean } | null>(null);

  // ── KPI fetch (refreshKey bağımlı) ────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      treasuryApi.accounts.list({ limit: 500 }).catch(() => ({ data: { items: [], total: 0 } })),
      treasuryApi.accounts.balances().catch(() => ({ data: [] })),
    ]).then(([accRes, balRes]) => {
      const accPayload = accRes.data as { items?: TreasuryAccount[]; data?: TreasuryAccount[]; total: number };
      const items = accPayload.data ?? accPayload.items ?? [];
      const balances = (balRes.data ?? []) as Array<{ currency: string; totalKurus: number }>;
      setKasaCount(items.filter((a) => a.accountType === "KASA").length);
      setBankaCount(items.filter((a) => a.accountType === "BANKA").length);
      setKpiTotal(items.length);
      setTotalTRY(balances.find((b) => b.currency === "TRY")?.totalKurus ?? 0);
    });
  }, [refreshKey]);

  // ── Tablo fetch ───────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setFetchError(null);
        const res = await treasuryApi.accounts.list({
          // @ts-expect-error — backend accountType filter henüz yok (eksik_filtreler.md)
          accountType: typeFilter !== "all" ? typeFilter : undefined,
          page,
          limit,
        });
        const payload = res.data as { items?: TreasuryAccount[]; data?: TreasuryAccount[]; total: number };
        setAccounts(payload.data ?? payload.items ?? []);
        setTotal(payload.total ?? 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Hesaplar yüklenemedi";
        setFetchError(msg);
        setAccounts([]); setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [typeFilter, page, limit, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  function showToast(text: string, ok: boolean) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  function handleTxRefresh() {
    setTxRefreshKey((k) => k + 1);
    handleRefresh();
  }

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* 1. Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Landmark className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("finance.treasury.title")}
          </h1>
          <span className="text-sm text-muted-foreground">{total} {t("common.record")}</span>
        </div>
        <Button onClick={() => setNewAccountModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("finance.treasury.newAccount")}
        </Button>
      </div>

      {/* 2. KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Wallet className="h-4 w-4" />
              {t("finance.treasury.totalCash")}
            </div>
            <p className="text-3xl font-bold text-primary">
              {formatCurrency(kurusToTl(totalTRY))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Wallet className="h-4 w-4" />
              {t("finance.treasury.cashAccount")}
            </div>
            <p className="text-3xl font-bold text-foreground">
              {kasaCount}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t("finance.treasury.accounts")}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Building2 className="h-4 w-4" />
              {t("finance.treasury.bankAccount")}
            </div>
            <p className="text-3xl font-bold text-foreground">
              {bankaCount}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t("finance.treasury.accounts")}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              <Landmark className="h-4 w-4" />
              {t("finance.treasury.totalAccounts")}
            </div>
            <p className="text-3xl font-bold text-foreground">
              {kpiTotal}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {t("finance.treasury.accounts")}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Filtre Barı (CARD DIŞINDA) */}
      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t("finance.treasury.all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("finance.treasury.all")}</SelectItem>
            <SelectItem value="KASA">{t("finance.treasury.kasa")}</SelectItem>
            <SelectItem value="BANKA">{t("finance.treasury.banka")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. Hesaplar Tablosu (CARD içinde) */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {columns.map((col) => (
                    <TableHead
                      key={col.id}
                      className={cn("font-semibold", col.className)}
                    >
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={columns.length} className="py-2">
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : fetchError ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-40 text-center text-destructive"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 opacity-60" />
                        <p className="text-sm">{fetchError}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-40 text-center text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Landmark className="h-8 w-8 opacity-20" />
                        <p className="text-sm">{t("finance.treasury.noAccounts")}</p>
                        <p className="text-xs opacity-70">{t("finance.treasury.noAccountsHint")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => (
                    <AccountRow
                      key={acc.id}
                      account={acc}
                      isSelected={selectedAccount?.id === acc.id}
                      onClick={() =>
                        setSelectedAccount(acc.id === selectedAccount?.id ? null : acc)
                      }
                      onAddTx={() => setNewTxModal(acc)}
                      t={t}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 5. Pagination (CARD DIŞINDA) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("common.record")}</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>{t("common.perPage")}</span>
            <Select
              value={String(limit)}
              onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span>{page} / {pageCount}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 6. Seçili Hesap Hareketleri */}
      {selectedAccount ? (
        <TransactionList
          account={selectedAccount}
          refreshKey={txRefreshKey}
          onAddTx={() => setNewTxModal(selectedAccount)}
          t={t}
        />
      ) : !loading && accounts.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <ArrowLeftRight className="h-6 w-6 opacity-20" />
            <p className="text-sm">{t("finance.treasury.clickToView")}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Yeni Hesap Modalı */}
      <NewAccountDialog
        open={newAccountModal}
        onClose={() => setNewAccountModal(false)}
        onSuccess={() => {
          setNewAccountModal(false);
          handleRefresh();
          showToast(t("finance.treasury.accountCreated"), true);
        }}
        onError={() => showToast(t("finance.treasury.accountFailed"), false)}
        t={t}
      />

      {/* Yeni Hareket Modalı */}
      <NewTransactionDialog
        account={newTxModal}
        accounts={accounts}
        open={!!newTxModal}
        onClose={() => setNewTxModal(null)}
        onSuccess={() => {
          setNewTxModal(null);
          handleTxRefresh();
          showToast(t("finance.treasury.movementSaved"), true);
        }}
        onError={() => showToast(t("finance.treasury.movementFailed"), false)}
        t={t}
      />

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border",
            toast.ok
              ? "bg-card border-border text-foreground"
              : "bg-destructive/10 border-destructive/30 text-destructive",
          )}
        >
          {toast.ok
            ? <Check className="h-4 w-4 text-primary" />
            : <AlertCircle className="h-4 w-4" />}
          {toast.text}
          <button onClick={() => setToast(null)} className="ml-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Hesap Satırı ─────────────────────────────────────────────────────────────

function AccountRow({
  account,
  isSelected,
  onClick,
  onAddTx,
  t,
}: {
  account:    TreasuryAccount;
  isSelected: boolean;
  onClick:    () => void;
  onAddTx:    () => void;
  t:          (key: string) => string;
}) {
  const isKasa   = account.accountType === "KASA";
  const balance  = Number(account.balanceKurus);

  return (
    <TableRow
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-colors group",
        isSelected ? "bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <TableCell className="py-3">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0 bg-primary/10 text-primary border-transparent"
          >
            {isKasa ? t("finance.treasury.kasa") : t("finance.treasury.banka")}
          </Badge>
          <span className="text-sm font-semibold text-foreground">{account.name}</span>
        </div>
        {account.bankName && (
          <p className="text-[11px] text-muted-foreground mt-0.5 pl-0.5">{account.bankName}</p>
        )}
      </TableCell>

      <TableCell className="text-sm text-muted-foreground w-20">
        {account.currency}
      </TableCell>

      <TableCell
        className={cn(
          "text-right text-sm font-bold tabular-nums py-3 w-44",
          balance < 0 ? "text-destructive" : "text-primary",
        )}
      >
        {formatCurrency(kurusToTl(balance))}
      </TableCell>

      <TableCell className="w-56 text-right py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onAddTx}>
            <Plus className="h-3 w-3" />
            {t("finance.treasury.movement")}
          </Button>
          <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-xs">
            <Link href={`/kasa-banka/${account.id}`}>
              <ExternalLink className="h-3 w-3" />
              {t("finance.treasury.detail")}
            </Link>
          </Button>
          {isSelected
            ? <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── İşlem Geçmişi Paneli ─────────────────────────────────────────────────────

function TransactionList({
  account,
  refreshKey,
  onAddTx,
  t,
}: {
  account:    TreasuryAccount;
  refreshKey: number;
  onAddTx:    () => void;
  t:          (key: string) => string;
}) {
  const [transactions, setTransactions] = useState<TreasuryTransaction[]>([]);
  const [total,        setTotal        ] = useState(0);
  const [loading,      setLoading      ] = useState(true);
  const [page,         setPage         ] = useState(1);
  const [fromDate,     setFromDate     ] = useState("");
  const [toDate,       setToDate       ] = useState("");
  const limit = 50;

  useEffect(() => {
    setPage(1);
  }, [account.id]);

  useEffect(() => {
    setLoading(true);
    treasuryApi.transactions
      .list(account.id, {
        limit,
        offset: (page - 1) * limit,
        fromDate: fromDate || undefined,
        toDate:   toDate   || undefined,
      })
      .then((r) => {
        const payload = r.data as { data: TreasuryTransaction[]; total: number };
        setTransactions(payload.data ?? []);
        setTotal(payload.total ?? 0);
      })
      .catch(() => { setTransactions([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [account.id, page, fromDate, toDate, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-4">
      {/* Filtreler */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{account.name}</span>
          <span>—</span>
          <span>{t("finance.treasury.movements")}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <DateInput
            className="h-8 w-36 text-sm"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <DateInput
            className="h-8 w-36 text-sm"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            onClick={onAddTx}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("finance.treasury.addMovement")}
          </Button>
        </div>
      </div>

      {/* Tablo */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="font-semibold">{t("finance.treasury.date")}</TableHead>
                  <TableHead className="font-semibold">{t("finance.treasury.movementType")}</TableHead>
                  <TableHead className="font-semibold">{t("finance.treasury.description")}</TableHead>
                  <TableHead className="text-right font-semibold">{t("finance.treasury.amount")}</TableHead>
                  <TableHead className="text-right font-semibold">{t("finance.treasury.balance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5} className="py-2">
                        <Skeleton className="h-7 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ArrowLeftRight className="h-6 w-6 opacity-20" />
                        <p className="text-sm">{t("finance.treasury.noMovements")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => {
                    const isIn = TX_IN_TYPES.includes(tx.transactionType as TransactionType);
                    return (
                      <TableRow key={tx.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-sm tabular-nums text-muted-foreground py-2.5">
                          {formatDate(tx.transactionDate)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className={isIn ? "text-primary" : "text-destructive"}>
                              {isIn
                                ? <ArrowDownLeft className="h-3 w-3" />
                                : <ArrowUpRight className="h-3 w-3" />}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {t(`finance.treasury.txTypes.${tx.transactionType}`)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] py-2.5">
                          <p className="truncate">{tx.description ?? "—"}</p>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-sm font-semibold tabular-nums py-2.5",
                            isIn ? "text-primary" : "text-destructive",
                          )}
                        >
                          {isIn ? "+" : "−"}{formatCurrency(kurusToTl(Number(tx.amountKurus)))}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground py-2.5">
                          {formatCurrency(kurusToTl(Number(tx.runningBalance)))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} {t("finance.treasury.totalMovements")}</span>
        <div className="flex items-center gap-4">
          <span>{page} / {pageCount}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Yeni Hesap Modalı ────────────────────────────────────────────────────────

function NewAccountDialog({
  open,
  onClose,
  onSuccess,
  onError,
  t,
}: {
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
  onError:   () => void;
  t:         (key: string) => string;
}) {
  const [form, setForm] = useState({
    name:         "",
    accountType:  "BANKA" as AccountType,
    currency:     "TRY",
    bankName:     "",
    iban:         "",
    bankAccountNo: "",
  });
  const [isPending, setIsPending] = useState(false);

  const set = <K extends keyof typeof form>(k: K) =>
    (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setIsPending(true);
    try {
      await treasuryApi.accounts.create({
        name:         form.name,
        accountType:  form.accountType,
        currency:     form.currency || "TRY",
        bankName:     form.bankName     || undefined,
        iban:         form.iban         || undefined,
        bankAccountNo: form.bankAccountNo || undefined,
      });
      onSuccess();
    } catch {
      onError();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            {t("finance.treasury.newAccount")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.treasury.accountName")} *
            </Label>
            <Input
              className="h-9"
              placeholder={t("finance.treasury.accountNamePlaceholder")}
              value={form.name}
              onChange={(e) => set("name")(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.treasury.accountType")}
              </Label>
              <Select value={form.accountType} onValueChange={set("accountType")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="KASA">{t("finance.treasury.kasa")}</SelectItem>
                  <SelectItem value="BANKA">{t("finance.treasury.banka")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.treasury.currencyLabel")}
              </Label>
              <Select value={form.currency} onValueChange={set("currency")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRY">TRY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.accountType === "BANKA" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("finance.treasury.bankName")}
                </Label>
                <Input
                  className="h-9"
                  placeholder={t("finance.treasury.bankNamePlaceholder")}
                  value={form.bankName}
                  onChange={(e) => set("bankName")(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("finance.treasury.iban")}
                </Label>
                <Input
                  className="h-9"
                  placeholder={t("finance.treasury.ibanPlaceholder")}
                  value={form.iban}
                  onChange={(e) => set("iban")(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("finance.treasury.cancel")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={isPending || !form.name}
            >
              {!isPending && <Check className="h-3.5 w-3.5" />}
              {t("finance.treasury.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Yeni Hareket Modalı ──────────────────────────────────────────────────────

function NewTransactionDialog({
  account,
  accounts,
  open,
  onClose,
  onSuccess,
  onError,
  t,
}: {
  account:   TreasuryAccount | null;
  accounts:  TreasuryAccount[];
  open:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
  onError:   () => void;
  t:         (key: string) => string;
}) {
  const [form, setForm] = useState({
    transactionType: "TAHSILAT" as TransactionType,
    amountInput:     "",
    transactionDate: new Date().toISOString().slice(0, 10),
    description:     "",
    targetAccountId: "",
  });
  const [isPending, setIsPending] = useState(false);

  const isTransfer   = form.transactionType === "TRANSFER";
  const otherAccounts = accounts.filter((a) => a.id !== account?.id);
  const isValid =
    form.amountInput &&
    parseFloat(form.amountInput.replace(",", ".")) > 0 &&
    (!isTransfer || form.targetAccountId);

  async function handleSave() {
    if (!account) return;
    setIsPending(true);
    try {
      await treasuryApi.transactions.create(account.id, {
        transactionType:  form.transactionType,
        amountKurus:      Math.round(parseFloat(form.amountInput.replace(",", ".")) * 100),
        transactionDate:  form.transactionDate,
        description:      form.description      || undefined,
        targetAccountId:  isTransfer ? form.targetAccountId : undefined,
      });
      onSuccess();
    } catch {
      onError();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
            {t("finance.treasury.newTransactionTitle")}
          </DialogTitle>
          {account && (
            <p className="text-xs text-muted-foreground pt-0.5">{account.name}</p>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.treasury.movementType")}
            </Label>
            <Select
              value={form.transactionType}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, transactionType: v as TransactionType }))
              }
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TX_TYPES.map((tx) => (
                  <SelectItem key={tx} value={tx}>
                    {t(`finance.treasury.txTypes.${tx}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isTransfer && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.treasury.targetAccount")} *
              </Label>
              <Select
                value={form.targetAccountId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, targetAccountId: v }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("finance.treasury.targetAccountPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {otherAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.treasury.amountInput")} *
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  ₺
                </span>
                <Input
                  className="h-9 pl-7"
                  placeholder={t("finance.treasury.amountPlaceholder")}
                  value={form.amountInput}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amountInput: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("finance.treasury.date")}
              </Label>
              <DateInput
                className="h-9"
                value={form.transactionDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transactionDate: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("finance.treasury.description")}
            </Label>
            <Input
              className="h-9"
              placeholder={t("finance.treasury.descriptionPlaceholder")}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("finance.treasury.cancel")}
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={isPending || !isValid}
            >
              {!isPending && <Check className="h-3.5 w-3.5" />}
              {t("finance.treasury.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

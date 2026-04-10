"use client";

export type {
  TreasuryAccount,
  TreasuryTransaction,
  AccountType,
  TransactionType,
  ReconciliationStatus,
} from "@/services/treasury";

export { TRANSACTION_TYPE_LABELS } from "@/services/treasury";

export interface KasaBankaKolonu {
  id: string;
  header: string;
  className?: string;
}

export function buildKasaBankaColumns(t: (k: string) => string): KasaBankaKolonu[] {
  return [
    { id: "account",  header: t("finance.treasury.account") },
    { id: "currency", header: t("finance.treasury.currency"), className: "w-20" },
    { id: "balance",  header: t("finance.treasury.balance"),  className: "text-right w-44" },
    { id: "actions",  header: "",                             className: "w-56" },
  ];
}

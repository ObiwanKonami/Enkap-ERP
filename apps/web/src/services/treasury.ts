/**
 * Treasury Service — Kasa & Banka Hesap Yönetimi
 * Port: 3013 | Proxy: /api/treasury/*
 */
import { apiClient } from '@/lib/api-client';

export type AccountType = 'KASA' | 'BANKA';

export type TransactionType =
  | 'TAHSILAT'
  | 'ODEME'
  | 'TRANSFER'
  | 'FAIZ_GELIRI'
  | 'BANKA_MASRAFI'
  | 'DIGER_GELIR'
  | 'DIGER_GIDER';

export type ReconciliationStatus = 'BEKLIYOR' | 'ESLESTI' | 'ESLESMEDI';

export interface TreasuryAccount {
  id:            string;
  tenantId:      string;
  name:          string;
  accountType:   AccountType;
  currency:      string;
  balanceKurus:  number;
  bankAccountNo?: string;
  iban?:         string;
  bankName?:     string;
  isActive:      boolean;
  createdAt:     string;
}

export interface TreasuryTransaction {
  id:                   string;
  accountId:            string;
  transactionType:      TransactionType;
  amountKurus:          number;
  direction:            'IN' | 'OUT';
  runningBalance:       number;
  transactionDate:      string;
  description?:         string;
  referenceType?:       string;
  referenceId?:         string;
  targetAccountId?:     string;
  reconciliationStatus: ReconciliationStatus;
  createdAt:            string;
}

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  TAHSILAT:      'Tahsilat',
  ODEME:         'Ödeme',
  TRANSFER:      'Transfer',
  FAIZ_GELIRI:   'Faiz Geliri',
  BANKA_MASRAFI: 'Banka Masrafı',
  DIGER_GELIR:   'Diğer Gelir',
  DIGER_GIDER:   'Diğer Gider',
};

export const treasuryApi = {
  accounts: {
    list: (params?: { page?: number; limit?: number }) =>
      apiClient.get<{ items: TreasuryAccount[]; total: number }>('/treasury/accounts', { params }),

    get: (id: string) =>
      apiClient.get<TreasuryAccount>(`/treasury/accounts/${id}`),

    create: (data: {
      name:         string;
      accountType:  AccountType;
      currency?:    string;
      bankAccountNo?: string;
      iban?:        string;
      bankName?:    string;
    }) => apiClient.post<TreasuryAccount>('/treasury/accounts', data),

    deactivate: (id: string) =>
      apiClient.delete(`/treasury/accounts/${id}`),

    balances: () =>
      apiClient.get<Array<{ currency: string; totalKurus: number }>>('/treasury/accounts/summary/balances'),
  },

  transactions: {
    list: (accountId: string, params?: {
      limit?:    number;
      offset?:   number;
      fromDate?: string;
      toDate?:   string;
    }) => apiClient.get<{ data: TreasuryTransaction[]; total: number }>(
      `/treasury/accounts/${accountId}/transactions`,
      { params },
    ),

    create: (accountId: string, data: {
      transactionType:  TransactionType;
      amountKurus:      number;
      transactionDate:  string;
      description?:     string;
      referenceType?:   string;
      referenceId?:     string;
      targetAccountId?: string;
    }) => apiClient.post<TreasuryTransaction>(
      `/treasury/accounts/${accountId}/transactions`,
      data,
    ),
  },
};

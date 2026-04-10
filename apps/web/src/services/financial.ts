/**
 * Financial Service — Fatura, AR/AP, Muhasebe, Raporlama, e-Defter, BA/BS
 * Port: 3003 | Proxy: /api/financial/*
 *
 * CURRENCY CONVENTION: All monetary amounts are stored as **kuruş** (Turkish Lira cents, integer).
 * DB: kuruş (integer) | Frontend: formatCurrency(kurusToTl(kurus)) | Transmission: always in kuruş
 */
import { apiClient } from '@/lib/api-client';
import type {
  InvoiceStatus,
  InvoiceType,
  InvoiceDirection,
  Invoice,
  InvoiceLine,
} from '@enkap/shared-types';

export type { InvoiceStatus, InvoiceType, InvoiceDirection, Invoice, InvoiceLine };

/**
 * Branded type: Amount in kuruş (Turkish Lira × 100).
 * Use with formatCurrency(kurusToTl(amount)) to display.
 * @example 123456 kuruş = 1234.56 TL
 */
export type AmountKurus = number & { readonly __brand: 'AmountKurus' };

/**
 * Branded type: Pagination count or record count (NOT money).
 * @example limit: 10, offset: 20, invoiceCount: 5
 */
export type Count = number & { readonly __brand: 'Count' };

export interface InvoiceListResponse {
  /** List of invoice records */
  data:   Invoice[];
  /** Total number of records matching query (pagination count, NOT money) */
  total:  Count;
  /** Records per page */
  limit:  Count;
  /** Starting record offset */
  offset: Count;
}

export interface AgingBucket {
  /** Aging bracket name */
  bucket:        'not_due' | '1_30' | '31_60' | '61_90' | '90_plus';
  /** Total amount in this bucket (kuruş) */
  totalAmount:   AmountKurus;
  /** Number of invoices in this bucket (count, NOT money) */
  invoiceCount:  Count;
}

export interface AgingSummary {
  /** Aging buckets (not_due, 1-30 days, 31-60 days, etc.) */
  buckets:     AgingBucket[];
  /** Grand total across all buckets (kuruş) */
  grandTotal:  AmountKurus;
  /** Currency code (e.g., 'TRY', 'USD') */
  currency:    string;
}

export interface AgingDetail {
  /** Customer/vendor ID */
  contactId:   string;
  /** Customer/vendor name */
  contactName: string;
  /** Aging breakdown by time period */
  buckets:     AgingBucket[];
  /** Total outstanding amount for this contact (kuruş) */
  total:       AmountKurus;
}

export interface PaymentPlan {
  id:           string;
  invoiceId:    string;
  installments: Installment[];
}

export interface Installment {
  /** Installment UUID */
  id:        string;
  /** Due date in ISO format (YYYY-MM-DD) */
  dueDate:   string;
  /** Installment amount (kuruş) */
  amount:    AmountKurus;
  /** Payment timestamp (ISO format) or null if not paid */
  paidAt:    string | null;
  /** Whether this installment has been paid */
  isPaid:    boolean;
}

export interface MizanAccount {
  /** Chart of accounts code (e.g., '100', '200', '300') */
  accountCode:  string;
  /** Account name (e.g., 'Cash', 'Accounts Receivable') */
  accountName:  string;
  /** Total debits for this account (kuruş) */
  debit:        AmountKurus;
  /** Total credits for this account (kuruş) */
  credit:       AmountKurus;
  /** Account balance: debit - credit (kuruş) */
  balance:      AmountKurus;
}

// ─── API Fonksiyonları ──────────────────────────────────────────────────────

export const financialApi = {

  // Fatura
  invoices: {
    list: (params?: {
      status?:    InvoiceStatus;
      direction?: InvoiceDirection;
      q?:         string;
      search?:    string;
      limit?:     number;
      page?:      number;
      offset?:    number;
    }) => apiClient.get<InvoiceListResponse>('/financial/invoices', { params }),

    get: (id: string) =>
      apiClient.get<Invoice>(`/financial/invoices/${id}`),

    create: (data: Partial<Invoice>) =>
      apiClient.post<Invoice>('/financial/invoices', data),

    bulkCreate: (invoices: Partial<Invoice>[]) =>
      apiClient.post<Invoice[]>('/financial/invoices/bulk', invoices),

    approve: (data: { invoiceId: string }) =>
      apiClient.post('/financial/invoices/approve', data),

    cancel: (data: { invoiceId: string; reason?: string }) =>
      apiClient.post('/financial/invoices/cancel', data),

    matchOrder: (invoiceId: string, data: { purchaseOrderId: string; waybillId?: string }) =>
      apiClient.post(`/financial/invoices/${invoiceId}/match-order`, data),
  },

  // AR/AP
  arAp: {
    receivablesSummary: () =>
      apiClient.get<AgingSummary>('/financial/ar-ap/aging/receivables/summary'),

    payablesSummary: () =>
      apiClient.get<AgingSummary>('/financial/ar-ap/aging/payables/summary'),

    receivablesDetail: () =>
      apiClient.get<AgingDetail[]>('/financial/ar-ap/aging/receivables/detail'),

    payablesDetail: () =>
      apiClient.get<AgingDetail[]>('/financial/ar-ap/aging/payables/detail'),

    reconciliation: (contactId: string) =>
      apiClient.get(`/financial/ar-ap/reconciliation-statement/${contactId}`),

    reconciliationPdf: (contactId: string) =>
      apiClient.get(`/financial/ar-ap/reconciliation-statement/${contactId}/pdf`, {
        responseType: 'blob',
      }),

    getPaymentPlan: (invoiceId: string) =>
      apiClient.get<PaymentPlan>(`/financial/ar-ap/payment-plans/invoice/${invoiceId}`),

    createPaymentPlan: (data: { invoiceId: string; installments: { dueDate: string; amount: AmountKurus }[] }) =>
      apiClient.post<PaymentPlan>('/financial/ar-ap/payment-plans', data),

    markInstallmentPaid: (id: string) =>
      apiClient.patch(`/financial/ar-ap/installments/${id}/pay`, {}),
  },

  // Muhasebe
  accounts: {
    mizan: () =>
      apiClient.get<{ accounts: MizanAccount[]; totalDebit: AmountKurus; totalCredit: AmountKurus }>('/financial/accounts/mizan'),

    bilanco: () =>
      apiClient.get('/financial/accounts/bilanco'),
  },

  // Raporlar (PDF/Excel indirme)
  reports: {
    invoicePdf:    (params?: Record<string, string>) =>
      apiClient.get('/financial/reports/fatura/pdf', { params, responseType: 'blob' }),

    invoiceExcel:  (params?: Record<string, string>) =>
      apiClient.get('/financial/reports/fatura/excel', { params, responseType: 'blob' }),

    mizanPdf:      () =>
      apiClient.get('/financial/reports/mizan/pdf', { responseType: 'blob' }),

    mizanExcel:    () =>
      apiClient.get('/financial/reports/mizan/excel', { responseType: 'blob' }),
  },

  // e-Defter
  edefter: {
    preview: () =>
      apiClient.get('/financial/edefter/onizle'),

    submit: (data: { year: number; month: number }) =>
      apiClient.post('/financial/edefter/gonder', data),
  },

  // BA/BS formları
  babs: {
    ba:    (year: number, month: number) =>
      apiClient.get(`/financial/babs/${year}/${month}/ba`),

    baXml: (year: number, month: number) =>
      apiClient.get(`/financial/babs/${year}/${month}/ba/xml`, { responseType: 'blob' }),

    bs:    (year: number, month: number) =>
      apiClient.get(`/financial/babs/${year}/${month}/bs`),

    bsXml: (year: number, month: number) =>
      apiClient.get(`/financial/babs/${year}/${month}/bs/xml`, { responseType: 'blob' }),
  },

  // e-Arşiv Raporlama
  archiveReports: {
    list: (params?: { from?: string; to?: string }) =>
      apiClient.get<ArchiveReportListResponse>('/financial/gib/archive-reports', { params }),

    retry: (reportId: string) =>
      apiClient.post(`/financial/gib/archive-reports/${reportId}/retry`, {}),
  },
};

export interface ArchiveReport {
  id: string;
  reportDate: string; // ISO date: YYYY-MM-DD
  invoiceCount: Count;
  status: 'SUCCESS' | 'FAILED';
  gibReferenceNumber: string | null;
  retryCount: Count;
  lastError: string | null;
  sentAt: string;
}

export interface ArchiveReportListResponse {
  data: ArchiveReport[];
  total: Count;
  limit: Count;
  offset: Count;
}

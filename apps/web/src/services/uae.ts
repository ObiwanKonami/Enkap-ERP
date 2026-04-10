/**
 * UAE Service — BAE FTA KDV Uyumu
 * Port: 3003 (financial-service) | Proxy: /api/financial/uae/*
 */
import { apiClient } from '@/lib/api-client';

export type UaeVatCategory = 'STANDARD' | 'ZERO' | 'EXEMPT';

export interface UaeVatLine {
  description:   string;
  quantity:      number;
  unitPrice:     number;
  vatCategory:   UaeVatCategory;
  vatRate:       number;
  lineTotal:     number;
  vatAmount:     number;
}

export interface UaeVatCalculation {
  subtotal:        number;
  standardVat:     number;
  totalVat:        number;
  grandTotal:      number;
  currency:        string;
  lines:           UaeVatLine[];
}

export interface UaeVatPeriodSummary {
  period:              string;
  standardRatedSales:  number;
  zeroRatedSales:      number;
  exemptSales:         number;
  totalVatCollected:   number;
  totalVatPaid:        number;
  netVatPayable:       number;
  currency:            string;
}

export interface TrnValidationResult {
  trn:       string;
  isValid:   boolean;
  errorMsg?: string;
}

export interface EinvoiceSubmissionResult {
  submissionId: string;
  status:       'ACCEPTED' | 'REJECTED' | 'PENDING';
  message?:     string;
  submittedAt:  string;
}

export const uaeApi = {
  validateTrn: (trn: string) =>
    apiClient.post<TrnValidationResult>('/financial/uae/trn/validate', { trn }),

  calculateVat: (data: {
    lines:    Array<{ description: string; quantity: number; unitPrice: number; vatCategory: UaeVatCategory }>;
    currency?: string;
  }) => apiClient.post<UaeVatCalculation>('/financial/uae/vat/calculate', data),

  periodSummary: (data: { year: number; month: number }) =>
    apiClient.post<UaeVatPeriodSummary>('/financial/uae/vat/period-summary', data),

  buildEinvoice: (invoiceId: string) =>
    apiClient.post<{ xml: string }>('/financial/uae/einvoice/build', { invoiceId }),

  submitEinvoice: (invoiceId: string) =>
    apiClient.post<EinvoiceSubmissionResult>('/financial/uae/einvoice/submit', { invoiceId }),

  getSubmissionStatus: (submissionId: string) =>
    apiClient.get<EinvoiceSubmissionResult>(`/financial/uae/einvoice/${submissionId}/status`),
};

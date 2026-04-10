/**
 * KSA Service — Suudi Arabistan ZATCA e-Fatura & Zakat
 * Port: 3003 (financial-service) | Proxy: /api/financial/ksa/*
 */
import { apiClient } from '@/lib/api-client';

export type ZatcaMode = 'B2B' | 'B2C';
export type ZatcaSubmissionStatus = 'REPORTED' | 'CLEARED' | 'REJECTED' | 'PENDING';

export interface ZatcaBuildResult {
  xml:        string;
  qrCode:     string;
  xmlHash:    string;
}

export interface ZatcaSubmissionResult {
  submissionId:  string;
  mode:          ZatcaMode;
  status:        ZatcaSubmissionStatus;
  message?:      string;
  warnings?:     string[];
  submittedAt:   string;
}

export interface ZakatResult {
  nisapAmount:   number;
  zakatBase:     number;
  zakatAmount:   number;
  zakatRate:     number;
  isAboveNisap:  boolean;
  currency:      string;
}

export interface CsrGenerationResult {
  csr:           string;
  instructions:  string;
}

export const ksaApi = {
  buildZatca: (invoiceId: string) =>
    apiClient.post<ZatcaBuildResult>('/financial/ksa/zatca/build', { invoiceId }),

  generateQr: (invoiceId: string) =>
    apiClient.post<{ qrCode: string }>('/financial/ksa/zatca/qr', { invoiceId }),

  hashInvoice: (invoiceId: string) =>
    apiClient.post<{ hash: string }>('/financial/ksa/zatca/hash', { invoiceId }),

  reportZatca: (invoiceId: string) =>
    apiClient.post<ZatcaSubmissionResult>('/financial/ksa/zatca/report', { invoiceId }),

  clearZatca: (invoiceId: string) =>
    apiClient.post<ZatcaSubmissionResult>('/financial/ksa/zatca/clear', { invoiceId }),

  getSubmission: (submissionId: string) =>
    apiClient.get<ZatcaSubmissionResult>(`/financial/ksa/zatca/${submissionId}`),

  calculateZakat: (data: { fiscalYear: number; totalAssets: number; currentLiabilities: number }) =>
    apiClient.post<ZakatResult>('/financial/ksa/zakat/calculate', data),

  generateCsr: (data: { commonName: string; organizationName: string; vatNumber: string }) =>
    apiClient.post<CsrGenerationResult>('/financial/ksa/zatca/csid/csr', data),
};

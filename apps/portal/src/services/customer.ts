/**
 * Müşteri Portal Servisleri
 * financial-service: /api/financial/portal/customer/*
 * Next.js rewrite: /api/financial/* → financial-service:3003/api/v1/*
 */
import { portalClient } from '@/lib/api-client';

export type CustomerInvoiceStatus = 'ODENDI' | 'BEKLIYOR' | 'VADESI_GECMIS';

export interface CustomerInvoice {
  id:           string;
  invoiceNo:    string;
  issueDate:    string;
  dueDate:      string;
  /** Kuruş cinsinden */
  amountKurus:  number;
  status:       CustomerInvoiceStatus;
  description:  string;
  pdfUrl?:      string;
}

export interface CustomerPayment {
  id:          string;
  date:        string;
  amount:      number;  // kuruş
  method:      string;  // 'HAVALE' | 'EFT' | 'KREDI_KARTI' | 'NAKIT'
  reference:   string;
  invoiceNo?:  string;
  note?:       string;
}

export interface CustomerStatement {
  period:            string;
  openingBalance:    number;
  totalInvoiced:     number;
  totalPaid:         number;
  closingBalance:    number;
  currency:          string;
  transactions:      Array<{
    date:    string;
    type:    'FATURA' | 'ODEME';
    ref:     string;
    amount:  number;
    balance: number;
  }>;
}

export const customerApi = {
  getInvoices: () =>
    portalClient.get<CustomerInvoice[]>('/api/financial/portal/customer/invoices'),

  getInvoicePdfUrl: (invoiceId: string) =>
    `/api/financial/portal/customer/invoices/${invoiceId}/pdf`,

  getPayments: () =>
    portalClient.get<CustomerPayment[]>('/api/financial/portal/customer/payments'),

  getStatement: (params?: { year?: number; month?: number }) =>
    portalClient.get<CustomerStatement>('/api/financial/portal/customer/statement', { params }),

  getSummary: () =>
    portalClient.get<{
      totalOutstanding:  number;
      totalOverdue:      number;
      lastPaymentDate?:  string;
      lastPaymentAmount?: number;
    }>('/api/financial/portal/customer/summary'),
};

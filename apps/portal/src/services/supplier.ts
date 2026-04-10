/**
 * Tedarikçi Portal Servisleri
 * purchase-service: /api/purchase/portal/supplier/*
 * financial-service: /api/financial/portal/supplier/*
 * Next.js rewrite: /api/purchase/* → purchase-service:3011/api/v1/*
 */
import { portalClient } from '@/lib/api-client';

export type PoStatus = 'TASLAK' | 'ONAY_BEKLIYOR' | 'ONAYLANDI' | 'TESLIM_EDILDI' | 'TAMAMLANDI' | 'IPTAL';

export interface PurchaseOrderLine {
  productName: string;
  quantity:    number;
  unitPrice:   number;  // kuruş
  unit:        string;
  total:       number;  // kuruş
}

export interface SupplierPurchaseOrder {
  id:           string;
  poNumber:     string;
  orderDate:    string;
  deliveryDate: string;
  status:       PoStatus;
  totalKurus:   number;
  lines:        PurchaseOrderLine[];
  note?:        string;
}

export interface SupplierInvoice {
  id:          string;
  invoiceNo:   string;
  issueDate:   string;
  dueDate:     string;
  amountKurus: number;
  status:      'ODENDI' | 'BEKLIYOR' | 'REDDEDILDI';
  poReference?: string;
}

export const supplierApi = {
  getPurchaseOrders: () =>
    portalClient.get<SupplierPurchaseOrder[]>('/api/purchase/portal/supplier/orders'),

  getPurchaseOrder: (id: string) =>
    portalClient.get<SupplierPurchaseOrder>(`/api/purchase/portal/supplier/orders/${id}`),

  confirmDelivery: (id: string, data: { deliveredDate: string; note?: string }) =>
    portalClient.post<{ success: boolean }>(`/api/purchase/portal/supplier/orders/${id}/confirm-delivery`, data),

  getInvoices: () =>
    portalClient.get<SupplierInvoice[]>('/api/financial/portal/supplier/invoices'),

  uploadInvoice: (poId: string, formData: FormData) =>
    portalClient.post<SupplierInvoice>(`/api/purchase/portal/supplier/orders/${poId}/invoice`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getSummary: () =>
    portalClient.get<{
      openOrders:     number;
      pendingInvoices: number;
      totalReceivable: number;
    }>('/api/purchase/portal/supplier/summary'),
};

/**
 * Purchase Service — Satın Alma (P2P)
 * Port: 3011 | Proxy: /api/purchase/*
 */
import { apiClient } from '@/lib/api-client';

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'received'
  | 'cancelled';

export interface PurchaseOrderLine {
  id:               string;
  productId:        string;
  productName:      string;
  sku?:             string;
  unitCode?:        string;
  quantity:         number;
  receivedQuantity: number;
  unitPriceKurus:   number;
  kdvRate:          number;
  lineTotalKurus:   number;
  kdvKurus:         number;
  warehouseId?:     string;
}

export interface PurchaseOrder {
  id:                    string;
  poNumber:              string;
  vendorId:              string;
  vendorName:            string;
  status:                PurchaseOrderStatus;
  orderDate:             string;
  expectedDeliveryDate?: string;
  subtotalKurus:         number;
  kdvKurus:              number;
  totalKurus:            number;
  notes?:                string;
  lines:                 PurchaseOrderLine[];
  createdAt:             string;
  approvedBy?:           string;
  approvedAt?:           string;
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft:     'Taslak',
  sent:      'Gönderildi',
  partial:   'Kısmi Teslim',
  received:  'Teslim Edildi',
  cancelled: 'İptal',
};

export const PURCHASE_STATUS_CLS: Record<PurchaseOrderStatus, string> = {
  draft:     'bg-slate-500/10 text-slate-400 border-slate-500/20',
  sent:      'bg-amber-500/10 text-amber-400 border-amber-500/20',
  partial:   'bg-violet-500/10 text-violet-400 border-violet-500/20',
  received:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const purchaseApi = {
  list: (params?: {
    status?:   string;
    vendorId?: string;
    limit?:    number;
    page?:     number;
    offset?:   number;
  }) => apiClient.get<{ data: PurchaseOrder[]; total: number }>('/purchase/purchase-orders', { params }),

  get: (id: string) =>
    apiClient.get<PurchaseOrder>(`/purchase/purchase-orders/${id}`),

  create: (data: {
    vendorId:              string;
    vendorName:            string;
    orderDate:             string;
    expectedDeliveryDate?: string;
    notes?:                string;
    lines: Array<{
      productId:     string;
      productName:   string;
      sku?:          string;
      quantity:      number;
      unitPriceKurus: number;
      kdvRate:       number;
      warehouseId?:  string;
    }>;
  }) => apiClient.post<PurchaseOrder>('/purchase/purchase-orders', data),

  submit:  (id: string) =>
    apiClient.patch<PurchaseOrder>(`/purchase/purchase-orders/${id}/submit`, {}),

  approve: (id: string) =>
    apiClient.patch<PurchaseOrder>(`/purchase/purchase-orders/${id}/approve`, {}),

  cancel:  (id: string) =>
    apiClient.patch<PurchaseOrder>(`/purchase/purchase-orders/${id}/cancel`, {}),

  goodsReceipt: (id: string, data: {
    items: Array<{
      productId:     string;
      productName:   string;
      warehouseId:   string;
      quantity:      number;
      unitCostKurus: number;
    }>;
    receiptDate: string;
    notes?:      string;
  }) => apiClient.post(`/purchase/purchase-orders/${id}/goods-receipt`, data),
};

/**
 * Logistics Service — Kargo / Lojistik
 * Port: 3004 (stock-service) | Proxy: /api/stock/logistics/*
 */
import { apiClient } from '@/lib/api-client';

export type CarrierCode = 'aras' | 'yurtici' | 'ptt';
export type PaymentType = 'sender' | 'recipient';

export type ShipmentStatus =
  | 'pending'
  | 'created'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned';

export interface Shipment {
  id:                    string;
  tenantId:              string;
  orderReference:        string;
  carrier:               CarrierCode;
  trackingNumber:        string | null;
  carrierShipmentId:     string | null;
  senderName:            string;
  senderAddress:         string;
  senderCity:            string;
  senderPhone:           string;
  recipientName:         string;
  recipientAddress:      string;
  recipientCity:         string;
  recipientDistrict:     string | null;
  recipientPhone:        string;
  recipientEmail:        string | null;
  weightKg:              number;
  desi:                  number | null;
  paymentType:           PaymentType;
  status:                ShipmentStatus;
  statusDescription:     string | null;
  estimatedDeliveryDate: string | null;
  deliveredAt:           string | null;
  lastCheckedAt:         string | null;
  createdAt:             string;
  updatedAt:             string;
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending:           'Bekliyor',
  created:           'Oluşturuldu',
  in_transit:        'Kargoda',
  out_for_delivery:  'Dağıtımda',
  delivered:         'Teslim Edildi',
  failed:            'Teslim Başarısız',
  returned:          'İade',
};

export const SHIPMENT_STATUS_CLS: Record<ShipmentStatus, string> = {
  pending:           'text-slate-400 bg-slate-500/10 border-slate-500/30',
  created:           'text-sky-400 bg-sky-500/10 border-sky-500/30',
  in_transit:        'text-amber-400 bg-amber-500/10 border-amber-500/30',
  out_for_delivery:  'text-violet-400 bg-violet-500/10 border-violet-500/30',
  delivered:         'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  failed:            'text-rose-400 bg-rose-500/10 border-rose-500/30',
  returned:          'text-orange-400 bg-orange-500/10 border-orange-500/30',
};

export const CARRIER_LABELS: Record<CarrierCode, string> = {
  aras:    'Aras Kargo',
  yurtici: 'Yurtiçi Kargo',
  ptt:     'PTT Kargo',
};

export const logisticsApi = {
  list: (params?: { status?: string; carrier?: string; limit?: number; offset?: number }) =>
    apiClient.get<{ data: Shipment[]; total: number }>('/stock/logistics/shipments', { params }),

  get: (id: string) =>
    apiClient.get<Shipment>(`/stock/logistics/shipments/${id}`),

  create: (data: {
    orderReference:    string;
    carrier:           CarrierCode;
    paymentType:       PaymentType;
    senderName:        string;
    senderAddress:     string;
    senderCity:        string;
    senderPhone:       string;
    recipientName:     string;
    recipientAddress:  string;
    recipientCity:     string;
    recipientDistrict?: string;
    recipientPhone:    string;
    recipientEmail?:   string;
    weightKg:          number;
    desi?:             number;
  }) => apiClient.post<Shipment>('/stock/logistics/shipments', data),

  track: (id: string) =>
    apiClient.post<Shipment>(`/stock/logistics/shipments/${id}/track`, {}),

  getLabelUrl: (id: string) =>
    `/api/stock/logistics/shipments/${id}/label`,

  trackByNumber: (trackingNo: string) =>
    apiClient.get<Shipment>(`/stock/logistics/track/${trackingNo}`),
};

import { apiClient } from '@/lib/api-client';
import type { WaybillType, WaybillStatus } from '@enkap/shared-types';

export type { WaybillType, WaybillStatus };

export interface WaybillLine {
  id:                  string;
  productId?:          string;
  productName:         string;
  sku?:                string;
  unitCode:            string;
  quantity:            number;
  warehouseId?:        string;
  targetWarehouseId?:  string;
  lotNumber?:          string;
  serialNumber?:       string;
}

export interface Waybill {
  id:              string;
  waybillNumber:   string;
  type:            WaybillType;
  status:          WaybillStatus;
  shipDate:        string;
  deliveryDate?:   string;
  senderName:      string;
  senderVkn?:      string;
  senderAddress?:  string;
  receiverName:    string;
  receiverVknTckn?: string;
  receiverAddress?: string;
  vehiclePlate?:   string;
  driverName?:     string;
  carrierName?:    string;
  trackingNumber?: string;
  gibUuid?:        string;
  gibStatusCode?:  string;
  gibStatusDesc?:  string;
  gibSentAt?:      string;
  gibResponseAt?:  string;
  refType?:        string;
  refId?:          string;
  refNumber?:      string;
  returnDirection?: 'MUSTERIDEN' | 'TEDARIKCIYE';
  notes?:          string;
  createdAt:       string;
  lines:           WaybillLine[];
}

export interface CreateWaybillLineDto {
  productId?:         string;
  productName:        string;
  sku?:               string;
  unitCode?:          string;
  quantity:           number;
  warehouseId?:       string;
  targetWarehouseId?: string;
  lotNumber?:         string;
  serialNumber?:      string;
  movementId?:        string;
}

export interface CreateWaybillDto {
  type:             WaybillType;
  shipDate:         string;
  deliveryDate?:    string;
  senderName:       string;
  senderVkn?:       string;
  senderAddress?:   string;
  receiverName:     string;
  receiverVknTckn?: string;
  receiverAddress?: string;
  vehiclePlate?:    string;
  driverName?:      string;
  driverTckn?:      string;
  carrierName?:     string;
  trackingNumber?:  string;
  refType?:         string;
  refId?:           string;
  refNumber?:       string;
  returnDirection?: 'MUSTERIDEN' | 'TEDARIKCIYE';
  notes?:           string;
  lines:            CreateWaybillLineDto[];
}

export const waybillApi = {
  list: (params?: {
    type?:   WaybillType;
    status?: WaybillStatus;
    refId?:  string;
    limit?:  number;
    offset?: number;
  }) =>
    apiClient.get<{ data: Waybill[]; total: number }>('/waybill/waybills', { params }),

  get: (id: string) =>
    apiClient.get<Waybill>(`/waybill/waybills/${id}`),

  create: (dto: CreateWaybillDto) =>
    apiClient.post<Waybill>('/waybill/waybills', dto),

  update: (id: string, dto: Partial<CreateWaybillDto>) =>
    apiClient.patch<Waybill>(`/waybill/waybills/${id}`, dto),

  approve: (id: string) =>
    apiClient.post<Waybill>(`/waybill/waybills/${id}/approve`),

  sendGib: (id: string) =>
    apiClient.post<Waybill>(`/waybill/waybills/${id}/send-gib`),

  cancel: (id: string, reason?: string) =>
    apiClient.post<Waybill>(`/waybill/waybills/${id}/cancel`, { reason }),

  /** PDF blob olarak indir */
  downloadPdf: async (id: string, waybillNumber: string): Promise<void> => {
    const res = await apiClient.get(`/waybill/waybills/${id}/pdf`, {
      responseType: 'blob',
    });
    const url  = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${waybillNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  },

  /** XML olarak indir */
  downloadXml: async (id: string, waybillNumber: string): Promise<void> => {
    const res = await apiClient.get(`/waybill/waybills/${id}/xml`, {
      responseType: 'blob',
    });
    const url  = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/xml' }));
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${waybillNumber}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const WAYBILL_TYPE_LABELS: Record<WaybillType, string> = {
  SATIS:    'Satış İrsaliyesi',
  ALIS:     'Alış İrsaliyesi',
  TRANSFER: 'Transfer İrsaliyesi',
  IADE:     'İade İrsaliyesi',
};

export const WAYBILL_STATUS_LABELS: Record<WaybillStatus, string> = {
  TASLAK:          'Taslak',
  ONAYLANDI:       'Onaylandı',
  GIB_KUYRUKTA:   'GİB Kuyruğunda',
  GIB_GONDERILDI: 'GİB\'e Gönderildi',
  GIB_ONAYLANDI:  'GİB Onayladı',
  GIB_REDDEDILDI: 'GİB Reddetti',
  IPTAL:           'İptal',
};

export const WAYBILL_STATUS_COLORS: Record<WaybillStatus, string> = {
  TASLAK:          '#64748B',
  ONAYLANDI:       '#0EA5E9',
  GIB_KUYRUKTA:   '#F59E0B',
  GIB_GONDERILDI: '#8B5CF6',
  GIB_ONAYLANDI:  '#10B981',
  GIB_REDDEDILDI: '#EF4444',
  IPTAL:           '#475569',
};

export const WAYBILL_STATUS_VARIANTS: Record<WaybillStatus, "outline" | "secondary" | "default" | "destructive"> = {
  TASLAK:          'outline',
  ONAYLANDI:       'secondary',
  GIB_KUYRUKTA:   'secondary',
  GIB_GONDERILDI: 'secondary',
  GIB_ONAYLANDI:  'default',
  GIB_REDDEDILDI: 'destructive',
  IPTAL:           'outline',
};

export const WAYBILL_TYPE_VARIANTS: Record<WaybillType, "outline" | "secondary" | "default"> = {
  SATIS:    'secondary',
  ALIS:     'secondary',
  TRANSFER: 'secondary',
  IADE:     'secondary',
};

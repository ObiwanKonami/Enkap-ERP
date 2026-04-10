import { apiClient } from '@/lib/api-client';

/* ─── BOM Types ───────────────────────────────────────────────── */
export interface BomLine {
  id:            string;
  materialId:    string;
  materialName:  string;
  sku?:          string;
  quantity:      number;
  scrapRate:     number;
  warehouseId?:  string;
  unitOfMeasure: string;
}

export interface Bom {
  id:          string;
  productId:   string;
  productName: string;
  revisionNo:  string;
  description?: string;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  lines:       BomLine[];
}

/* ─── Work Order Types ────────────────────────────────────────── */
export type WorkOrderStatus =
  | 'TASLAK'
  | 'PLANLI'
  | 'URETIMDE'
  | 'TAMAMLANDI'
  | 'IPTAL';

export interface WorkOrderOperation {
  id:                     string;
  sequence:               number;
  operationName:          string;
  workCenter?:            string;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number;
  status:                 'BEKLIYOR' | 'DEVAM' | 'TAMAMLANDI';
  completedAt?:           string;
}

export interface WorkOrder {
  id:                string;
  woNumber:          string;
  bomId:             string;
  productId:         string;
  productName:       string;
  targetQuantity:    number;
  producedQuantity:  number;
  status:            WorkOrderStatus;
  plannedStartDate:  string;
  plannedEndDate:    string;
  actualStartDate?:  string;
  actualEndDate?:    string;
  warehouseId?:      string;
  notes?:            string;
  createdBy:         string;
  createdAt:         string;
  updatedAt:         string;
  operations:        WorkOrderOperation[];
}

/* ─── MRP Types ───────────────────────────────────────────────── */
export interface MaterialRequirement {
  materialId:       string;
  materialName:     string;
  sku?:             string;
  requiredQuantity: number;
  warehouseId?:     string;
}

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  TASLAK:     'Taslak',
  PLANLI:     'Planlandı',
  URETIMDE:   'Üretimde',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL:      'İptal',
};

export const WO_STATUS_CLS: Record<WorkOrderStatus, string> = {
  TASLAK:     'badge-gray',
  PLANLI:     'badge-blue',
  URETIMDE:   'badge-yellow',
  TAMAMLANDI: 'badge-green',
  IPTAL:      'badge-red',
};

/* ─── API ─────────────────────────────────────────────────────── */
export const manufacturingApi = {
  bom: {
    list: (productId?: string) =>
      apiClient.get<{ data: Bom[]; total: number }>('/manufacturing/bom', { params: { productId } }),
    get: (id: string) => apiClient.get<Bom>(`/manufacturing/bom/${id}`),
    create: (dto: unknown) => apiClient.post<Bom>('/manufacturing/bom', dto),
    update: (id: string, dto: unknown) => apiClient.patch<Bom>(`/manufacturing/bom/${id}`, dto),
    deactivate: (id: string) => apiClient.post<Bom>(`/manufacturing/bom/${id}/deactivate`, {}),
  },

  workOrder: {
    list: (params?: { status?: string; limit?: number; offset?: number }) =>
      apiClient.get<{ data: WorkOrder[]; total: number }>('/manufacturing/work-orders', { params }),
    get: (id: string) => apiClient.get<WorkOrder>(`/manufacturing/work-orders/${id}`),
    create: (dto: unknown) => apiClient.post<WorkOrder>('/manufacturing/work-orders', dto),
    confirm:  (id: string) => apiClient.patch<WorkOrder>(`/manufacturing/work-orders/${id}/confirm`, {}),
    start:    (id: string) => apiClient.patch<WorkOrder>(`/manufacturing/work-orders/${id}/start`, {}),
    complete: (id: string, producedQty: number, notes?: string) =>
      apiClient.patch<WorkOrder>(`/manufacturing/work-orders/${id}/complete`, { producedQuantity: producedQty, notes }),
    cancel:   (id: string) => apiClient.patch<WorkOrder>(`/manufacturing/work-orders/${id}/cancel`, {}),
  },

  mrp: {
    requirements: (bomId: string, quantity: number) =>
      apiClient.get<MaterialRequirement[]>('/manufacturing/mrp/requirements', { params: { bomId, quantity } }),
  },
};

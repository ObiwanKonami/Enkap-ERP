
export type ProjectStatus = 'AKTIF' | 'BEKLEMEDE' | 'TAMAMLANDI' | 'IPTAL';
export type CostType = 'ISGUCU' | 'MALZEME' | 'GENEL_GIDER' | 'SEYAHAT' | 'DIGER';
export type TaskStatus = 'YAPILACAK' | 'DEVAM' | 'TAMAMLANDI' | 'IPTAL';

export interface Project {
  id:              string;
  projectCode:     string;
  name:            string;
  description?:    string;
  customerId?:     string;
  customerName?:   string;
  status:          ProjectStatus;
  startDate:       string;
  endDate?:        string;
  budgetKurus:     number;
  actualCostKurus: number;
  revenueKurus:    number;
  currency:        string;
  notes?:          string;
  createdAt:       string;
  updatedAt:       string;
}

export interface ProjectTask {
  id:               string;
  projectId:        string;
  parentTaskId?:    string;
  taskCode:         string;
  name:             string;
  status:           TaskStatus;
  plannedStartDate?: string;
  plannedEndDate?:   string;
  actualStartDate?:  string;
  actualEndDate?:    string;
  plannedHours:      number;
  actualHours:       number;
  assignedTo?:       string;
  sortOrder:         number;
}

export interface ProjectCost {
  id:             string;
  projectId:      string;
  taskId?:        string;
  costType:       CostType;
  description:    string;
  costDate:       string;
  amountKurus:    number;
  referenceType?: string;
  referenceId?:   string;
  createdAt:      string;
}

export interface ProjectPnL {
  budget:        number;
  actualCost:    number;
  revenue:       number;
  grossProfit:   number;
  profitMargin:  number;
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  AKTIF:      'Aktif',
  BEKLEMEDE:  'Beklemede',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL:      'İptal',
};

export const COST_TYPE_LABELS: Record<CostType, string> = {
  ISGUCU:      'İş Gücü',
  MALZEME:     'Malzeme',
  GENEL_GIDER: 'Genel Gider',
  SEYAHAT:     'Seyahat',
  DIGER:       'Diğer',
};

import { apiClient } from '@/lib/api-client';

export const projectApi = {
  list: (params?: { status?: string; customerId?: string; limit?: number; offset?: number }) =>
    apiClient.get<{ data: Project[]; total: number }>('/financial/projects', { params }),
  get: (id: string) => apiClient.get<Project>(`/financial/projects/${id}`),
  create: (dto: unknown) => apiClient.post<Project>('/financial/projects', dto),
  update: (id: string, dto: unknown) => apiClient.patch<Project>(`/financial/projects/${id}`, dto),
  close:  (id: string) => apiClient.post<Project>(`/financial/projects/${id}/close`, {}),
  cancel: (id: string) => apiClient.post<Project>(`/financial/projects/${id}/cancel`, {}),
  addCost: (id: string, dto: unknown) => apiClient.post<ProjectCost>(`/financial/projects/${id}/costs`, dto),
  getPnL:  (id: string) => apiClient.get<ProjectPnL>(`/financial/projects/${id}/pnl`),
};

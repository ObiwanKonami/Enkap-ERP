import { apiClient } from '@/lib/api-client';

export interface Budget {
  id:          string;
  year:        number;
  version:     string;
  name:        string;
  isApproved:  boolean;
  approvedBy?: string;
  approvedAt?: string;
  notes?:      string;
  createdAt:   string;
  updatedAt:   string;
}

export interface BudgetLine {
  id:               string;
  budgetId:         string;
  accountCode:      string;
  accountName:      string;
  jan: number; feb: number; mar: number; apr: number;
  may: number; jun: number; jul: number; aug: number;
  sep: number; oct: number; nov: number; dec: number;
  annualTotalKurus: number;
}

export interface VarianceLine {
  accountCode:  string;
  accountName:  string;
  planned:      number;
  actual:       number;
  variance:     number;
  variancePct:  number;
}

export interface VarianceReport {
  lines:        VarianceLine[];
  totalPlanned: number;
  totalActual:  number;
}

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;
export type MonthKey = typeof MONTHS[number];
export const MONTH_LABELS: Record<MonthKey, string> = {
  jan: 'Oca', feb: 'Şub', mar: 'Mar', apr: 'Nis',
  may: 'May', jun: 'Haz', jul: 'Tem', aug: 'Ağu',
  sep: 'Eyl', oct: 'Eki', nov: 'Kas', dec: 'Ara',
};
export { MONTHS };

export const budgetApi = {
  list: (params?: { year?: number; limit?: number; offset?: number }) =>
    apiClient.get<{ data: Budget[]; total: number }>('/financial/budgets', { params }),
  get:     (id: string) => apiClient.get<Budget>(`/financial/budgets/${id}`),
  create:  (dto: unknown) => apiClient.post<Budget>('/financial/budgets', dto),
  upsertLine: (id: string, dto: unknown) => apiClient.post<BudgetLine>(`/financial/budgets/${id}/lines`, dto),
  approve: (id: string) => apiClient.post<Budget>(`/financial/budgets/${id}/approve`, {}),
  variance: (id: string, month?: number) =>
    apiClient.get<VarianceReport>(`/financial/budgets/${id}/variance`, { params: { month } }),
  forecast: (id: string) => apiClient.get<unknown>(`/financial/budgets/${id}/forecast`),
};

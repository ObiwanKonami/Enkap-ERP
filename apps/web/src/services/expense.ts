import { apiClient } from '@/lib/api-client';

export type ExpenseStatus =
  | 'TASLAK'
  | 'ONAY_BEKLIYOR'
  | 'ONAYLANDI'
  | 'REDDEDILDI'
  | 'ODENDI';

export type ExpenseCategory =
  | 'YEMEK'
  | 'ULASIM'
  | 'YAKIT'
  | 'KONAKLAMA'
  | 'TEMSIL'
  | 'KIRTASIYE'
  | 'TEKNIK'
  | 'EGITIM'
  | 'DIGER';

export interface ExpenseLine {
  id:          string;
  reportId:    string;
  category:    ExpenseCategory;
  description: string;
  expenseDate: string;
  amountKurus: number;
  kdvKurus:    number;
  receiptUrl?: string;
  notes?:      string;
}

export interface ExpenseReport {
  id:               string;
  employeeId:       string;
  employeeName:     string;
  period:           string; // YYYY-MM
  status:           ExpenseStatus;
  totalKurus:       number;
  currency:         string;
  notes?:           string;
  submittedAt?:     string;
  approvedBy?:      string;
  approvedAt?:      string;
  rejectedReason?:  string;
  paidAt?:          string;
  createdAt:        string;
  updatedAt:        string;
  lines:            ExpenseLine[];
}

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  TASLAK:         'Taslak',
  ONAY_BEKLIYOR:  'Onay Bekliyor',
  ONAYLANDI:      'Onaylandı',
  REDDEDILDI:     'Reddedildi',
  ODENDI:         'Ödendi',
};

export const EXPENSE_STATUS_VARIANTS: Record<ExpenseStatus, "outline" | "secondary" | "default" | "destructive"> = {
  TASLAK:        'outline',
  ONAY_BEKLIYOR: 'secondary',
  ONAYLANDI:     'default',
  REDDEDILDI:    'destructive',
  ODENDI:        'default',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  YEMEK:      'Yemek',
  ULASIM:     'Ulaşım',
  YAKIT:      'Yakıt',
  KONAKLAMA:  'Konaklama',
  TEMSIL:     'Temsil',
  KIRTASIYE:  'Kırtasiye',
  TEKNIK:     'Teknik',
  EGITIM:     'Eğitim',
  DIGER:      'Diğer',
};

export const expenseApi = {
  list: (params?: { status?: string; employeeId?: string; period?: string; limit?: number; offset?: number }) =>
    apiClient.get<{ data: ExpenseReport[]; total: number }>('/hr/expenses', { params }),
  get:      (id: string) => apiClient.get<ExpenseReport>(`/hr/expenses/${id}`),
  create:   (dto: unknown) => apiClient.post<ExpenseReport>('/hr/expenses', dto),
  submit:   (id: string) => apiClient.post<ExpenseReport>(`/hr/expenses/${id}/submit`, {}),
  approve:  (id: string) => apiClient.post<ExpenseReport>(`/hr/expenses/${id}/approve`, {}),
  reject:   (id: string, reason: string) =>
    apiClient.post<ExpenseReport>(`/hr/expenses/${id}/reject`, { reason }),
  pay:      (id: string) => apiClient.post<ExpenseReport>(`/hr/expenses/${id}/pay`, {}),
};

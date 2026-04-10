/**
 * BI Service — İş Zekası & Özel Raporlama
 * Port: 3010 (analytics-service) | Proxy: /api/analytics/bi/*
 */
import { apiClient } from '@/lib/api-client';

export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'table' | 'metric';
export type ReportFormat = 'pdf' | 'excel';
export type DataSource = 'financial' | 'stock' | 'hr' | 'crm' | 'purchase' | 'order';

export interface ReportDefinition {
  id:              string;
  tenantId:        string;
  name:            string;
  description?:    string;
  query_template:  string;
  parameters:      Array<{ name: string; type: 'string' | 'number' | 'date'; label: string }>;
  chart_type?:     ChartType;
  data_source?:    DataSource;
  cronSchedule?:   string;
  scheduleEmail?:  string;
  scheduleFormat?: ReportFormat;
  shareToken?:     string;
  createdBy:       string;
  createdAt:       string;
  updatedAt:       string;
}

export interface Dashboard {
  id:          string;
  tenantId:    string;
  name:        string;
  description?: string;
  isDefault:   boolean;
  layout:      Array<{ widgetId: string; x: number; y: number; w: number; h: number }>;
  createdAt:   string;
  updatedAt:   string;
  widgets?:    Widget[];
}

export interface Widget {
  id:               string;
  dashboardId:      string;
  reportDefinitionId: string;
  title:            string;
  chartType:        ChartType;
  xAxisField?:      string;
  yAxisField?:      string;
  parameters?:      Record<string, unknown>;
  refreshMinutes:   number;
  createdAt:        string;
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar:    'Çubuk Grafik',
  line:   'Çizgi Grafik',
  pie:    'Pasta Grafik',
  area:   'Alan Grafik',
  table:  'Tablo',
  metric: 'Sayı',
};

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  financial: 'Finansal',
  stock:     'Stok',
  hr:        'İK',
  crm:       'CRM',
  purchase:  'Satın Alma',
  order:     'Sipariş',
};

export const biApi = {
  reports: {
    list: () =>
      apiClient.get<{ data: ReportDefinition[]; total: number }>('/analytics/bi/reports'),
    get: (id: string) =>
      apiClient.get<ReportDefinition>(`/analytics/bi/reports/${id}`),
    create: (data: { name: string; description?: string; query_template: string; parameters: ReportDefinition['parameters']; chart_type?: ChartType; data_source: DataSource }) =>
      apiClient.post<ReportDefinition>('/analytics/bi/reports', data),
    update: (id: string, data: Partial<Pick<ReportDefinition, 'name' | 'description' | 'query_template' | 'parameters'>>) =>
      apiClient.patch<ReportDefinition>(`/analytics/bi/reports/${id}`, data),
    delete: (id: string) =>
      apiClient.delete(`/analytics/bi/reports/${id}`),
    execute: (id: string, params?: Record<string, unknown>) =>
      apiClient.post<{ columns: string[]; rows: unknown[][] }>(`/analytics/bi/reports/${id}/execute`, { parameters: params ?? {} })
        .then(r => r.data),
    schedule: (id: string, data: { cronSchedule: string; email: string; format: ReportFormat }) =>
      apiClient.post(`/analytics/bi/reports/${id}/schedule`, data),
    deleteSchedule: (id: string) =>
      apiClient.delete(`/analytics/bi/reports/${id}/schedule`),
    share: (id: string) =>
      apiClient.post<{ token: string; url: string }>(`/analytics/bi/reports/${id}/share`, {}),
  },

  dashboards: {
    list: () =>
      apiClient.get<{ data: Dashboard[]; total: number }>('/analytics/bi/dashboards'),
    get: (id: string) =>
      apiClient.get<Dashboard>(`/analytics/bi/dashboards/${id}`),
    create: (data: { name: string; description?: string; isDefault?: boolean }) =>
      apiClient.post<Dashboard>('/analytics/bi/dashboards', data),
    update: (id: string, data: Partial<Pick<Dashboard, 'name' | 'description' | 'isDefault' | 'layout'>>) =>
      apiClient.patch<Dashboard>(`/analytics/bi/dashboards/${id}`, data),
    delete: (id: string) =>
      apiClient.delete(`/analytics/bi/dashboards/${id}`),
    addWidget: (dashboardId: string, data: {
      reportDefinitionId: string;
      title:              string;
      chartType:          ChartType;
      xAxisField?:        string;
      yAxisField?:        string;
      parameters?:        Record<string, unknown>;
      refreshMinutes?:    number;
    }) => apiClient.post<Widget>(`/analytics/bi/dashboards/${dashboardId}/widgets`, data),
    deleteWidget: (dashboardId: string, widgetId: string) =>
      apiClient.delete(`/analytics/bi/dashboards/${dashboardId}/widgets/${widgetId}`),
  },
};

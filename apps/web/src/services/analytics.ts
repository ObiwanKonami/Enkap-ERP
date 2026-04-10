/**
 * Analytics Service — Platform Metrikleri (Admin)
 * Port: 3010 | Proxy: /api/analytics/*
 */
import { apiClient } from '@/lib/api-client';

export interface PlatformOverview {
  totalTenants:     number;
  activeTenants:    number;
  mrr:              number;
  arr:              number;
  churnRate:        number;
  avgSessionsPerDay: number;
}

export interface FeatureAdoption {
  feature:    string;
  usageCount: number;
  tenantCount: number;
  adoptionRate: number;
}

export interface TenantLeaderboard {
  tenantId:   string;
  tenantSlug: string;
  score:      number;
  sessions:   number;
}

export interface CohortRetention {
  cohortMonth:  string;
  month0:       number;
  month1:       number;
  month2:       number;
  month3:       number;
  month6:       number;
  month12:      number;
}

export const analyticsApi = {
  overview: () =>
    apiClient.get<PlatformOverview>('/analytics/admin/overview'),

  featureAdoption: () =>
    apiClient.get<FeatureAdoption[]>('/analytics/admin/feature-adoption'),

  leaderboard: () =>
    apiClient.get<TenantLeaderboard[]>('/analytics/admin/leaderboard'),

  cohortRetention: () =>
    apiClient.get<CohortRetention[]>('/analytics/admin/cohort-retention'),

  tenantHistory: (tenantId: string, days?: number) =>
    apiClient.get(`/analytics/admin/tenants/${tenantId}/history`, { params: { days } }),

  collectMetrics: () =>
    apiClient.post('/analytics/admin/collect-metrics', {}),
};

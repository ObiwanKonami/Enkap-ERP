import { apiClient } from '@/lib/api-client';

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'deprovisioning';
export type TenantTier   = 'starter' | 'business' | 'enterprise';

export interface TenantListItem {
  tenantId:       string;
  tenantSlug:     string;
  tier:           TenantTier;
  status:         TenantStatus;
  schemaName:     string;
  companyName:    string | null;
  city:           string | null;
  vkn:            string | null;
  onboardingDone: boolean;
  createdAt:      string;
}

export interface TenantDetail extends TenantListItem {
  email:          string | null;
  phone:          string | null;
  address:        string | null;
  invoicePrefix:  string | null;
  onboardingStep: string | null;
  provisionLog:   { step: string; status: string; createdAt: string }[];
}

export interface PlatformOverview {
  totalTenants:      number;
  activeTenants:     number;
  provisioningCount: number;
  suspendedCount:    number;
  mrrKurus:          number;
  newThisMonth:      number;
  mrrTrend:          { month: string; mrr: number }[];
  activeTrend:       { month: string; count: number }[];
}

export interface FeatureAdoption {
  feature:     string;
  usedCount:   number;
  totalCount:  number;
  adoptionPct: number;
}

export const adminApi = {
  // Tenant listesi ve yönetimi (tenant-service)
  tenants: {
    list: () =>
      apiClient.get<{ data: TenantListItem[]; total: number }>('/tenant/admin/tenants'),
    get: (tenantId: string) =>
      apiClient.get<TenantDetail>(`/tenant/admin/tenants/${tenantId}`),
    setStatus: (tenantId: string, status: 'active' | 'suspended') =>
      apiClient.patch<{ tenantId: string; status: string }>(`/tenant/admin/tenants/${tenantId}/status`, { status }),
    setTier: (tenantId: string, tier: TenantTier) =>
      apiClient.patch<{ tenantId: string; tier: string }>(`/tenant/admin/tenants/${tenantId}/tier`, { tier }),
  },

  // Platform metrikleri (analytics-service)
  metrics: {
    overview: () =>
      apiClient.get<PlatformOverview>('/analytics/admin/overview'),
    featureAdoption: () =>
      apiClient.get<FeatureAdoption[]>('/analytics/admin/feature-adoption'),
    leaderboard: (limit = 10) =>
      apiClient.get<{ tenantId: string; tenantSlug: string; invoiceCount: number; userCount: number }[]>(
        `/analytics/admin/leaderboard?limit=${limit}`,
      ),
  },
};

// ─── Yardımcı sabitler ────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<TenantStatus, string> = {
  provisioning:   'Hazırlanıyor',
  active:         'Aktif',
  suspended:      'Askıda',
  deprovisioning: 'Siliniyor',
};

export const STATUS_CLS: Record<TenantStatus, string> = {
  provisioning:   'badge-yellow',
  active:         'badge-green',
  suspended:      'badge-red',
  deprovisioning: 'badge-gray',
};

export const TIER_LABELS: Record<TenantTier, string> = {
  starter:    'Starter',
  business:   'Business',
  enterprise: 'Enterprise',
};

export const TIER_CLS: Record<TenantTier, string> = {
  starter:    'badge-gray',
  business:   'badge-blue',
  enterprise: 'badge-purple',
};

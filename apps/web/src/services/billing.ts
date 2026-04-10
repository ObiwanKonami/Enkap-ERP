/**
 * Billing Service — Abonelik, Plan Yönetimi
 * Port: 3008 | Proxy: /api/billing/*
 */
import { apiClient } from '@/lib/api-client';
import type { BillingPlan, BillingPlanTier } from '@enkap/shared-types';

export type { BillingPlan };

/** Backend entity'den gelen ham plan (priceKurus alanları number olarak gelir) */
export interface BillingPlanRaw {
  id:                 string;
  name:               string;
  priceKurus:         number;
  annualPriceKurus:   number;
  maxUsers:           number;
  maxInvoicesMonth:   number;
  hasMl:              boolean;
  hasMarketplace:     boolean;
  hasHr:              boolean;
  features:           string[];
  isActive:           boolean;
}

export function mapBillingPlan(raw: BillingPlanRaw): BillingPlan {
  return {
    id:                raw.id,
    name:              raw.name,
    tier:              raw.id as BillingPlanTier,
    priceKurus:        Number(raw.priceKurus),
    annualPriceKurus:  Number(raw.annualPriceKurus),
    maxUsers:          raw.maxUsers,
    maxInvoicesMonth:  raw.maxInvoicesMonth,
    hasMl:             raw.hasMl,
    hasMarketplace:    raw.hasMarketplace,
    hasHr:             raw.hasHr,
    features:          raw.features ?? [],
    isActive:          raw.isActive,
  };
}

/** Backend'den gelen abonelik entity'si (lowercase status, iyzico referansları) */
export interface Subscription {
  id:                   string;
  tenantId:             string;
  planId:               string;
  status:               'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired';
  trialEndsAt:          string | null;
  currentPeriodStart:   string | null;
  currentPeriodEnd:     string | null;
  cancelAtPeriodEnd:    boolean;
  iyzicoCardToken:      string | null;
  iyzicoSubscriptionRef: string | null;
}

export const billingApi = {
  plans: () =>
    apiClient.get<BillingPlanRaw[]>('/billing/plans')
      .then(r => ({ ...r, data: r.data.map(mapBillingPlan) })),

  subscription: (tenantId: string) =>
    apiClient.get<Subscription | null>(`/billing/subscriptions/${tenantId}`),

  changePlan: (tenantId: string, data: { planId: string }) =>
    apiClient.patch<Subscription>(`/billing/subscriptions/${tenantId}/plan`, data),

  updateCard: (tenantId: string, card: {
    cardHolderName: string; cardNumber: string;
    expireMonth: string; expireYear: string; cvc: string;
  }) =>
    apiClient.patch<Subscription>(`/billing/subscriptions/${tenantId}/card`, { card }),

  cancel: (tenantId: string, immediate = false) =>
    apiClient.post(`/billing/subscriptions/${tenantId}/cancel`, { immediate }),
};

/** Platform genelinde geçerli ayarlar (deneme süresi, dunning günleri) */
export const platformSettingsApi = {
  get: () =>
    apiClient.get<{ trialDays: number; dunningDelays: number[] }>('/billing/platform-settings'),
  update: (dto: { trialDays?: number; dunningDelays?: number[] }) =>
    apiClient.put<{ ok: boolean }>('/billing/platform-settings', dto),
};

/**
 * E-Commerce Service — e-Ticaret Entegrasyonları
 * Port: 3004 (stock-service) | Proxy: /api/stock/ecommerce/*
 */
import { apiClient } from '@/lib/api-client';

export type PlatformType = 'woocommerce' | 'shopify' | 'ticimax' | 'ideasoft';

export interface EcommerceIntegration {
  id:               string;
  tenantId:         string;
  platform:         PlatformType;
  storeUrl:         string;
  storeName:        string;
  isActive:         boolean;
  lastSyncedAt:     string | null;
  syncedProducts:   number;
  syncedOrders:     number;
  errorMessage:     string | null;
  createdAt:        string;
  updatedAt:        string;
}

export const PLATFORM_LABELS: Record<PlatformType, string> = {
  woocommerce: 'WooCommerce',
  shopify:     'Shopify',
  ticimax:     'Ticimax',
  ideasoft:    'İdeaSoft',
};

export const PLATFORM_COLORS: Record<PlatformType, string> = {
  woocommerce: '#7F54B3',
  shopify:     '#96BF48',
  ticimax:     '#E65C2B',
  ideasoft:    '#0A7CFF',
};

export const PLATFORM_DESC: Record<PlatformType, string> = {
  woocommerce: 'WordPress tabanlı açık kaynak e-ticaret platformu',
  shopify:     'Bulut tabanlı global e-ticaret altyapısı',
  ticimax:     'Türkiye\'ye özel e-ticaret yazılımı',
  ideasoft:    'Türkiye\'ye özel SaaS e-ticaret çözümü',
};

export const ecommerceApi = {
  list: () =>
    apiClient.get<{ data: EcommerceIntegration[]; total: number }>('/stock/ecommerce/integrations'),

  get: (id: string) =>
    apiClient.get<EcommerceIntegration>(`/stock/ecommerce/integrations/${id}`),

  create: (data: {
    platform:    PlatformType;
    storeUrl:    string;
    storeName:   string;
    apiKey:      string;
    apiSecret:   string;
    accessToken?: string;
  }) => apiClient.post<EcommerceIntegration>('/stock/ecommerce/integrations', data),

  toggle: (id: string) =>
    apiClient.post<EcommerceIntegration>(`/stock/ecommerce/integrations/${id}/toggle`, {}),

  sync: (id: string) =>
    apiClient.post<{ synced: number; errors: number }>(`/stock/ecommerce/integrations/${id}/sync`, {}),
};

/**
 * Currency Service — Çoklu Para Birimi / Döviz Kuru
 * Port: 3003 (financial-service) | Proxy: /api/financial/currency/*
 */
import { apiClient } from '@/lib/api-client';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED' | 'CHF' | 'JPY';

export interface ExchangeRate {
  id:         string;
  tenantId:   string;
  currency:   CurrencyCode;
  date:       string;
  buyRate:    number;
  sellRate:   number;
  source:     'TCMB' | 'MANUAL';
  createdAt:  string;
}

export interface CurrentRates {
  date:  string;
  rates: Array<{
    currency: CurrencyCode;
    buyRate:  number;
    sellRate: number;
    change?:  number;
    source:   'TCMB' | 'MANUAL';
  }>;
}

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: 'Amerikan Doları',
  EUR: 'Euro',
  GBP: 'İngiliz Sterlini',
  SAR: 'Suudi Riyali',
  AED: 'BAE Dirhemi',
  CHF: 'İsviçre Frangı',
  JPY: 'Japon Yeni',
};

export const CURRENCY_FLAGS: Record<CurrencyCode, string> = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  SAR: '🇸🇦',
  AED: '🇦🇪',
  CHF: '🇨🇭',
  JPY: '🇯🇵',
};

export const currencyApi = {
  getRates: (params?: { currency?: CurrencyCode; startDate?: string; endDate?: string }) =>
    apiClient.get<{ data: ExchangeRate[]; total: number }>('/financial/currency/rates', { params }),

  getCurrentRates: () =>
    apiClient.get<CurrentRates>('/financial/currency/rates/current'),

  manualRate: (data: { currency: CurrencyCode; date: string; buyRate: number; sellRate: number }) =>
    apiClient.post<ExchangeRate>('/financial/currency/rates/manual', data),

  refresh: () =>
    apiClient.post<{ updated: number; date: string }>('/financial/currency/rates/refresh', {}),
};

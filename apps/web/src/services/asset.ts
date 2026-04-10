/**
 * Financial Service — Duran Varlık (Fixed Assets) Modülü
 * Port: 3003 | Proxy: /api/financial/*
 */
import { apiClient } from '@/lib/api-client';

export type AssetCategory =
  | 'ARSA_ARAZI'
  | 'BINA'
  | 'MAKINE_TECHIZAT'
  | 'TASIT'
  | 'DEMIRBASLAR'
  | 'BILGISAYAR'
  | 'DIGER';

export type DepreciationMethod = 'NORMAL' | 'AZALAN_BAKIYE';
export type AssetStatus = 'AKTIF' | 'TAMAMEN_AMORTIZE' | 'ELDEN_CIKARILDI';

export interface FixedAsset {
  id:                           string;
  tenantId:                     string;
  name:                         string;
  assetCode:                    string;
  category:                     AssetCategory;
  depreciationMethod:           DepreciationMethod;
  usefulLifeYears:              number;
  depreciationRate:             number;
  acquisitionDate:              string;
  acquisitionCostKurus:         number;
  accumulatedDepreciationKurus: number;
  bookValueKurus:               number;
  salvageValueKurus:            number;
  invoiceId?:                   string;
  location?:                    string;
  status:                       AssetStatus;
  disposalDate?:                string;
  disposalNotes?:               string;
  createdAt:                    string;
  updatedAt:                    string;
}

export interface AssetDepreciation {
  id:                    string;
  assetId:               string;
  year:                  number;
  depreciationKurus:     number;
  openingBookValueKurus: number;
  closingBookValueKurus: number;
  method:                string;
  createdAt:             string;
}

export interface AssetListResponse {
  data:  FixedAsset[];
  total: number;
}

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  ARSA_ARAZI:      'Arsa & Arazi',
  BINA:            'Bina',
  MAKINE_TECHIZAT: 'Makine & Teçhizat',
  TASIT:           'Taşıt Aracı',
  DEMIRBASLAR:     'Demirbaş',
  BILGISAYAR:      'Bilgisayar & Yazılım',
  DIGER:           'Diğer',
};

export const CATEGORY_LIFE: Record<AssetCategory, number> = {
  ARSA_ARAZI:      0,
  BINA:            50,
  MAKINE_TECHIZAT: 10,
  TASIT:           5,
  DEMIRBASLAR:     5,
  BILGISAYAR:      4,
  DIGER:           10,
};

export const assetApi = {
  list: (params?: {
    status?:   string;
    category?: string;
    limit?:    number;
    offset?:   number;
  }) => apiClient.get<AssetListResponse>('/financial/assets', { params }),

  get: (id: string) =>
    apiClient.get<FixedAsset>(`/financial/assets/${id}`),

  depreciation: (id: string) =>
    apiClient.get<AssetDepreciation[]>(`/financial/assets/${id}/depreciation`),

  create: (data: {
    name:               string;
    assetCode:          string;
    category:           AssetCategory;
    depreciationMethod?: DepreciationMethod;
    usefulLifeYears?:   number;
    acquisitionDate:    string;
    acquisitionCostKurus: number;
    salvageValueKurus?: number;
    invoiceId?:         string;
    location?:          string;
  }) => apiClient.post<FixedAsset>('/financial/assets', data),

  dispose: (id: string, data: { disposalDate: string; notes?: string }) =>
    apiClient.patch<FixedAsset>(`/financial/assets/${id}/dispose`, data),

  preview: () =>
    apiClient.get<Array<{ assetId: string; assetName: string; year: number; estimated: number }>>(
      '/financial/assets/reports/depreciation-preview',
    ),
};

/**
 * Stock Service — Ürün, Depo, Stok Hareketi, Raporlama
 * Port: 3004 | Proxy: /api/stock/*
 */
import { apiClient } from '@/lib/api-client';
import type { StockMovementType } from '@enkap/shared-types';

export interface Product {
  id:               string;
  sku:              string;
  name:             string;
  barcode?:         string;
  categoryId?:      string;
  categoryName?:    string;
  unitCode:         string;
  totalStockQty:    number;
  reorderPoint:     number;
  listPriceKurus:   number;
  avgUnitCostKurus: number;
  costMethod:       'FIFO' | 'AVG';
  isActive:         boolean;
}

export interface ProductCategory {
  id:       string;
  name:     string;
  parentId: string | null;
}

export interface Warehouse {
  id:       string;
  name:     string;
  code:     string;
  city?:    string;
  isActive: boolean;
}

export interface StockMovement {
  id:                string;
  productId:         string;
  product?:          { id: string; name: string; sku: string; unitCode: string };
  warehouseId:       string;
  warehouse?:        { id: string; name: string; code: string };
  targetWarehouseId: string | null;
  targetWarehouse?:  { id: string; name: string; code: string } | null;
  type:              StockMovementType;
  quantity:          number;
  unitCostKurus:     number;
  totalCostKurus:    number;
  referenceType:     string | null;
  referenceId:       string | null;
  notes:             string | null;
  createdAt:         string;
}

export interface ProductListResponse {
  data:   Product[];
  total:  number;
  limit:  number;
  offset: number;
}

export const stockApi = {

  products: {
    list: (params?: {
      q?:          string;
      categoryId?: string;
      limit?:      number;
      page?:       number;
      offset?:     number;
      includeStock?: boolean;
    }) => apiClient.get<ProductListResponse>('/stock/products', { params }),

    get: (id: string) =>
      apiClient.get<Product>(`/stock/products/${id}`),

    findByBarcode: (barcode: string) =>
      apiClient.get<Product>(`/stock/products/barcode/${barcode}`),

    create: (data: Partial<Product>) =>
      apiClient.post<Product>('/stock/products', data),

    update: (id: string, data: Partial<Product>) =>
      apiClient.patch<Product>(`/stock/products/${id}`, data),

    deactivate: (id: string) =>
      apiClient.delete(`/stock/products/${id}`),

    bulkImport: (formData: FormData) =>
      apiClient.post('/stock/products/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),

    categories: () =>
      apiClient.get<ProductCategory[]>('/stock/products/categories/list'),

    createCategory: (data: { name: string; parentId?: string }) =>
      apiClient.post<ProductCategory>('/stock/products/categories', {
        ...data,
        // code: isimden otomatik türet (büyük harf, boşluk → tire)
        code: data.name.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '').slice(0, 30),
      }),
  },

  warehouses: {
    list: () =>
      apiClient.get<Warehouse[]>('/stock/warehouses'),

    get: (id: string) =>
      apiClient.get<Warehouse>(`/stock/warehouses/${id}`),

    create: (data: Partial<Warehouse>) =>
      apiClient.post<Warehouse>('/stock/warehouses', data),

    update: (id: string, data: Partial<Warehouse>) =>
      apiClient.patch<Warehouse>(`/stock/warehouses/${id}`, data),

    deactivate: (id: string) =>
      apiClient.delete(`/stock/warehouses/${id}`),
  },

  movements: {
    list: (params?: {
      warehouseId?: string;
      productId?:   string;
      type?:        StockMovement['type'];
      limit?:       number;
      offset?:      number;
    }) => apiClient.get<{ data: StockMovement[]; total: number }>('/stock/movements', { params }),

    byProduct: (productId: string) =>
      apiClient.get<StockMovement[]>(`/stock/movements/product/${productId}`),

    byWarehouse: (warehouseId: string) =>
      apiClient.get<StockMovement[]>(`/stock/movements/warehouse/${warehouseId}`),

    create: (data: Partial<StockMovement>) =>
      apiClient.post<StockMovement>('/stock/movements', data),
  },

  reports: {
    pdf:   (params?: Record<string, string>) =>
      apiClient.get('/stock/reports/stok/pdf', { params, responseType: 'blob' }),

    excel: (params?: Record<string, string>) =>
      apiClient.get('/stock/reports/stok/excel', { params, responseType: 'blob' }),
  },
};

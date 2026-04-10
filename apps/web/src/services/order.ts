import { apiClient } from '@/lib/api-client';

export type SalesOrderStatus =
  | 'TASLAK'
  | 'ONAYLANDI'
  | 'HAZIRLANIYOR'
  | 'KISMEN_SEVK'
  | 'SEVK_EDILDI'
  | 'TESLIM_EDILDI'
  | 'FATURALANMIS'
  | 'KAPALI'
  | 'IPTAL';

export type OrderChannel =
  | 'DIREKT'
  | 'TRENDYOL'
  | 'HEPSIBURADA'
  | 'WEB'
  | 'TELEFON';

export interface SalesOrderLine {
  id:              string;
  productId:       string;
  productName:     string;
  sku?:            string;
  unitCode?:       string;
  quantity:        number;
  shippedQuantity: number;
  unitPriceKurus:  number;
  discountRate:    number;
  kdvRate:         number;
  lineTotalKurus:  number;
  kdvKurus:        number;
  warehouseId?:    string;
}

export interface DeliveryAddress {
  addressLine: string;
  city:        string;
  district?:   string;
  postalCode?: string;
  country:     string;
}

export interface SalesOrder {
  id:                   string;
  soNumber:             string;
  customerId?:          string;
  customerName:         string;
  customerEmail?:       string;
  status:               SalesOrderStatus;
  channel:              OrderChannel;
  orderDate:            string;
  promisedDeliveryDate?: string;
  deliveryAddress?:     DeliveryAddress;
  subtotalKurus:        number;
  kdvKurus:             number;
  discountKurus:        number;
  totalKurus:           number;
  currency:             string;
  notes?:               string;
  invoiceId?:           string;
  marketplaceOrderRef?: string;
  createdBy:            string;
  createdAt:            string;
  updatedAt:            string;
  lines:                SalesOrderLine[];
}

export interface DeliveryItem {
  productId:   string;
  productName: string;
  warehouseId: string;
  quantity:    number;
  movementId?: string;
}

export interface Delivery {
  id:             string;
  deliveryNumber: string;
  salesOrderId:   string;
  shipDate:       string;
  items:          DeliveryItem[];
  carrier?:       string;
  trackingNumber?: string;
  vehicleId?:     string;
  driverId?:      string;
  tripId?:        string;
  stockSynced:    boolean;
  createdAt:      string;
}

export interface CreateOrderLineDto {
  productId:      string;
  productName:    string;
  sku?:           string;
  quantity:       number;
  unitPriceKurus: number;
  discountRate?:  number;
  kdvRate:        number;
  warehouseId?:   string;
}

export interface CreateOrderDto {
  customerId?:          string;
  customerName:         string;
  customerEmail?:       string;
  orderDate:            string;
  promisedDeliveryDate?: string;
  channel?:             OrderChannel;
  deliveryAddress?:     DeliveryAddress;
  currency?:            string;
  notes?:               string;
  marketplaceOrderRef?: string;
  lines:                CreateOrderLineDto[];
}

export const STATUS_LABELS: Record<SalesOrderStatus, string> = {
  TASLAK:         'Taslak',
  ONAYLANDI:      'Onaylandı',
  HAZIRLANIYOR:   'Hazırlanıyor',
  KISMEN_SEVK:    'Kısmen Sevk',
  SEVK_EDILDI:    'Sevk Edildi',
  TESLIM_EDILDI:  'Teslim Edildi',
  FATURALANMIS:   'Faturalındı',
  KAPALI:         'Kapalı',
  IPTAL:          'İptal',
};

export const STATUS_CLS: Record<SalesOrderStatus, string> = {
  TASLAK:         'bg-slate-500/10 text-slate-400 border-slate-500/20',
  ONAYLANDI:      'bg-sky-500/10 text-sky-400 border-sky-500/20',
  HAZIRLANIYOR:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  KISMEN_SEVK:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  SEVK_EDILDI:    'bg-teal-500/10 text-teal-400 border-teal-500/20',
  TESLIM_EDILDI:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FATURALANMIS:   'bg-violet-500/10 text-violet-400 border-violet-500/20',
  KAPALI:         'bg-slate-500/10 text-slate-300 border-slate-500/20',
  IPTAL:          'bg-red-500/10 text-red-400 border-red-500/20',
};

export const CHANNEL_LABELS: Record<OrderChannel, string> = {
  DIREKT:      'Direkt',
  TRENDYOL:    'Trendyol',
  HEPSIBURADA: 'Hepsiburada',
  WEB:         'Web Mağaza',
  TELEFON:     'Telefon',
};

export const orderApi = {
  list: (params?: {
    status?:     string;
    customerId?: string;
    channel?:    string;
    limit?:      number;
    offset?:     number;
  }) =>
    apiClient.get<{ data: SalesOrder[]; total: number }>('/order/orders', { params }),

  get: (id: string) =>
    apiClient.get<SalesOrder>(`/order/orders/${id}`),

  create: (dto: CreateOrderDto) =>
    apiClient.post<SalesOrder>('/order/orders', dto),

  confirm: (id: string) =>
    apiClient.post<SalesOrder>(`/order/orders/${id}/confirm`, {}),

  startPicking: (id: string) =>
    apiClient.post<SalesOrder>(`/order/orders/${id}/pick`, {}),

  createDelivery: (id: string, body: {
    items:        DeliveryItem[];
    shipDate:     string;
    carrier?:     string;
    tracking?:    string;
    vehicleId?:   string;
    driverId?:    string;
    origin?:      string;
    destination?: string;
  }) =>
    apiClient.post<Delivery>(`/order/orders/${id}/deliveries`, body),

  getDeliveries: (id: string) =>
    apiClient.get<Delivery[]>(`/order/orders/${id}/deliveries`),

  createInvoice: (id: string) =>
    apiClient.post<SalesOrder>(`/order/orders/${id}/invoice`, {}),

  cancel: (id: string) =>
    apiClient.post<SalesOrder>(`/order/orders/${id}/cancel`, {}),
};

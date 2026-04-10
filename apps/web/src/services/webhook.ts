/**
 * Webhook Hub Servisi — Abonelik Yönetimi
 * Port: 3006 | Proxy: /api/webhook-hub/*
 */
import { apiClient } from '@/lib/api-client';

export interface WebhookSubscription {
  id:         string;
  tenantId:   string;
  url:        string;
  eventTypes: string[];
  isActive:   boolean;
  createdAt:  string;
}

export interface CreateWebhookResponse extends WebhookSubscription {
  /** Yalnızca oluşturma anında döner — sonradan alınamaz */
  secret:  string;
  message: string;
}

export interface CreateWebhookPayload {
  tenantId:   string;
  url:        string;
  eventTypes: string[];
}

/** Sistemde üretilen webhook olayı tipleri */
export const WEBHOOK_EVENT_TYPES = [
  { value: 'invoice.created',   label: 'Fatura Oluşturuldu',       group: 'Finans' },
  { value: 'invoice.approved',  label: 'Fatura Onaylandı',         group: 'Finans' },
  { value: 'invoice.cancelled', label: 'Fatura İptal Edildi',      group: 'Finans' },
  { value: 'payment.received',  label: 'Ödeme Alındı',             group: 'Finans' },
  { value: 'stock.low',         label: 'Düşük Stok Uyarısı',       group: 'Stok' },
  { value: 'stock.movement',    label: 'Stok Hareketi',            group: 'Stok' },
  { value: 'order.created',     label: 'Sipariş Oluşturuldu',      group: 'Stok' },
  { value: 'contact.created',   label: 'Müşteri Oluşturuldu',      group: 'CRM' },
  { value: 'lead.stage_changed',label: 'Lead Aşaması Değişti',     group: 'CRM' },
  { value: 'employee.created',  label: 'Çalışan Oluşturuldu',      group: 'İK' },
  { value: 'payroll.processed', label: 'Bordro İşlendi',           group: 'İK' },
  { value: 'tenant.subscribed', label: 'Abonelik Başladı',         group: 'Yönetim' },
  { value: '*',                 label: 'Tüm Olaylar (Wildcard)',   group: 'Yönetim' },
] as const;

export const webhookApi = {
  /** Tenant webhook aboneliklerini listele */
  list: (tenantId: string) =>
    apiClient.get<WebhookSubscription[]>(`/webhook-hub/webhooks?tenantId=${tenantId}`),

  /** Yeni webhook aboneliği oluştur (secret yalnızca bu yanıtta döner) */
  create: (data: CreateWebhookPayload) =>
    apiClient.post<CreateWebhookResponse>('/webhook-hub/webhooks', data),

  /** Webhook aboneliğini pasif yap */
  delete: (id: string, tenantId: string) =>
    apiClient.delete(`/webhook-hub/webhooks/${id}?tenantId=${tenantId}`),
};

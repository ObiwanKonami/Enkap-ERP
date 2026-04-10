import { apiClient } from '@/lib/api-client';

// ─── Tipler ──────────────────────────────────────────────────────────────────

export type NotifCategory = 'finans' | 'stok' | 'ik' | 'sistem';
export type NotifLevel    = 'error' | 'warning' | 'info' | 'success';

export interface Notification {
  id:         string;
  tenantId:   string;
  category:   NotifCategory;
  level:      NotifLevel;
  title:      string;
  body:       string;
  href?:      string;
  sourceType?: string;
  sourceId?:   string;
  isRead:     boolean;
  readAt?:    string;
  createdAt:  string;
}

export interface NotificationListResponse {
  items:  Notification[];
  total:  number;
  unread: number;
}

// ─── API Fonksiyonları ────────────────────────────────────────────────────────

export const notificationApi = {
  /** Bildirimleri listele */
  list(params?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<NotificationListResponse> {
    const qp = new URLSearchParams();
    if (params?.limit      != null) qp.set('limit',      String(params.limit));
    if (params?.offset     != null) qp.set('offset',     String(params.offset));
    if (params?.unreadOnly)         qp.set('unreadOnly', 'true');
    const qs = qp.toString() ? `?${qp.toString()}` : '';
    return apiClient.get<NotificationListResponse>(`/notification/notifications${qs}`).then(r => r.data);
  },

  /** Tek bildirimi okundu işaretle */
  markRead(id: string): Promise<Notification> {
    return apiClient.patch<Notification>(`/notification/notifications/${id}/read`).then(r => r.data);
  },

  /** Tüm bildirimleri okundu işaretle */
  markAllRead(): Promise<{ updated: number }> {
    return apiClient.patch<{ updated: number }>('/notification/notifications/read-all').then(r => r.data);
  },

  /** Bildirimi sil */
  remove(id: string): Promise<void> {
    return apiClient.delete(`/notification/notifications/${id}`).then(() => undefined);
  },
};

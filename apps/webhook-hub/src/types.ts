/**
 * Webhook Hub paylaşılan tip tanımları.
 */

/** Outbox olayı — DB'den okunan satır */
export interface OutboxEvent {
  id:             string;
  tenantId:       string;
  eventType:      string;
  payload:        Record<string, unknown>;
  status:         'pending' | 'sent' | 'failed' | 'dead';
  attempts:       number;
  nextAttemptAt:  Date;
  lastError:      string | null;
  createdAt:      Date;
  processedAt:    Date | null;
}

/** Webhook aboneliği */
export interface WebhookSubscription {
  id:          string;
  tenantId:    string;
  url:         string;
  secretEnc:   string;      // Şifreli HMAC secret
  eventTypes:  string[];    // ['*'] = tüm olaylar
  isActive:    boolean;
  createdAt:   Date;
}

/** Teslimat sonucu */
export interface DeliveryResult {
  success:    boolean;
  httpStatus: number | null;
  durationMs: number;
  error?:     string;
}

/** Servislerden gelen olay enqueue isteği */
export interface EnqueueEventRequest {
  tenantId:  string;
  eventType: string;
  payload:   Record<string, unknown>;
}

/** Webhook abonelik oluşturma isteği */
export interface CreateSubscriptionRequest {
  tenantId:   string;
  url:        string;
  secret:     string;
  eventTypes: string[];
}

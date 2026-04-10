import type { Pool, PoolClient } from 'pg';
import type { OutboxEvent, WebhookSubscription } from '../types';

/**
 * Outbox veritabanı işlemleri.
 *
 * Tüm sorgular control plane pool'u kullanır.
 * SKIP LOCKED: birden fazla webhook-hub instance'ı çakışmadan çalışabilir.
 */
export class OutboxRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * İşlenmeye hazır olayları atomik olarak alır ve kilitler.
   *
   * FOR UPDATE SKIP LOCKED: başka instance kilitlediyse atla.
   * Batch size 50: çok büyük batch aynı anda kuyruğu tıkamaz.
   */
  async claimPendingEvents(batchSize = 50): Promise<OutboxEvent[]> {
    const { rows } = await this.pool.query<RawOutboxRow>(
      `SELECT
         id, tenant_id, event_type, payload, status,
         attempts, next_attempt_at, last_error, created_at, processed_at
       FROM outbox_events
       WHERE status = 'pending'
         AND next_attempt_at <= NOW()
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );

    return rows.map(toOutboxEvent);
  }

  /**
   * Olayı başarılı olarak işaretler.
   */
  async markSent(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE outbox_events
       SET status       = 'sent',
           processed_at = NOW(),
           attempts     = attempts + 1
       WHERE id = $1`,
      [eventId],
    );
  }

  /**
   * Olayı başarısız işaretler ve retry planlar.
   * @param nextAttempt null ise dead-letter
   */
  async markFailed(
    eventId: string,
    error: string,
    nextAttempt: Date | null,
  ): Promise<void> {
    const newStatus = nextAttempt ? 'pending' : 'dead';

    await this.pool.query(
      `UPDATE outbox_events
       SET status          = $1,
           attempts        = attempts + 1,
           next_attempt_at = COALESCE($2, next_attempt_at),
           last_error      = $3
       WHERE id = $4`,
      [newStatus, nextAttempt, error.slice(0, 1000), eventId],
    );
  }

  /**
   * Yeni olay ekler (diğer servisler bunu çağırır).
   */
  async enqueue(
    tenantId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO outbox_events (tenant_id, event_type, payload)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, eventType, JSON.stringify(payload)],
    );
    return rows[0]!.id;
  }

  /**
   * Tenant + event_type ile eşleşen aktif abonelikleri getirir.
   * event_types = '["*"]' ise tüm olaylara abone.
   */
  async getMatchingSubscriptions(
    tenantId: string,
    eventType: string,
  ): Promise<WebhookSubscription[]> {
    const { rows } = await this.pool.query<RawSubscriptionRow>(
      `SELECT id, tenant_id, url, secret_enc, event_types, is_active, created_at
       FROM webhook_subscriptions
       WHERE tenant_id = $1
         AND is_active = true
         AND (
           event_types @> '["*"]'::jsonb
           OR event_types @> $2::jsonb
         )`,
      [tenantId, JSON.stringify([eventType])],
    );

    return rows.map(toSubscription);
  }

  /**
   * Teslimat log'u kaydeder.
   */
  async logDelivery(
    outboxEventId: string,
    subscriptionId: string,
    attempt: number,
    httpStatus: number | null,
    responseBody: string | null,
    durationMs: number,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO webhook_delivery_log
         (outbox_event_id, subscription_id, attempt, http_status, response_body, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [outboxEventId, subscriptionId, attempt, httpStatus, responseBody, durationMs],
    );
  }

  /** Webhook aboneliği oluşturur */
  async createSubscription(
    tenantId: string,
    url: string,
    secretEnc: string,
    eventTypes: string[],
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO webhook_subscriptions (tenant_id, url, secret_enc, event_types)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [tenantId, url, secretEnc, JSON.stringify(eventTypes)],
    );
    return rows[0]!.id;
  }

  /** Aboneliği pasif yapar (soft delete) */
  async deactivateSubscription(
    id: string,
    tenantId: string,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE webhook_subscriptions
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Tenant'ın tüm aktif aboneliklerini listeler */
  async listSubscriptions(tenantId: string): Promise<WebhookSubscription[]> {
    const { rows } = await this.pool.query<RawSubscriptionRow>(
      `SELECT id, tenant_id, url, secret_enc, event_types, is_active, created_at
       FROM webhook_subscriptions
       WHERE tenant_id = $1
         AND is_active = true
       ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows.map(toSubscription);
  }
}

// ─── Tip dönüşümleri ────────────────────────────────────────────────────────

interface RawOutboxRow {
  id:              string;
  tenant_id:       string;
  event_type:      string;
  payload:         Record<string, unknown>;
  status:          'pending' | 'sent' | 'failed' | 'dead';
  attempts:        number;
  next_attempt_at: Date;
  last_error:      string | null;
  created_at:      Date;
  processed_at:    Date | null;
}

interface RawSubscriptionRow {
  id:          string;
  tenant_id:   string;
  url:         string;
  secret_enc:  string;
  event_types: string[] | string;
  is_active:   boolean;
  created_at:  Date;
}

function toOutboxEvent(row: RawOutboxRow): OutboxEvent {
  return {
    id:            row.id,
    tenantId:      row.tenant_id,
    eventType:     row.event_type,
    payload:       row.payload,
    status:        row.status,
    attempts:      row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError:     row.last_error,
    createdAt:     row.created_at,
    processedAt:   row.processed_at,
  };
}

function toSubscription(row: RawSubscriptionRow): WebhookSubscription {
  return {
    id:         row.id,
    tenantId:   row.tenant_id,
    url:        row.url,
    secretEnc:  row.secret_enc,
    eventTypes: Array.isArray(row.event_types)
      ? row.event_types
      : JSON.parse(row.event_types as string),
    isActive:   row.is_active,
    createdAt:  row.created_at,
  };
}

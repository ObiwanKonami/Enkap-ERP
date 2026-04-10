import { Pool } from 'pg';

/**
 * Control plane PostgreSQL bağlantı havuzu.
 *
 * webhook-hub yalnızca control plane'e bağlanır:
 *  - outbox_events → bekleyen olayları okur + SKIP LOCKED ile kilitler
 *  - webhook_subscriptions → teslimat endpoint'lerini çeker
 *  - webhook_delivery_log → teslimat sonuçlarını kaydeder
 */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://enkap_app:password@postgres:5432/enkap_control_plane',
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: true }
      : false,
  application_name: 'enkap_webhook_hub',
});

pool.on('error', (err) => {
  console.error('[DB] Beklenmeyen pool hatası:', err.message);
});

export { pool };

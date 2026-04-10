import type { FastifyInstance } from 'fastify';
import { pool } from '../db/pool';

/**
 * Sağlık kontrolü endpoint'leri.
 *
 * GET /health          → Basit liveness probe (her zaman 200)
 * GET /health/ready    → Readiness probe (DB bağlantısı kontrolü)
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  /** Liveness — Kubernetes: pod çalışıyor mu? */
  app.get('/health', async (_req, reply) => {
    return reply.send({
      status: 'ok',
      service: 'webhook-hub',
      timestamp: new Date().toISOString(),
    });
  });

  /** Readiness — Kubernetes: trafik alabilir mi? */
  app.get('/health/ready', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.send({
        status: 'ready',
        db: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.status(503).send({
        status: 'not_ready',
        db: 'disconnected',
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
    }
  });
}

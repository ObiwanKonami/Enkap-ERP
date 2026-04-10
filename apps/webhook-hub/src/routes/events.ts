import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OutboxRepository } from '../outbox/outbox.repository';
import type { EnqueueEventRequest } from '../types';

/**
 * Olay enqueue API'si.
 *
 * Diğer mikroservisler (financial-service, stock-service vb.)
 * bu endpoint'i çağırarak webhook olayı kuyruğuna ekler.
 *
 * Bu endpoint yalnızca internal ağdan erişilebilir olmalıdır.
 * Production'da: Kubernetes NetworkPolicy + mTLS ile korunur.
 *
 * Tasarım notu: Servisler business mutation'larından hemen sonra
 * bu endpoint'i çağırır. Bu "yakın-transactional" yaklaşımdır —
 * tamamen transactional outbox için servislerin aynı DB'ye yazması gerekir.
 */
export function eventsRoutes(
  app: FastifyInstance,
  repo: OutboxRepository,
): void {
  /**
   * POST /internal/events
   * Body: { tenantId, eventType, payload }
   *
   * Örnek kullanım (financial-service'den):
   *   await fetch('http://webhook-hub:3006/internal/events', {
   *     method: 'POST',
   *     headers: { 'Content-Type': 'application/json' },
   *     body: JSON.stringify({
   *       tenantId: ctx.tenantId,
   *       eventType: 'invoice.created',
   *       payload: { invoiceId: inv.id, total: inv.total },
   *     }),
   *   });
   */
  app.post(
    '/internal/events',
    async (req: FastifyRequest<{ Body: EnqueueEventRequest }>, reply) => {
      const { tenantId, eventType, payload } = req.body;

      if (!tenantId || !eventType || !payload) {
        return reply.status(400).send({
          error: 'tenantId, eventType ve payload zorunludur.',
        });
      }

      // Olay tipi formatı: "domain.action" (örn: "invoice.created")
      if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(eventType)) {
        return reply.status(400).send({
          error: 'Geçersiz eventType formatı. Beklenen: "domain.action" (örn: invoice.created)',
        });
      }

      const eventId = await repo.enqueue(tenantId, eventType, payload);

      return reply.status(202).send({
        eventId,
        status: 'queued',
        eventType,
        tenantId,
      });
    },
  );

  /**
   * GET /internal/events/stats
   * Outbox durumu (monitoring için)
   */
  app.get('/internal/events/stats', async (_req, reply) => {
    // TODO: Outbox istatistikleri (pending/sent/dead sayısı)
    return reply.send({ message: 'TODO: outbox stats' });
  });
}

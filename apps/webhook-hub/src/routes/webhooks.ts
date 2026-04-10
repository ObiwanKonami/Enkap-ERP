import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OutboxRepository } from '../outbox/outbox.repository';
import { generateSecret, encryptSecret } from '../delivery/hmac';
import type { CreateSubscriptionRequest } from '../types';

/**
 * Webhook abonelik yönetim API'si.
 *
 * Tenant'lar kendi webhook endpoint'lerini yönetir.
 * Auth: TenantGuard (JWT Bearer — diğer servislerle aynı)
 * TODO: JWT doğrulama middleware ekle
 */
export function webhookRoutes(
  app: FastifyInstance,
  repo: OutboxRepository,
): void {
  /**
   * POST /webhooks
   * Yeni webhook aboneliği oluştur.
   *
   * Body: { tenantId, url, eventTypes }
   * Response: { id, secret } ← secret yalnızca bu anda gösterilir, tekrar alınamaz
   */
  app.post(
    '/webhooks',
    async (
      req: FastifyRequest<{ Body: CreateSubscriptionRequest }>,
      reply,
    ) => {
      const { tenantId, url, eventTypes } = req.body;

      // Temel doğrulama
      if (!tenantId || !url) {
        return reply.status(400).send({
          error: 'tenantId ve url zorunludur.',
        });
      }

      try {
        new URL(url); // URL formatı kontrolü
      } catch {
        return reply.status(400).send({ error: 'Geçersiz URL formatı.' });
      }

      if (!url.startsWith('https://')) {
        return reply.status(400).send({
          error: 'Webhook URL\'i HTTPS olmalıdır.',
        });
      }

      // Güvenli secret üret ve şifrele (DB'de plain text saklanmaz)
      const plainSecret = req.body.secret ?? generateSecret();
      const secretEnc   = encryptSecret(plainSecret);
      const types       = eventTypes?.length ? eventTypes : ['*'];

      const id = await repo.createSubscription(
        tenantId,
        url,
        secretEnc,
        types,
      );

      return reply.status(201).send({
        id,
        tenantId,
        url,
        eventTypes: types,
        // Secret yalnızca oluşturma anında gösterilir
        secret: plainSecret,
        message:
          'Bu secret\'ı güvenli bir yerde saklayın. Tekrar görüntülenemez.',
      });
    },
  );

  /**
   * GET /webhooks?tenantId=xxx
   * Tenant'ın aktif aboneliklerini listeler (secret gösterilmez).
   */
  app.get(
    '/webhooks',
    async (
      req: FastifyRequest<{ Querystring: { tenantId?: string } }>,
      reply,
    ) => {
      const { tenantId } = req.query;

      if (!tenantId) {
        return reply.status(400).send({ error: 'tenantId zorunludur.' });
      }

      const subscriptions = await repo.listSubscriptions(tenantId);

      return reply.send(
        subscriptions.map(({ secretEnc: _secret, ...s }) => s),
      );
    },
  );

  /**
   * DELETE /webhooks/:id?tenantId=xxx
   * Webhook aboneliğini pasif yapar (soft delete).
   */
  app.delete(
    '/webhooks/:id',
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { tenantId?: string };
      }>,
      reply,
    ) => {
      const { id }       = req.params;
      const { tenantId } = req.query;

      if (!tenantId) {
        return reply.status(400).send({ error: 'tenantId zorunludur.' });
      }

      const deleted = await repo.deactivateSubscription(id, tenantId);

      if (!deleted) {
        return reply.status(404).send({
          error: 'Abonelik bulunamadı veya bu tenant\'a ait değil.',
        });
      }

      return reply.status(204).send();
    },
  );
}

import Fastify from 'fastify';
import { pool } from './db/pool';
import { OutboxRepository } from './outbox/outbox.repository';
import { OutboxProcessor } from './outbox/outbox-processor';
import { healthRoutes } from './routes/health';
import { eventsRoutes } from './routes/events';
import { webhookRoutes } from './routes/webhooks';

const PORT = parseInt(process.env.PORT ?? '3006', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Üretimde JSON, geliştirmede güzel format
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ─── Bağımlılıklar ────────────────────────────────────────────────────────
  const repo      = new OutboxRepository(pool);
  const processor = new OutboxProcessor(repo);

  // ─── Route'lar ────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  eventsRoutes(app, repo);
  webhookRoutes(app, repo);

  // ─── Bilinmeyen route → 404 ───────────────────────────────────────────────
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'Endpoint bulunamadı.' });
  });

  // ─── Hata işleyici ────────────────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      error: error.message ?? 'Sunucu hatası.',
    });
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} alındı — kapatılıyor...`);
    processor.stop();
    await app.close();
    await pool.end();
    app.log.info('Webhook Hub kapatıldı.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));

  // ─── Başlat ──────────────────────────────────────────────────────────────
  try {
    // DB bağlantısını doğrula
    await pool.query('SELECT 1');
    app.log.info('Control plane DB bağlantısı başarılı.');

    // Outbox polling başlat
    processor.start();

    // HTTP sunucuyu başlat
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Webhook Hub hazır: http://${HOST}:${PORT}`);

  } catch (err) {
    app.log.fatal(err, 'Başlatma hatası');
    process.exit(1);
  }
}

void bootstrap();

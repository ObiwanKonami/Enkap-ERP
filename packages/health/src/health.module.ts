import { Module } from '@nestjs/common';
import { HealthController }  from './health.controller';
import { PrometheusModule }  from './prometheus/prometheus.module';
import { MetricsMiddleware } from './metrics.middleware';

/**
 * Paylaşılan sağlık kontrol modülü.
 *
 * Kullanım — her NestJS servisinde:
 *   import { HealthModule } from '@enkap/health';
 *   @Module({ imports: [..., HealthModule] })
 *
 * Otomatik olarak şu endpoint'leri ekler:
 *   GET /health        (liveness)
 *   GET /health/ready  (readiness)
 */
@Module({
  imports:     [PrometheusModule],
  controllers: [HealthController],
  providers:   [MetricsMiddleware],
  exports:     [PrometheusModule, MetricsMiddleware],
})
export class HealthModule {}

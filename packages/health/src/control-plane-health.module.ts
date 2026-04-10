import { Module } from '@nestjs/common';
import { ControlPlaneHealthController } from './control-plane-health.controller';
import { PrometheusModule }  from './prometheus/prometheus.module';
import { MetricsMiddleware } from './metrics.middleware';

/**
 * control_plane named DataSource kullanan servisler için sağlık modülü.
 * (tenant-service, analytics-service)
 */
@Module({
  imports:     [PrometheusModule],
  controllers: [ControlPlaneHealthController],
  providers:   [MetricsMiddleware],
  exports:     [PrometheusModule, MetricsMiddleware],
})
export class ControlPlaneHealthModule {}

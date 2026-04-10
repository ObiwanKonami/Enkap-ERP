import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusRegistry }       from './prometheus.registry';

/**
 * Prometheus scrape endpoint'i.
 *
 *   GET /metrics
 *
 * Prometheus text exposition format (0.0.4) döner.
 * Content-Type: text/plain; version=0.0.4; charset=utf-8
 *
 * Güvenlik: Bu endpoint Kong Gateway'de cluster-internal olarak
 * kısıtlanmalıdır — dış erişime açılmamalıdır.
 * (kong/routes.yaml'da /metrics path'i authenticate edilmiş veya
 *  sadece Prometheus pod IP'lerine izin verilmiş olmalı)
 *
 * K8s ServiceMonitor:
 *   infrastructure/kubernetes/monitoring/prometheus-service-monitor.yaml
 */
@Controller('metrics')
export class PrometheusController {
  constructor(private readonly registry: PrometheusRegistry) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async metrics(): Promise<string> {
    return this.registry.registry.metrics();
  }
}

import { Injectable, type NestMiddleware, Optional } from '@nestjs/common';
import type { FastifyRequest, FastifyReply }          from 'fastify';
import { PrometheusRegistry }                         from './prometheus/prometheus.registry';

/**
 * HTTP metrik middleware'i.
 *
 * Her istekte:
 *  1. Prometheus histogram'ı günceller (http_request_duration_seconds)
 *  2. Prometheus counter'ı artırır (http_requests_total)
 *  3. In-flight gauge'ını yönetir (http_requests_in_flight)
 *  4. Yavaş istek (>2s) ve 5xx hata loglar
 *
 * Sağlık probe'ları (/health, /metrics) metrik kaydına dahil edilmez.
 *
 * Prometheus devre dışıysa (PrometheusRegistry enjekte edilmemişse)
 * sadece loglama yapılır — servis hata vermez.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  private readonly serviceName: string;

  constructor(
    @Optional()
    private readonly prometheusRegistry: PrometheusRegistry,
  ) {
    // Servis adı: SERVICE_NAME env veya npm package name
    this.serviceName =
      process.env.SERVICE_NAME ??
      process.env.npm_package_name?.replace('@enkap/', '') ??
      'unknown';
  }

  use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void {
    const start  = Date.now();
    const { method, url } = req;

    // Sağlık ve metrik endpoint'lerini atla (gürültü azaltma)
    const isInternal = url?.startsWith('/health') || url?.startsWith('/metrics');
    if (isInternal) {
      next();
      return;
    }

    // In-flight artır
    this.prometheusRegistry?.httpRequestsInFlight.inc({ service: this.serviceName });

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000; // saniyeye çevir
      const status   = res.statusCode;
      const route    = normalizePath(url ?? '/');

      // In-flight azalt
      this.prometheusRegistry?.httpRequestsInFlight.dec({ service: this.serviceName });

      // Prometheus metriklerini kaydet
      const labels = {
        method:      method ?? 'UNKNOWN',
        route,
        status_code: String(status),
        service:     this.serviceName,
      };

      this.prometheusRegistry?.httpRequestDuration.observe(labels, duration);
      this.prometheusRegistry?.httpRequestsTotal.inc(labels);

      // Konsol loglama (kritik durumlar)
      if (status >= 500) {
        console.error(`[HTTP] ${method} ${url} → ${status} (${Math.round(duration * 1000)}ms)`);
      } else if (duration > 2) {
        console.warn(`[HTTP] SLOW ${method} ${url} → ${status} (${Math.round(duration * 1000)}ms)`);
      }
    });

    next();
  }
}

/**
 * URL'deki değişken segmentleri normalize eder.
 *
 * Yüksek kardinalite sorununu önler:
 *  /api/v1/invoices/550e8400-e29b-41d4-a716-446655440000 → /api/v1/invoices/:id
 *  /api/v1/invoices/42                                   → /api/v1/invoices/:id
 *  /api/v1/ar-ap/aging/customer?page=1                   → /api/v1/ar-ap/aging/customer
 */
function normalizePath(url: string): string {
  const pathname = url.split('?')[0] ?? url;
  return pathname
    // UUID
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    // Sayısal ID
    .replace(/\/\d+/g, '/:id');
}

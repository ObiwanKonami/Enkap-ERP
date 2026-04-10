import { type NestMiddleware } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { PrometheusRegistry } from './prometheus/prometheus.registry';
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
export declare class MetricsMiddleware implements NestMiddleware {
    private readonly prometheusRegistry;
    private readonly serviceName;
    constructor(prometheusRegistry: PrometheusRegistry);
    use(req: FastifyRequest['raw'], res: FastifyReply['raw'], next: () => void): void;
}

import { Injectable } from '@nestjs/common';
import {
  Registry,
  Histogram,
  Counter,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Prometheus metrik kayıt defteri.
 *
 * Singleton servis — tüm metrikler burada tanımlanır ve toplanır.
 * MetricsMiddleware ve PrometheusController bu servisi enjekte eder.
 *
 * Tanımlı metrikler:
 *  http_request_duration_seconds  — histogram (her endpoint için gecikme dağılımı)
 *  http_requests_total            — counter  (toplam istek sayısı, durum kodu ile)
 *  http_requests_in_flight        — gauge    (anlık aktif istek sayısı)
 *
 * Ek olarak Node.js varsayılan metrikleri toplanır:
 *  process_cpu_seconds_total, nodejs_heap_size_*, gc_duration_*, vb.
 */
@Injectable()
export class PrometheusRegistry {
  readonly registry = new Registry();

  /** HTTP istek süresi dağılımı (SLO hesabı için P50/P90/P99) */
  readonly httpRequestDuration: Histogram<string>;

  /** Toplam istek sayacı (hata oranı hesabı için) */
  readonly httpRequestsTotal: Counter<string>;

  /** Anlık aktif istek sayısı (concurrency izleme) */
  readonly httpRequestsInFlight: Gauge<string>;

  constructor() {
    // Node.js process metrikleri (CPU, bellek, GC, event-loop lag)
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestDuration = new Histogram({
      name:       'http_request_duration_seconds',
      help:       'HTTP istek süresi (saniye)',
      labelNames: ['method', 'route', 'status_code', 'service'],
      // SRE için önerilen bucket sınırları (Amdahl kanununa göre)
      buckets:    [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers:  [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name:       'http_requests_total',
      help:       'Toplam HTTP istek sayısı',
      labelNames: ['method', 'route', 'status_code', 'service'],
      registers:  [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name:       'http_requests_in_flight',
      help:       'Anlık aktif istek sayısı',
      labelNames: ['service'],
      registers:  [this.registry],
    });
  }
}

import { Registry, Histogram, Counter, Gauge } from 'prom-client';
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
export declare class PrometheusRegistry {
    readonly registry: Registry<"text/plain; version=0.0.4; charset=utf-8">;
    /** HTTP istek süresi dağılımı (SLO hesabı için P50/P90/P99) */
    readonly httpRequestDuration: Histogram<string>;
    /** Toplam istek sayacı (hata oranı hesabı için) */
    readonly httpRequestsTotal: Counter<string>;
    /** Anlık aktif istek sayısı (concurrency izleme) */
    readonly httpRequestsInFlight: Gauge<string>;
    constructor();
}

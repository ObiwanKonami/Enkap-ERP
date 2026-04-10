"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsMiddleware = void 0;
const common_1 = require("@nestjs/common");
const prometheus_registry_1 = require("./prometheus/prometheus.registry");
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
let MetricsMiddleware = class MetricsMiddleware {
    constructor(prometheusRegistry) {
        this.prometheusRegistry = prometheusRegistry;
        // Servis adı: SERVICE_NAME env veya npm package name
        this.serviceName =
            process.env.SERVICE_NAME ??
                process.env.npm_package_name?.replace('@enkap/', '') ??
                'unknown';
    }
    use(req, res, next) {
        const start = Date.now();
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
            const status = res.statusCode;
            const route = normalizePath(url ?? '/');
            // In-flight azalt
            this.prometheusRegistry?.httpRequestsInFlight.dec({ service: this.serviceName });
            // Prometheus metriklerini kaydet
            const labels = {
                method: method ?? 'UNKNOWN',
                route,
                status_code: String(status),
                service: this.serviceName,
            };
            this.prometheusRegistry?.httpRequestDuration.observe(labels, duration);
            this.prometheusRegistry?.httpRequestsTotal.inc(labels);
            // Konsol loglama (kritik durumlar)
            if (status >= 500) {
                console.error(`[HTTP] ${method} ${url} → ${status} (${Math.round(duration * 1000)}ms)`);
            }
            else if (duration > 2) {
                console.warn(`[HTTP] SLOW ${method} ${url} → ${status} (${Math.round(duration * 1000)}ms)`);
            }
        });
        next();
    }
};
exports.MetricsMiddleware = MetricsMiddleware;
exports.MetricsMiddleware = MetricsMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prometheus_registry_1.PrometheusRegistry])
], MetricsMiddleware);
/**
 * URL'deki değişken segmentleri normalize eder.
 *
 * Yüksek kardinalite sorununu önler:
 *  /api/v1/invoices/550e8400-e29b-41d4-a716-446655440000 → /api/v1/invoices/:id
 *  /api/v1/invoices/42                                   → /api/v1/invoices/:id
 *  /api/v1/ar-ap/aging/customer?page=1                   → /api/v1/ar-ap/aging/customer
 */
function normalizePath(url) {
    const pathname = url.split('?')[0] ?? url;
    return pathname
        // UUID
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
        // Sayısal ID
        .replace(/\/\d+/g, '/:id');
}

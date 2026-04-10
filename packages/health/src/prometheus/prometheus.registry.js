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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrometheusRegistry = void 0;
const common_1 = require("@nestjs/common");
const prom_client_1 = require("prom-client");
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
let PrometheusRegistry = class PrometheusRegistry {
    constructor() {
        this.registry = new prom_client_1.Registry();
        // Node.js process metrikleri (CPU, bellek, GC, event-loop lag)
        (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
        this.httpRequestDuration = new prom_client_1.Histogram({
            name: 'http_request_duration_seconds',
            help: 'HTTP istek süresi (saniye)',
            labelNames: ['method', 'route', 'status_code', 'service'],
            // SRE için önerilen bucket sınırları (Amdahl kanununa göre)
            buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
            registers: [this.registry],
        });
        this.httpRequestsTotal = new prom_client_1.Counter({
            name: 'http_requests_total',
            help: 'Toplam HTTP istek sayısı',
            labelNames: ['method', 'route', 'status_code', 'service'],
            registers: [this.registry],
        });
        this.httpRequestsInFlight = new prom_client_1.Gauge({
            name: 'http_requests_in_flight',
            help: 'Anlık aktif istek sayısı',
            labelNames: ['service'],
            registers: [this.registry],
        });
    }
};
exports.PrometheusRegistry = PrometheusRegistry;
exports.PrometheusRegistry = PrometheusRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], PrometheusRegistry);

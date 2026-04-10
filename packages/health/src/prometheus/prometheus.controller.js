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
exports.PrometheusController = void 0;
const common_1 = require("@nestjs/common");
const prometheus_registry_1 = require("./prometheus.registry");
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
let PrometheusController = class PrometheusController {
    constructor(registry) {
        this.registry = registry;
    }
    async metrics() {
        return this.registry.registry.metrics();
    }
};
exports.PrometheusController = PrometheusController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.Header)('Content-Type', 'text/plain; version=0.0.4; charset=utf-8'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PrometheusController.prototype, "metrics", null);
exports.PrometheusController = PrometheusController = __decorate([
    (0, common_1.Controller)('metrics'),
    __metadata("design:paramtypes", [prometheus_registry_1.PrometheusRegistry])
], PrometheusController);

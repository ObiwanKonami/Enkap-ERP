"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthModule = void 0;
const common_1 = require("@nestjs/common");
const health_controller_1 = require("./health.controller");
const prometheus_module_1 = require("./prometheus/prometheus.module");
const metrics_middleware_1 = require("./metrics.middleware");
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
let HealthModule = class HealthModule {
};
exports.HealthModule = HealthModule;
exports.HealthModule = HealthModule = __decorate([
    (0, common_1.Module)({
        imports: [prometheus_module_1.PrometheusModule],
        controllers: [health_controller_1.HealthController],
        providers: [metrics_middleware_1.MetricsMiddleware],
        exports: [prometheus_module_1.PrometheusModule, metrics_middleware_1.MetricsMiddleware],
    })
], HealthModule);

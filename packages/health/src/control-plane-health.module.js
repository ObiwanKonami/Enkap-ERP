"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControlPlaneHealthModule = void 0;
const common_1 = require("@nestjs/common");
const control_plane_health_controller_1 = require("./control-plane-health.controller");
const prometheus_module_1 = require("./prometheus/prometheus.module");
const metrics_middleware_1 = require("./metrics.middleware");
/**
 * control_plane named DataSource kullanan servisler için sağlık modülü.
 * (tenant-service, analytics-service)
 */
let ControlPlaneHealthModule = class ControlPlaneHealthModule {
};
exports.ControlPlaneHealthModule = ControlPlaneHealthModule;
exports.ControlPlaneHealthModule = ControlPlaneHealthModule = __decorate([
    (0, common_1.Module)({
        imports: [prometheus_module_1.PrometheusModule],
        controllers: [control_plane_health_controller_1.ControlPlaneHealthController],
        providers: [metrics_middleware_1.MetricsMiddleware],
        exports: [prometheus_module_1.PrometheusModule, metrics_middleware_1.MetricsMiddleware],
    })
], ControlPlaneHealthModule);

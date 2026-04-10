"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrometheusModule = void 0;
const common_1 = require("@nestjs/common");
const prometheus_registry_1 = require("./prometheus.registry");
const prometheus_controller_1 = require("./prometheus.controller");
/**
 * @Global() — tüm servisler tarafından bir kez import edilir.
 *
 * PrometheusRegistry singleton olarak sağlanır; MetricsMiddleware
 * ve PrometheusController aynı Registry instance'ını kullanır.
 *
 * HealthModule ve ControlPlaneHealthModule bu modülü otomatik import eder.
 */
let PrometheusModule = class PrometheusModule {
};
exports.PrometheusModule = PrometheusModule;
exports.PrometheusModule = PrometheusModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [prometheus_registry_1.PrometheusRegistry],
        controllers: [prometheus_controller_1.PrometheusController],
        exports: [prometheus_registry_1.PrometheusRegistry],
    })
], PrometheusModule);

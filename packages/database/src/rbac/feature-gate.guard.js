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
exports.FeatureGateGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const shared_types_1 = require("@enkap/shared-types");
const tenant_context_storage_1 = require("../tenant/tenant-context.storage");
const feature_gate_decorator_1 = require("./feature-gate.decorator");
/**
 * Plan bazlı özellik kapısı guard'ı.
 *
 * TenantGuard'dan sonra çalıştırılmalıdır:
 *   @UseGuards(TenantGuard, FeatureGateGuard)
 *
 * TenantContext.tier'ı okur; PLAN_FEATURES tablosuna göre erişimi denetler.
 *
 * Çalışma mantığı:
 * 1. @RequiresPlan() yoksa → plan kontrolü yapılmaz, erişim verilir.
 * 2. Tenant'ın planı gerekli özelliği içermiyorsa → 403 ForbiddenException.
 * 3. enterprise tier her zaman tüm özelliklere erişebilir.
 */
let FeatureGateGuard = class FeatureGateGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const requiredFeature = this.reflector.getAllAndOverride(feature_gate_decorator_1.FEATURE_KEY, [context.getHandler(), context.getClass()]);
        // @RequiresPlan() dekoratörü yoksa → plan kontrolü yok
        if (!requiredFeature) {
            return true;
        }
        const { tier } = (0, tenant_context_storage_1.getTenantContext)();
        const allowedFeatures = shared_types_1.PLAN_FEATURES[tier] ?? [];
        const hasFeature = allowedFeatures.includes(requiredFeature);
        if (!hasFeature) {
            throw new common_1.ForbiddenException(`Bu özellik mevcut planınıza dahil değil. Yükseltmek için destek ekibiyle iletişime geçin.`);
        }
        return true;
    }
};
exports.FeatureGateGuard = FeatureGateGuard;
exports.FeatureGateGuard = FeatureGateGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], FeatureGateGuard);

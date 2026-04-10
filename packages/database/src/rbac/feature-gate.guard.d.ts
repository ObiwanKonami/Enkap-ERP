import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
export declare class FeatureGateGuard implements CanActivate {
    private readonly reflector;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Feature, PLAN_FEATURES } from '@enkap/shared-types';
import { getTenantContext } from '../tenant/tenant-context.storage';
import { FEATURE_KEY } from './feature-gate.decorator';

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
@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredFeature = this.reflector.getAllAndOverride<Feature>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // @RequiresPlan() dekoratörü yoksa → plan kontrolü yok
    if (!requiredFeature) {
      return true;
    }

    const { tier } = getTenantContext();

    const allowedFeatures = PLAN_FEATURES[tier] ?? [];
    const hasFeature = allowedFeatures.includes(requiredFeature);

    if (!hasFeature) {
      throw new ForbiddenException(
        `Bu özellik mevcut planınıza dahil değil. Yükseltmek için destek ekibiyle iletişime geçin.`,
      );
    }

    return true;
  }
}

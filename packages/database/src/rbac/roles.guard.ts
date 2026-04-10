import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@enkap/shared-types';
import { getTenantContext } from '../tenant/tenant-context.storage';
import { ROLES_KEY } from './roles.decorator';

/**
 * Rol tabanlı erişim kontrolü guard'ı.
 *
 * TenantGuard'dan SONRA çalıştırılmalıdır:
 *   @UseGuards(TenantGuard, RolesGuard)
 *
 * Çalışma mantığı:
 * 1. @Roles() yoksa → tüm kimliği doğrulanmış kullanıcılar erişebilir.
 * 2. Kullanıcı sistem_admin ise → her zaman erişim verilir.
 * 3. Kullanıcının rollerinden en az biri @Roles() listesindeyse → erişim verilir.
 * 4. Hiçbiri eşleşmiyorsa → 403 ForbiddenException fırlatılır.
 *
 * NOT: Bu guard TenantContext'e bağımlıdır. TenantGuard olmadan
 * çalıştırıldığında getTenantContext() exception fırlatır.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Method seviyesi önce, sonra class seviyesi kontrol edilir
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // @Roles() dekoratörü yoksa → kimliği doğrulanmış herkes erişebilir
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { userRoles } = getTenantContext();

    // sistem_admin tüm kısıtlamaları geçer
    if (userRoles.includes(Role.SISTEM_ADMIN)) {
      return true;
    }

    // En az bir rol eşleşmesi yeterli
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        'Bu işlem için gerekli role sahip değilsiniz.',
      );
    }

    return true;
  }
}

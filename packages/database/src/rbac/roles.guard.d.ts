import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
}

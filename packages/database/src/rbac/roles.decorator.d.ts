import type { Role } from '@enkap/shared-types';
export declare const ROLES_KEY = "roles";
/**
 * Endpoint'e erişim için gerekli rolleri belirtir.
 *
 * Kullanım:
 *   @Roles(Role.MUHASEBECI, Role.SISTEM_ADMIN)
 *   @Get('mizan')
 *
 * - Belirtilen rollerden en az biri yeterliyse erişim açılır.
 * - sistem_admin her zaman erişebilir (guard içinde bypass edilir).
 * - @Roles() eklenmemiş endpoint → kimliği doğrulanmış tüm kullanıcılar erişebilir.
 * - Method seviyesinde @Roles() → class seviyesini geçersiz kılar.
 */
export declare const Roles: (...roles: Role[]) => import("node_modules/@nestjs/common").CustomDecorator<string>;

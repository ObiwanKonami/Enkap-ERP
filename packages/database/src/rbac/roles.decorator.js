"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Roles = exports.ROLES_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.ROLES_KEY = 'roles';
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
const Roles = (...roles) => (0, common_1.SetMetadata)(exports.ROLES_KEY, roles);
exports.Roles = Roles;

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
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const shared_types_1 = require("@enkap/shared-types");
const tenant_context_storage_1 = require("../tenant/tenant-context.storage");
const roles_decorator_1 = require("./roles.decorator");
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
let RolesGuard = class RolesGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        // Method seviyesi önce, sonra class seviyesi kontrol edilir
        const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        // @Roles() dekoratörü yoksa → kimliği doğrulanmış herkes erişebilir
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }
        const { userRoles } = (0, tenant_context_storage_1.getTenantContext)();
        // sistem_admin tüm kısıtlamaları geçer
        if (userRoles.includes(shared_types_1.Role.SISTEM_ADMIN)) {
            return true;
        }
        // En az bir rol eşleşmesi yeterli
        const hasRole = requiredRoles.some((role) => userRoles.includes(role));
        if (!hasRole) {
            throw new common_1.ForbiddenException('Bu işlem için gerekli role sahip değilsiniz.');
        }
        return true;
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], RolesGuard);

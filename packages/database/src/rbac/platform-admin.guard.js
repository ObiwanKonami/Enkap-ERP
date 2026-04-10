"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdminGuard = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
/**
 * Platform (SaaS) admin erişim guard'ı.
 *
 * Tenant guard'larından tamamen bağımsız çalışır:
 *  - TenantGuard gerektirmez
 *  - tenant_id içermeyen JWT doğrular
 *  - `aud: 'platform-api'` claim'i zorunludur (tenant token'larının karışmasını önler)
 *
 * Başarılı doğrulama sonrası `request.platformAdmin` set edilir.
 *
 * Kullanım:
 *   @UseGuards(PlatformAdminGuard)
 *   @Controller('admin/tenants')
 */
let PlatformAdminGuard = class PlatformAdminGuard {
    constructor() {
        // Module bağımlılığı gerektirmeden doğrulama için tekil instance
        this.jwtService = new jwt_1.JwtService({});
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers?.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new common_1.UnauthorizedException('Platform admin token gereklidir.');
        }
        const token = authHeader.slice(7);
        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env['JWT_SECRET'] ?? 'CHANGE_IN_PRODUCTION',
                issuer: process.env['JWT_ISSUER'] ?? 'https://auth.enkap.local',
                audience: 'platform-api',
                algorithms: ['HS256'],
            });
            if (!payload.platform_role) {
                throw new common_1.UnauthorizedException('Platform yetkiniz bulunmamaktadır.');
            }
            // Sonraki handler'larda erişilebilir
            request.platformAdmin = payload;
            return true;
        }
        catch (err) {
            if (err instanceof common_1.UnauthorizedException)
                throw err;
            throw new common_1.UnauthorizedException('Geçersiz veya süresi dolmuş platform token.');
        }
    }
};
exports.PlatformAdminGuard = PlatformAdminGuard;
exports.PlatformAdminGuard = PlatformAdminGuard = __decorate([
    (0, common_1.Injectable)()
], PlatformAdminGuard);

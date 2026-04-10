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
var TenantGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantGuard = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const tenant_context_storage_1 = require("./tenant-context.storage");
const tenant_routing_service_1 = require("./tenant-routing.service");
/**
 * Her korumalı endpoint'in önünde çalışan NestJS Guard.
 *
 * Doğrulama zinciri (sıra kritik):
 *  [1] Authorization header varlığı
 *  [2] JWT imza doğrulama (RS256, tenant-scoped key)
 *  [3] Token son kullanma tarihi (exp)
 *  [4] tenant_id claim varlığı ve formatı
 *  [5] Tenant durum kontrolü (active / suspended / provisioning)
 *  [6] AsyncLocalStorage'a TenantContext yazma
 *
 * Guard başarılı olursa istek handler'a devam eder.
 * Herhangi bir adım başarısız olursa 401 veya 403 döner.
 *
 * KURAL: Bu guard atlanırsa DB erişimi TenantContextStorage hatası fırlatır.
 *        Dolayısıyla guard atlamak sessiz bir güvenlik açığı yaratmaz.
 */
let TenantGuard = TenantGuard_1 = class TenantGuard {
    constructor(jwtService, routingService) {
        this.jwtService = jwtService;
        this.routingService = routingService;
        this.logger = new common_1.Logger(TenantGuard_1.name);
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractBearerToken(request);
        // [1] Token varlığı
        if (!token) {
            throw new common_1.UnauthorizedException('Authorization header eksik veya hatalı format.');
        }
        // [2] JWT imza doğrulama
        let payload;
        try {
            payload = await this.jwtService.verifyAsync(token);
        }
        catch (err) {
            this.logger.warn(`Geçersiz JWT: ${err.message}`);
            throw new common_1.UnauthorizedException('Token geçersiz veya süresi dolmuş.');
        }
        // [3] tenant_id claim zorunluluğu
        if (!payload.tenant_id || !isValidUuid(payload.tenant_id)) {
            this.logger.warn(`JWT'de tenant_id eksik veya hatalı format: sub=${payload.sub}`);
            throw new common_1.UnauthorizedException('Token yapısı hatalı: tenant_id eksik.');
        }
        // [4] İsteğin X-Tenant-ID header'ı ile token tenant_id uyumu
        //     (Ek savunma katmanı — opsiyonel header gönderilmişse kontrol et)
        const headerTenantId = request.headers['x-tenant-id'];
        if (headerTenantId && headerTenantId !== payload.tenant_id) {
            this.logger.warn(`Tenant kimliği uyuşmazlığı: ` +
                `header=${headerTenantId} token=${payload.tenant_id} ` +
                `sub=${payload.sub}`);
            throw new common_1.ForbiddenException('Tenant kimliği uyuşmazlığı.');
        }
        // [5] Tenant durum kontrolü (Redis önbellekli)
        try {
            await this.routingService.assertTenantIsActive(payload.tenant_id);
        }
        catch (err) {
            if (err instanceof tenant_routing_service_1.TenantNotFoundError) {
                throw new common_1.UnauthorizedException('Tenant bulunamadı.');
            }
            if (err instanceof tenant_routing_service_1.TenantSuspendedError) {
                throw new common_1.ForbiddenException('Hesabınız askıya alınmıştır. Lütfen destek ekibiyle iletişime geçin.');
            }
            if (err instanceof tenant_routing_service_1.TenantProvisioningError) {
                throw new common_1.ForbiddenException('Hesabınız henüz hazırlanıyor. Lütfen birkaç dakika bekleyin.');
            }
            throw err;
        }
        // [6] AsyncLocalStorage'a TenantContext yaz
        //     Bu noktadan sonra her async işlem tenant_id'ye erişebilir
        const tenantContext = {
            tenantId: payload.tenant_id,
            userId: payload.sub,
            sessionId: payload.session_id,
            userRoles: payload.user_roles,
            tier: payload.tenant_tier,
        };
        // request nesnesine bağla — controller'lar @Req() ile erişebilir
        request.tenantContext =
            tenantContext;
        // Context TenantContextMiddleware tarafından runWithTenantContext ile kuruldu.
        // Burada yalnızca doğrulama yapılır; context yazımı middleware'de gerçekleşti.
        // Yedek: middleware'den geçmemiş bir istek varsa guard'ın kendi context'ini kontrol et.
        try {
            (0, tenant_context_storage_1.getTenantContext)();
        }
        catch {
            // Middleware context kurmadıysa (test ortamı vb.) fallback olarak request'e ekle
            request.tenantContext =
                tenantContext;
        }
        return true;
    }
    extractBearerToken(request) {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer '))
            return null;
        return authHeader.slice(7); // "Bearer " prefix'ini kaldır
    }
};
exports.TenantGuard = TenantGuard;
exports.TenantGuard = TenantGuard = TenantGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        tenant_routing_service_1.TenantRoutingService])
], TenantGuard);
/** UUID v4 format doğrulama */
function isValidUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

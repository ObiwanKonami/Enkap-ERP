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
var TenantContextMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantContextMiddleware = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const tenant_context_storage_1 = require("./tenant-context.storage");
const tenant_routing_service_1 = require("./tenant-routing.service");
/**
 * Tenant context middleware — her HTTP isteğinin başında çalışır.
 *
 * Neden guard değil middleware?
 *  Guard'da `AsyncLocalStorage.enterWith()` çağrısı, async/await ile oluşan
 *  Promise continuation'larında context kaybına yol açar. Middleware ise
 *  `runWithTenantContext(ctx, next)` ile tüm pipeline'ı (guard, handler, servis)
 *  aynı `run()` async context'i içinde çalıştırır — context kaybolmaz.
 *
 * Davranış:
 *  - Bearer token yoksa → next() çağrılır; TenantGuard gerekiyorsa 401 döner.
 *  - Token geçersiz / tenant pasif → next() çağrılır; TenantGuard 401/403 döner.
 *  - Her şey OK → runWithTenantContext(ctx, next) ile pipeline başlatılır.
 */
let TenantContextMiddleware = TenantContextMiddleware_1 = class TenantContextMiddleware {
    constructor(jwtService, routingService) {
        this.jwtService = jwtService;
        this.routingService = routingService;
        this.logger = new common_1.Logger(TenantContextMiddleware_1.name);
    }
    use(req, _res, next) {
        const token = this.extractToken(req);
        if (!token) {
            next();
            return;
        }
        this.jwtService
            .verifyAsync(token)
            .then(async (payload) => {
            if (!payload?.tenant_id || !isValidUuid(payload.tenant_id)) {
                next();
                return;
            }
            await this.routingService.assertTenantIsActive(payload.tenant_id);
            const ctx = {
                tenantId: payload.tenant_id,
                userId: payload.sub,
                sessionId: payload.session_id,
                userRoles: payload.user_roles ?? [],
                tier: payload.tenant_tier,
            };
            // Tüm pipeline (guard + handler + servis) bu context içinde çalışır
            (0, tenant_context_storage_1.runWithTenantContext)(ctx, next);
        })
            .catch((err) => {
            // Token geçersiz veya tenant hataları — TenantGuard zaten 401/403 döner
            this.logger.debug(`Context kurulamadı (guard handle edecek): ${err.message}`);
            next();
        });
    }
    extractToken(req) {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer '))
            return null;
        return auth.slice(7);
    }
};
exports.TenantContextMiddleware = TenantContextMiddleware;
exports.TenantContextMiddleware = TenantContextMiddleware = TenantContextMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        tenant_routing_service_1.TenantRoutingService])
], TenantContextMiddleware);
function isValidUuid(v) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const tenant_routing_service_1 = require("./tenant-routing.service");
const tenant_datasource_manager_1 = require("./tenant-datasource.manager");
const tenant_guard_1 = require("./tenant.guard");
const tenant_context_middleware_1 = require("./tenant-context.middleware");
/**
 * @Global() dekoratörü ile işaretlenmiştir — bir kez import etmek yeterli.
 *
 * Her mikroservisin AppModule'una bir kez eklenir:
 *
 *   @Module({
 *     imports: [TenantModule],
 *     ...
 *   })
 *   export class AppModule {}
 *
 * Sonrasında constructor injection ile kullanılır:
 *
 *   constructor(
 *     private readonly tenantDataSourceManager: TenantDataSourceManager,
 *   ) {}
 */
let TenantModule = class TenantModule {
};
exports.TenantModule = TenantModule;
exports.TenantModule = TenantModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            jwt_1.JwtModule.registerAsync({
                useFactory: () => ({
                    // Not: Production'da Vault'tan alınan per-tenant public key kullanılır.
                    // Auth service rotate edince bu secret değişir.
                    // Bu sadece local dev için — production'da JwtModule.register kullanma,
                    // bunun yerine per-tenant key lookup ile özel JwtService yaz.
                    secret: process.env.JWT_SECRET ?? 'CHANGE_IN_PRODUCTION',
                    signOptions: { expiresIn: '1h' },
                    verifyOptions: {
                        algorithms: ['HS256', 'RS256'],
                        issuer: process.env.JWT_ISSUER ?? 'https://auth.enkap.local',
                        audience: ['erp-api'],
                    },
                }),
            }),
        ],
        providers: [
            tenant_routing_service_1.TenantRoutingService,
            tenant_datasource_manager_1.TenantDataSourceManager,
            tenant_guard_1.TenantGuard,
            tenant_context_middleware_1.TenantContextMiddleware,
        ],
        exports: [
            tenant_routing_service_1.TenantRoutingService,
            tenant_datasource_manager_1.TenantDataSourceManager,
            tenant_guard_1.TenantGuard,
            tenant_context_middleware_1.TenantContextMiddleware,
            jwt_1.JwtModule,
        ],
    })
], TenantModule);

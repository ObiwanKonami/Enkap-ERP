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
var AuditInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditInterceptor = exports.Auditable = exports.AUDIT_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const operators_1 = require("rxjs/operators");
const rxjs_1 = require("rxjs");
const tenant_context_storage_1 = require("../tenant/tenant-context.storage");
const tenant_datasource_manager_1 = require("../tenant/tenant-datasource.manager");
exports.AUDIT_KEY = 'AUDIT_META';
/**
 * @Auditable() dekoratörü.
 *
 * Controller metotlarına uygulanır. Her çağrıda KVKK denetim kaydı oluşturulur.
 *
 * Kullanım:
 *  @Get(':id')
 *  @Auditable({ action: 'READ', resource: 'employee.tckn' })
 *  findOne(@Param('id') id: string) { ... }
 */
const Auditable = (meta) => (0, common_1.SetMetadata)(exports.AUDIT_KEY, meta);
exports.Auditable = Auditable;
/**
 * KVKK Denetim İzi Interceptor.
 *
 * @Auditable() ile işaretlenmiş endpoint'lerin her çağrısında
 * tenant'ın `audit_logs` tablosuna kayıt düşer.
 *
 * Kayıt stratejisi:
 *  - Başarılı istek: tap() ile response'tan sonra
 *  - Hatalı istek:   catchError() ile hata propagasyonundan önce
 *  - Tenant context yoksa (auth login vb.): sessizce atlar
 *  - Log yazma hatası: ana isteği asla etkilemez
 *
 * TenantDataSourceManager kullanır — her tenant kendi şemasına yazar.
 */
let AuditInterceptor = AuditInterceptor_1 = class AuditInterceptor {
    constructor(reflector, dsManager) {
        this.reflector = reflector;
        this.dsManager = dsManager;
        this.logger = new common_1.Logger(AuditInterceptor_1.name);
    }
    intercept(context, next) {
        const meta = this.reflector.getAllAndOverride(exports.AUDIT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        // @Auditable() yoksa geç
        if (!meta)
            return next.handle();
        const request = context.switchToHttp().getRequest();
        const started = Date.now();
        // Tenant context mevcut değilse (login vb.) kaydı atla
        let tenantId;
        let userId = null;
        let email = null;
        try {
            const ctx = (0, tenant_context_storage_1.getTenantContext)();
            tenantId = ctx.tenantId;
            userId = ctx.userId ?? null;
            email = ctx.email ?? null;
        }
        catch {
            return next.handle();
        }
        const ipAddress = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
            ?? request.ip
            ?? null;
        const requestPath = request.url ?? null;
        const httpMethod = request.method ?? null;
        const resourceId = this.extractResourceId(request);
        return next.handle().pipe((0, operators_1.tap)(() => {
            this.writeLog(tenantId, {
                userId,
                email,
                action: meta.action,
                resource: meta.resource,
                resourceId,
                httpMethod,
                requestPath,
                ipAddress,
                isSuccess: true,
                details: { durationMs: Date.now() - started },
            }).catch((err) => this.logger.warn(`Audit log yazılamadı: ${err.message}`));
        }), (0, operators_1.catchError)((err) => {
            this.writeLog(tenantId, {
                userId,
                email,
                action: meta.action,
                resource: meta.resource,
                resourceId,
                httpMethod,
                requestPath,
                ipAddress,
                isSuccess: false,
                details: {
                    errorMessage: err instanceof Error ? err.message : String(err),
                    durationMs: Date.now() - started,
                },
            }).catch((writeErr) => this.logger.warn(`Audit log yazılamadı: ${writeErr.message}`));
            return (0, rxjs_1.throwError)(() => err);
        }));
    }
    async writeLog(tenantId, params) {
        const ds = await this.dsManager.getDataSource(tenantId);
        await ds.query(`INSERT INTO audit_logs (
         id, tenant_id, user_id, user_email, action, resource, resource_id,
         http_method, request_path, ip_address, is_success, details
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       )`, [
            tenantId,
            params.userId,
            params.email,
            params.action,
            params.resource,
            params.resourceId,
            params.httpMethod,
            params.requestPath,
            params.ipAddress,
            params.isSuccess,
            params.details ? JSON.stringify(params.details) : null,
        ]);
    }
    /** URL path'inden kaynak ID'sini çıkar (UUID veya numeric) */
    extractResourceId(request) {
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const match = request.url?.match(uuidRegex);
        return match ? match[0] : null;
    }
};
exports.AuditInterceptor = AuditInterceptor;
exports.AuditInterceptor = AuditInterceptor = AuditInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        tenant_datasource_manager_1.TenantDataSourceManager])
], AuditInterceptor);

import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { TenantDataSourceManager } from '../tenant/tenant-datasource.manager';
import type { AuditAction, AuditResource } from './audit-log.entity';
export declare const AUDIT_KEY = "AUDIT_META";
export interface AuditMeta {
    action: AuditAction;
    resource: AuditResource | string;
}
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
export declare const Auditable: (meta: AuditMeta) => import("node_modules/@nestjs/common").CustomDecorator<string>;
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
export declare class AuditInterceptor implements NestInterceptor {
    private readonly reflector;
    private readonly dsManager;
    private readonly logger;
    constructor(reflector: Reflector, dsManager: TenantDataSourceManager);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
    private writeLog;
    /** URL path'inden kaynak ID'sini çıkar (UUID veya numeric) */
    private extractResourceId;
}

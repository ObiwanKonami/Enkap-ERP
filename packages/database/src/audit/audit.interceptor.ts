import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import type { FastifyRequest } from 'fastify';
import { getTenantContext } from '../tenant/tenant-context.storage';
import { TenantDataSourceManager } from '../tenant/tenant-datasource.manager';
import type { AuditAction, AuditResource } from './audit-log.entity';

export const AUDIT_KEY = 'AUDIT_META';

export interface AuditMeta {
  action:   AuditAction;
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
export const Auditable = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);

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
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector:  Reflector,
    private readonly dsManager:  TenantDataSourceManager,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMeta | undefined>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // @Auditable() yoksa geç
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const started  = Date.now();

    // Tenant context mevcut değilse (login vb.) kaydı atla
    let tenantId: string;
    let userId:   string | null = null;
    let email:    string | null = null;

    try {
      const ctx = getTenantContext();
      tenantId  = ctx.tenantId;
      userId    = ctx.userId ?? null;
      email     = (ctx as { email?: string }).email ?? null;
    } catch {
      return next.handle();
    }

    const ipAddress   = (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                     ?? request.ip
                     ?? null;
    const requestPath = request.url ?? null;
    const httpMethod  = request.method ?? null;
    const resourceId  = this.extractResourceId(request);

    return next.handle().pipe(
      tap(() => {
        this.writeLog(tenantId, {
          userId,
          email,
          action:      meta.action,
          resource:    meta.resource,
          resourceId,
          httpMethod,
          requestPath,
          ipAddress,
          isSuccess:   true,
          details:     { durationMs: Date.now() - started },
        }).catch((err: Error) =>
          this.logger.warn(`Audit log yazılamadı: ${err.message}`),
        );
      }),
      catchError((err: unknown) => {
        this.writeLog(tenantId, {
          userId,
          email,
          action:      meta.action,
          resource:    meta.resource,
          resourceId,
          httpMethod,
          requestPath,
          ipAddress,
          isSuccess:   false,
          details:     {
            errorMessage: err instanceof Error ? err.message : String(err),
            durationMs:   Date.now() - started,
          },
        }).catch((writeErr: Error) =>
          this.logger.warn(`Audit log yazılamadı: ${writeErr.message}`),
        );
        return throwError(() => err);
      }),
    );
  }

  private async writeLog(
    tenantId: string,
    params: {
      userId:      string | null;
      email:       string | null;
      action:      AuditAction;
      resource:    string;
      resourceId:  string | null;
      httpMethod:  string | null;
      requestPath: string | null;
      ipAddress:   string | null;
      isSuccess:   boolean;
      details:     Record<string, unknown> | null;
    },
  ): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);

    await ds.query(
      `INSERT INTO audit_logs (
         id, tenant_id, user_id, user_email, action, resource, resource_id,
         http_method, request_path, ip_address, is_success, details
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
       )`,
      [
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
      ],
    );
  }

  /** URL path'inden kaynak ID'sini çıkar (UUID veya numeric) */
  private extractResourceId(request: FastifyRequest): string | null {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    const match = request.url?.match(uuidRegex);
    return match ? match[0] : null;
  }
}

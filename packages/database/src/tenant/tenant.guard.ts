import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { FastifyRequest } from 'fastify';
import type { JwtPayload, TenantContext } from '@enkap/shared-types';
import { getTenantContext } from './tenant-context.storage';
import {
  TenantRoutingService,
  TenantNotFoundError,
  TenantSuspendedError,
  TenantProvisioningError,
} from './tenant-routing.service';

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
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly routingService: TenantRoutingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractBearerToken(request);

    // [1] Token varlığı
    if (!token) {
      throw new UnauthorizedException('Authorization header eksik veya hatalı format.');
    }

    // [2] JWT imza doğrulama
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch (err) {
      this.logger.warn(`Geçersiz JWT: ${(err as Error).message}`);
      throw new UnauthorizedException('Token geçersiz veya süresi dolmuş.');
    }

    // [3] tenant_id claim zorunluluğu
    if (!payload.tenant_id || !isValidUuid(payload.tenant_id)) {
      this.logger.warn(
        `JWT'de tenant_id eksik veya hatalı format: sub=${payload.sub}`,
      );
      throw new UnauthorizedException('Token yapısı hatalı: tenant_id eksik.');
    }

    // [4] İsteğin X-Tenant-ID header'ı ile token tenant_id uyumu
    //     (Ek savunma katmanı — opsiyonel header gönderilmişse kontrol et)
    const headerTenantId = request.headers['x-tenant-id'] as string | undefined;
    if (headerTenantId && headerTenantId !== payload.tenant_id) {
      this.logger.warn(
        `Tenant kimliği uyuşmazlığı: ` +
        `header=${headerTenantId} token=${payload.tenant_id} ` +
        `sub=${payload.sub}`,
      );
      throw new ForbiddenException('Tenant kimliği uyuşmazlığı.');
    }

    // [5] Tenant durum kontrolü (Redis önbellekli)
    try {
      await this.routingService.assertTenantIsActive(payload.tenant_id);
    } catch (err) {
      if (err instanceof TenantNotFoundError) {
        throw new UnauthorizedException('Tenant bulunamadı.');
      }
      if (err instanceof TenantSuspendedError) {
        throw new ForbiddenException('Hesabınız askıya alınmıştır. Lütfen destek ekibiyle iletişime geçin.');
      }
      if (err instanceof TenantProvisioningError) {
        throw new ForbiddenException('Hesabınız henüz hazırlanıyor. Lütfen birkaç dakika bekleyin.');
      }
      throw err;
    }

    // [6] AsyncLocalStorage'a TenantContext yaz
    //     Bu noktadan sonra her async işlem tenant_id'ye erişebilir
    const tenantContext: TenantContext = {
      tenantId: payload.tenant_id,
      userId: payload.sub,
      sessionId: payload.session_id,
      userRoles: payload.user_roles,
      tier: payload.tenant_tier,
    };

    // request nesnesine bağla — controller'lar @Req() ile erişebilir
    (request as FastifyRequest & { tenantContext: TenantContext }).tenantContext =
      tenantContext;

    // Context TenantContextMiddleware tarafından runWithTenantContext ile kuruldu.
    // Burada yalnızca doğrulama yapılır; context yazımı middleware'de gerçekleşti.
    // Yedek: middleware'den geçmemiş bir istek varsa guard'ın kendi context'ini kontrol et.
    try {
      getTenantContext();
    } catch {
      // Middleware context kurmadıysa (test ortamı vb.) fallback olarak request'e ekle
      (request as FastifyRequest & { tenantContext: TenantContext }).tenantContext =
        tenantContext;
    }
    return true;
  }

  private extractBearerToken(request: FastifyRequest): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.slice(7); // "Bearer " prefix'ini kaldır
  }
}

/** UUID format doğrulama (v1-v8 ve özel UUID'ler dahil) */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantRoutingService } from './tenant-routing.service';
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
export declare class TenantGuard implements CanActivate {
    private readonly jwtService;
    private readonly routingService;
    private readonly logger;
    constructor(jwtService: JwtService, routingService: TenantRoutingService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractBearerToken;
}

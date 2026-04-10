import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { IncomingMessage, ServerResponse } from 'http';
import type { JwtPayload, TenantContext } from '@enkap/shared-types';
import { runWithTenantContext } from './tenant-context.storage';
import { TenantRoutingService } from './tenant-routing.service';

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
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly routingService: TenantRoutingService,
  ) {}

  use(req: IncomingMessage, _res: ServerResponse, next: () => void): void {
    const token = this.extractToken(req);

    if (!token) {
      next();
      return;
    }

    this.jwtService
      .verifyAsync<JwtPayload>(token)
      .then(async (payload) => {
        if (!payload?.tenant_id || !isValidUuid(payload.tenant_id)) {
          next();
          return;
        }

        await this.routingService.assertTenantIsActive(payload.tenant_id);

        const ctx: TenantContext = {
          tenantId:  payload.tenant_id,
          userId:    payload.sub,
          sessionId: payload.session_id,
          userRoles: payload.user_roles ?? [],
          tier:      payload.tenant_tier,
        };

        // Tüm pipeline (guard + handler + servis) bu context içinde çalışır
        runWithTenantContext(ctx, next);
      })
      .catch((err: unknown) => {
        // Token geçersiz veya tenant hataları — TenantGuard zaten 401/403 döner
        this.logger.debug(
          `Context kurulamadı (guard handle edecek): ${(err as Error).message}`,
        );
        next();
      });
  }

  private extractToken(req: IncomingMessage): string | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}

/** UUID format doğrulama (v1-v8 ve özel UUID'ler dahil) */
function isValidUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

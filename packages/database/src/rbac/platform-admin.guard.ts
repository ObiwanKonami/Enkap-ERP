import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { PlatformJwtPayload } from '@enkap/shared-types';

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
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  // Module bağımlılığı gerektirmeden doğrulama için tekil instance
  private readonly jwtService = new JwtService({});

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      platformAdmin?: PlatformJwtPayload;
    }>();

    const authHeader = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Platform admin token gereklidir.');
    }

    const token = authHeader.slice(7);

    try {
      const payload = this.jwtService.verify<PlatformJwtPayload>(token, {
        secret: process.env['JWT_SECRET'] ?? 'CHANGE_IN_PRODUCTION',
        issuer: process.env['JWT_ISSUER'] ?? 'https://auth.enkap.local',
        audience: 'platform-api',
        algorithms: ['HS256'],
      });

      if (!payload.platform_role) {
        throw new UnauthorizedException('Platform yetkiniz bulunmamaktadır.');
      }

      // Sonraki handler'larda erişilebilir
      request.platformAdmin = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş platform token.');
    }
  }
}

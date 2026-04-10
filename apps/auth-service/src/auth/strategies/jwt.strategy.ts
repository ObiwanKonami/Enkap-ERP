import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '@enkap/shared-types';
import { RefreshTokenStore } from '../refresh-token.store';

/**
 * JWT Bearer token doğrulama stratejisi.
 *
 * Her korumalı endpoint'te çalışır:
 *  1. Authorization: Bearer {token} header'ından token çıkarır
 *  2. İmza doğrular (HS256 — production'da RS256)
 *  3. exp, iss, aud claim'lerini doğrular
 *  4. JTI'ı Redis revoke listesinde arar
 *
 * Doğrulama başarılı olursa request.user = JwtPayload olarak ayarlanır.
 * TenantGuard bu stratejinin üstünde çalışarak tenant context'i bağlar.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly refreshTokenStore: RefreshTokenStore) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'CHANGE_IN_PRODUCTION',
      issuer: process.env.JWT_ISSUER ?? 'https://auth.enkap.local',
      audience: 'erp-api',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // JTI revokasyon kontrolü (logout veya güvenlik ihlali sonrası)
    const isRevoked = await this.refreshTokenStore.isAccessTokenRevoked(
      payload.jti,
      payload.tenant_id,
    );

    if (isRevoked) {
      this.logger.warn(
        `Revoke edilmiş token kullanım girişimi: ` +
        `jti=${payload.jti} tenant=${payload.tenant_id}`,
      );
      throw new UnauthorizedException('Token geçersiz kılınmış. Lütfen tekrar giriş yapın.');
    }

    // tenant_id zorunluluğu (ek güvenlik katmanı)
    if (!payload.tenant_id) {
      throw new UnauthorizedException('Token yapısı hatalı.');
    }

    return payload;
  }
}

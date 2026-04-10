import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { PlatformJwtPayload } from '@enkap/shared-types';
import { PlatformRefreshTokenStore } from './platform-refresh-token.store';

/**
 * Platform admin JWT doğrulama stratejisi.
 *
 * Tenant JwtStrategy'den farkları:
 *  - `aud: 'platform-api'` zorunludur (tenant token'ları reddedilir)
 *  - `tenant_id` kontrolü yoktur
 *  - Revokasyon kontrolü `platform:revoked:` namespace'inde
 */
@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(private readonly tokenStore: PlatformRefreshTokenStore) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env['JWT_SECRET'] ?? 'CHANGE_IN_PRODUCTION',
      issuer:      process.env['JWT_ISSUER'] ?? 'https://auth.enkap.local',
      audience:    'platform-api',
      algorithms:  ['HS256'],
    });
  }

  async validate(payload: PlatformJwtPayload): Promise<PlatformJwtPayload> {
    if (!payload.platform_role) {
      throw new UnauthorizedException('Platform yetkiniz bulunmamaktadır.');
    }

    const isRevoked = await this.tokenStore.isAccessTokenRevoked(payload.jti);
    if (isRevoked) {
      throw new UnauthorizedException('Token geçersiz kılınmış. Lütfen tekrar giriş yapın.');
    }

    return payload;
  }
}

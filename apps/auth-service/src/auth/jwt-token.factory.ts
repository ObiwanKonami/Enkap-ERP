import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { JwtPayload, AuthTokenPair, TenantTier } from '@enkap/shared-types';

/** Access token geçerlilik süresi */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 saat

/** Refresh token geçerlilik süresi */
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 gün

export interface TokenSubject {
  userId: string;
  tenantId: string;
  tenantTier: TenantTier;
  userRoles: string[];
  sessionId: string;
  kvkkConsentVersion: string;
}

/**
 * JWT token çifti üreticisi.
 *
 * Her access token şunları içerir:
 *  - tenant_id: tüm veri erişim kapsamını belirler
 *  - jti: tekil token kimliği — revokasyon için Redis'te kontrol edilir
 *  - user_roles: yetkilendirme kararları için
 *  - session_id: oturum sonlandırma için
 *
 * Production notu:
 *  Şu an HS256 kullanılıyor (tek secret). Production'da her tenant için
 *  ayrı RSA-256 anahtar çifti (Vault'tan) kullanılmalı. Bunu etkinleştirmek
 *  için JwtService yerine doğrudan `jose` kütüphanesiyle imzalama yapılır.
 */
@Injectable()
export class JwtTokenFactory {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Kullanıcı için access token + refresh token çifti üretir.
   * Her çağrıda benzersiz JTI ile yeni token oluşturulur.
   */
  async createTokenPair(subject: TokenSubject): Promise<AuthTokenPair> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const payload: JwtPayload = {
      sub: subject.userId,
      tenant_id: subject.tenantId,
      tenant_tier: subject.tenantTier,
      user_roles: subject.userRoles,
      session_id: subject.sessionId,
      jti,
      iss: process.env.JWT_ISSUER ?? 'https://auth.enkap.local',
      aud: ['erp-api'],
      iat: now,
      // exp kaldırıldı — JwtModule signOptions.expiresIn yönetiyor (çakışma önlenir)
      kvkk_consent_version: subject.kvkkConsentVersion,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      // Refresh token payload'ı minimal — yalnızca lookup bilgisi taşır
      this.jwtService.signAsync(
        {
          sub: subject.userId,
          tenant_id: subject.tenantId,
          session_id: subject.sessionId,
          jti: randomUUID(), // Refresh token için ayrı JTI
          type: 'refresh',
        },
        { expiresIn: REFRESH_TOKEN_TTL_SECONDS },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  /** Access token payload'ını doğrulama yapmadan decode eder (loglama vb.) */
  decodeAccessToken(token: string): JwtPayload | null {
    try {
      return this.jwtService.decode<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}

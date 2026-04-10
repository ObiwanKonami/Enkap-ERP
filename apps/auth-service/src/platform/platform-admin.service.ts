import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { PlatformJwtPayload, PlatformRole, AuthTokenPair } from '@enkap/shared-types';
import { PlatformAdminRepository } from './platform-admin.repository';
import { PlatformRefreshTokenStore } from './platform-refresh-token.store';

const ACCESS_TTL_SECONDS  = 60 * 60;          // 1 saat
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 gün

export interface PlatformLoginResult {
  tokenPair: AuthTokenPair;
  adminId: string;
  email: string;
  platformRole: PlatformRole;
}

/**
 * Platform (SaaS) admin kimlik doğrulama servisi.
 *
 * Tenant auth servisinden ayrı tutulur:
 *  - Tenant DB'ye hiç dokunmaz
 *  - Token'larda `tenant_id` yoktur
 *  - `aud: 'platform-api'` — tenant token'larıyla karışmaz
 */
@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    private readonly adminRepo: PlatformAdminRepository,
    private readonly tokenStore: PlatformRefreshTokenStore,
    private readonly jwtService: JwtService,
  ) {}

  async login(admin: { id: string; email: string; role: PlatformRole }): Promise<PlatformLoginResult> {
    const sessionId = randomUUID();
    const tokenPair = await this.createTokenPair(admin.id, admin.email, admin.role, sessionId);

    await this.tokenStore.save(tokenPair.refreshToken, {
      adminId: admin.id,
      sessionId,
      createdAt: Date.now(),
    });

    void this.adminRepo.updateLastLogin(admin.id);

    this.logger.log(`Platform admin girişi: adminId=${admin.id} email=${admin.email}`);

    return {
      tokenPair,
      adminId:      admin.id,
      email:        admin.email,
      platformRole: admin.role,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokenPair> {
    const stored = await this.tokenStore.consumeAndValidate(refreshToken);

    if (!stored) {
      this.logger.warn('Geçersiz platform refresh token girişimi.');
      throw new UnauthorizedException('Yenileme token\'ı geçersiz. Lütfen tekrar giriş yapın.');
    }

    const admin = await this.adminRepo.findById(stored.adminId);
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Platform admin hesabı devre dışı.');
    }

    const newPair = await this.createTokenPair(
      admin.id, admin.email, admin.role as PlatformRole, stored.sessionId,
    );

    await this.tokenStore.save(newPair.refreshToken, {
      adminId: admin.id,
      sessionId: stored.sessionId,
      createdAt: Date.now(),
    });

    return newPair;
  }

  async logout(jti: string, sessionId: string): Promise<void> {
    await Promise.all([
      this.tokenStore.revokeAccessToken(jti),
      this.tokenStore.revokeAllForSession(sessionId),
    ]);
    this.logger.log(`Platform admin çıkışı: session=${sessionId}`);
  }

  // ─── Yardımcı ─────────────────────────────────────────────────────────────

  private async createTokenPair(
    adminId: string,
    email: string,
    role: PlatformRole,
    sessionId: string,
  ): Promise<AuthTokenPair> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // aud ve iss signAsync options'a taşındı — payload'da olursa JwtModule signOptions ile çakışır
    const payload = {
      sub:           adminId,
      platform_role: role,
      email,
      session_id:    sessionId,
      jti,
      iat:           now,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: ACCESS_TTL_SECONDS,
        audience:  'platform-api',   // JwtModule'ün 'erp-api' değerini ezer
      }),
      this.jwtService.signAsync(
        { sub: adminId, session_id: sessionId, jti: randomUUID(), type: 'platform-refresh' },
        { expiresIn: REFRESH_TTL_SECONDS, audience: 'platform-api' },
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SECONDS };
  }
}

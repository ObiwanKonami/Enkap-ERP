import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type { AuthTokenPair } from '@enkap/shared-types';
import { JwtTokenFactory } from './jwt-token.factory';
import { RefreshTokenStore } from './refresh-token.store';
import { UserRepository } from '../user/user.repository';

export interface LoginResult {
  tokenPair: AuthTokenPair;
  userId: string;
  tenantId: string;
  tenantTier: string;
  roles: string[];
}

/**
 * Kimlik doğrulama iş mantığı.
 *
 * Akışlar:
 *  - login()   : Kimlik bilgilerini doğrula → token çifti üret
 *  - refresh() : Refresh token'ı rotasyonlu olarak yenile
 *  - logout()  : Oturumu ve tüm token'ları geçersiz kıl
 *
 * Şifre doğrulama:
 *  Kullanıcı tablosu her tenantın kendi şemasındadır.
 *  UserRepository, TenantDataSourceManager aracılığıyla tenant DB'ye erişir.
 *  LocalStrategy bcrypt ile şifre doğrulaması yapar.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly tokenFactory: JwtTokenFactory,
    private readonly refreshTokenStore: RefreshTokenStore,
    private readonly userRepository: UserRepository,
  ) {}

  /**
   * Kullanıcıyı doğrular ve token çifti döndürür.
   * LocalStrategy tarafından kimlik bilgileri doğrulandıktan sonra çağrılır.
   */
  async login(validatedUser: ValidatedUser): Promise<LoginResult> {
    const sessionId = randomUUID();

    const tokenPair = await this.tokenFactory.createTokenPair({
      userId: validatedUser.id,
      tenantId: validatedUser.tenantId,
      tenantTier: validatedUser.tenantTier,
      userRoles: validatedUser.roles,
      sessionId,
      kvkkConsentVersion: '2.1',
    });

    // Refresh token'ı Redis'e kaydet (hash'lenmiş)
    await this.refreshTokenStore.save(tokenPair.refreshToken, {
      userId: validatedUser.id,
      tenantId: validatedUser.tenantId,
      sessionId,
      createdAt: Date.now(),
    });

    this.logger.log(
      `Giriş başarılı: userId=${validatedUser.id} ` +
      `tenant=${validatedUser.tenantId}`,
    );

    return {
      tokenPair,
      userId:     validatedUser.id,
      tenantId:   validatedUser.tenantId,
      tenantTier: validatedUser.tenantTier,
      roles:      validatedUser.roles,
    };
  }

  /**
   * Refresh token ile yeni access token çifti üretir.
   *
   * Refresh Token Rotation:
   *  - Eski refresh token Redis'ten atomik olarak silinir
   *  - Yeni çift üretilir ve yeni refresh token kaydedilir
   *  - Eski refresh token kullanılmaya çalışılırsa: geçersiz (saldırı tespiti)
   */
  async refresh(
    refreshToken: string,
    tenantId: string,
  ): Promise<AuthTokenPair> {
    // Token'ı doğrula ve Redis'ten atomik sil (tek kullanımlık)
    const stored = await this.refreshTokenStore.consumeAndValidate(
      refreshToken,
      tenantId,
    );

    if (!stored) {
      this.logger.warn(
        `Geçersiz refresh token girişimi: tenant=${tenantId}`,
      );
      throw new UnauthorizedException(
        'Yenileme token\'ı geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.',
      );
    }

    // Kullanıcı bilgilerini tenant DB'den yeniden yükle
    // (roller veya hesap durumu değişmiş olabilir)
    const freshUser = await this.reloadUser(stored.userId, stored.tenantId);

    if (!freshUser || !freshUser.isActive) {
      throw new UnauthorizedException('Hesap devre dışı bırakılmış.');
    }

    // Yeni token çifti üret (aynı session_id ile — oturum devam ediyor)
    const newTokenPair = await this.tokenFactory.createTokenPair({
      userId: stored.userId,
      tenantId: stored.tenantId,
      tenantTier: freshUser.tenantTier,
      userRoles: freshUser.roles,
      sessionId: stored.sessionId,
      kvkkConsentVersion: '2.1',
    });

    // Yeni refresh token'ı kaydet
    await this.refreshTokenStore.save(newTokenPair.refreshToken, {
      userId: stored.userId,
      tenantId: stored.tenantId,
      sessionId: stored.sessionId,
      createdAt: Date.now(),
      previousHash: createHash('sha256')
        .update(refreshToken)
        .digest('hex')
        .slice(0, 16), // Zincir takibi için kısa hash
    });

    return newTokenPair;
  }

  /**
   * Oturumu sonlandırır:
   *  - Mevcut access token JTI'ını revoke listesine ekler
   *  - Oturuma ait tüm refresh token'ları siler
   */
  async logout(
    accessTokenJti: string,
    tenantId: string,
    sessionId: string,
  ): Promise<void> {
    await Promise.all([
      this.refreshTokenStore.revokeAccessToken(accessTokenJti, tenantId),
      this.refreshTokenStore.revokeAllForSession(tenantId, sessionId),
    ]);

    this.logger.log(
      `Çıkış yapıldı: tenant=${tenantId} session=${sessionId}`,
    );
  }

  /**
   * Kullanıcı bilgilerini tenant veritabanından yeniden yükler.
   *
   * Refresh token rotasyonunda çağrılır: roller veya hesap durumu
   * değişmiş olabileceğinden her refresh'te taze veri alınır.
   */
  private async reloadUser(
    userId: string,
    tenantId: string,
  ): Promise<FreshUserData | null> {
    const user = await this.userRepository.findById(tenantId, userId);
    if (!user) return null;

    return {
      id: user.id,
      isActive: user.isActive,
      roles: user.roles,
      tenantTier: user.tenantTier,
    };
  }
}

// ─── Tip tanımları ───────────────────────────────────────────────────────────

export interface ValidatedUser {
  id: string;
  email: string;
  tenantId: string;
  tenantTier: 'starter' | 'business' | 'enterprise';
  roles: string[];
}

interface FreshUserData {
  id: string;
  isActive: boolean;
  roles: string[];
  tenantTier: 'starter' | 'business' | 'enterprise';
}

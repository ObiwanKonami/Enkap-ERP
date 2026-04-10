import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'crypto';

/** Refresh token TTL (saniye) — JwtTokenFactory ile senkronize olmalı */
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 gün

/** Revoke edilen access token'ların TTL'i — access token ömrü kadar */
const ACCESS_REVOKE_TTL_SECONDS = 60 * 60; // 1 saat

interface StoredRefreshToken {
  userId: string;
  tenantId: string;
  sessionId: string;
  createdAt: number;
  /** Rotasyon zinciri: önceki token hash'i (replay saldırı tespiti için) */
  previousHash?: string;
}

/**
 * Redis tabanlı refresh token mağazası.
 *
 * Güvenlik garantileri:
 *  1. Her refresh token tek kullanımlık — kullanıldığında yeni üretilir
 *     ve eskisi silinir (refresh token rotation).
 *  2. Token'lar Redis'te ham değil SHA-256 hash'i ile saklanır.
 *     Böylece Redis ele geçirilse dahi token değerleri elde edilemez.
 *  3. Oturum sonlandırıldığında tüm token'lar atomik olarak silinir.
 *  4. Tenant izolasyonu: anahtar şablonu `rt:{tenantId}:{tokenHash}`
 */
@Injectable()
export class RefreshTokenStore implements OnModuleDestroy {
  private readonly logger = new Logger(RefreshTokenStore.name);
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Yeni refresh token'ı Redis'e kaydeder.
   *
   * @param token Ham refresh token (JWT string)
   * @param data Kullanıcı + tenant meta verisi
   */
  async save(token: string, data: StoredRefreshToken): Promise<void> {
    const hash = this.hash(token);
    const key = this.key(data.tenantId, hash);

    await this.redis.set(
      key,
      JSON.stringify(data),
      'EX',
      REFRESH_TTL_SECONDS,
    );

    // Oturum → token eşlemesi (logout için tüm token'ları bul)
    await this.redis.sadd(
      this.sessionKey(data.tenantId, data.sessionId),
      hash,
    );
    await this.redis.expire(
      this.sessionKey(data.tenantId, data.sessionId),
      REFRESH_TTL_SECONDS,
    );
  }

  /**
   * Token'ı doğrular ve rotate eder (atomik işlem).
   *
   * Döndürülen değer: token geçerliyse meta veri, aksi halde null.
   * Token geçerliyse Redis'ten silinir — tekrar kullanılamaz.
   */
  async consumeAndValidate(
    token: string,
    tenantId: string,
  ): Promise<StoredRefreshToken | null> {
    const hash = this.hash(token);
    const key = this.key(tenantId, hash);

    // Lua script ile atomik oku + sil (race condition önleme)
    const result = await this.redis.eval(
      `
      local val = redis.call('GET', KEYS[1])
      if val then
        redis.call('DEL', KEYS[1])
        return val
      end
      return nil
      `,
      1,
      key,
    ) as string | null;

    if (!result) return null;

    try {
      const data = JSON.parse(result) as StoredRefreshToken;

      // Tenant eşleşmesini doğrula (çapraz tenant token replay önleme)
      if (data.tenantId !== tenantId) {
        this.logger.warn(
          `Çapraz-tenant refresh token girişimi: ` +
          `token.tenantId=${data.tenantId} istek.tenantId=${tenantId}`,
        );
        return null;
      }

      // Session set'inden hash'i kaldır
      await this.redis.srem(
        this.sessionKey(tenantId, data.sessionId),
        hash,
      );

      return data;
    } catch {
      return null;
    }
  }

  /**
   * Access token'ı revoke listesine ekler.
   * TenantGuard her istekte bu listeyi kontrol eder.
   */
  async revokeAccessToken(jti: string, tenantId: string): Promise<void> {
    await this.redis.set(
      `revoked:${tenantId}:${jti}`,
      '1',
      'EX',
      ACCESS_REVOKE_TTL_SECONDS,
    );
  }

  /**
   * Access token'ın revoke edilip edilmediğini kontrol eder.
   */
  async isAccessTokenRevoked(jti: string, tenantId: string): Promise<boolean> {
    const exists = await this.redis.exists(`revoked:${tenantId}:${jti}`);
    return exists === 1;
  }

  /**
   * Belirli bir oturuma ait tüm refresh token'ları geçersiz kılar.
   * Logout ve "tüm cihazlardan çık" işlemleri için kullanılır.
   */
  async revokeAllForSession(tenantId: string, sessionId: string): Promise<void> {
    const sessionKey = this.sessionKey(tenantId, sessionId);
    const hashes = await this.redis.smembers(sessionKey);

    if (hashes.length > 0) {
      const tokenKeys = hashes.map((h) => this.key(tenantId, h));
      await this.redis.del(...tokenKeys, sessionKey);
    }

    this.logger.log(
      `Oturum token'ları temizlendi: tenant=${tenantId} ` +
      `session=${sessionId} token_count=${hashes.length}`,
    );
  }

  // ─── Yardımcı metodlar ──────────────────────────────────────────────────────

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private key(tenantId: string, tokenHash: string): string {
    return `rt:${tenantId}:${tokenHash}`;
  }

  private sessionKey(tenantId: string, sessionId: string): string {
    return `session:${tenantId}:${sessionId}:refresh_tokens`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

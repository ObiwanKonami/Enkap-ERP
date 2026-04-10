import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'crypto';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 gün
const ACCESS_REVOKE_TTL_SECONDS = 60 * 60;     // 1 saat

export interface StoredPlatformToken {
  adminId: string;
  sessionId: string;
  createdAt: number;
}

/**
 * Platform admin refresh token mağazası.
 *
 * Tenant token store'undan bağımsız — anahtar şablonu `platform:rt:{tokenHash}`.
 * Tenant izolasyonu olmadığından tenantId parametresi kullanılmaz.
 */
@Injectable()
export class PlatformRefreshTokenStore implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  async save(token: string, data: StoredPlatformToken): Promise<void> {
    const hash = this.hash(token);

    await this.redis.set(
      this.key(hash),
      JSON.stringify(data),
      'EX',
      REFRESH_TTL_SECONDS,
    );

    await this.redis.sadd(this.sessionKey(data.sessionId), hash);
    await this.redis.expire(this.sessionKey(data.sessionId), REFRESH_TTL_SECONDS);
  }

  /** Atomik oku + sil (tek kullanımlık) */
  async consumeAndValidate(token: string): Promise<StoredPlatformToken | null> {
    const hash = this.hash(token);
    const key = this.key(hash);

    const result = await this.redis.eval(
      `local val = redis.call('GET', KEYS[1])
       if val then redis.call('DEL', KEYS[1]) return val end
       return nil`,
      1,
      key,
    ) as string | null;

    if (!result) return null;

    try {
      const data = JSON.parse(result) as StoredPlatformToken;
      await this.redis.srem(this.sessionKey(data.sessionId), hash);
      return data;
    } catch {
      return null;
    }
  }

  async revokeAccessToken(jti: string): Promise<void> {
    await this.redis.set(
      `platform:revoked:${jti}`,
      '1',
      'EX',
      ACCESS_REVOKE_TTL_SECONDS,
    );
  }

  async isAccessTokenRevoked(jti: string): Promise<boolean> {
    const exists = await this.redis.exists(`platform:revoked:${jti}`);
    return exists === 1;
  }

  async revokeAllForSession(sessionId: string): Promise<void> {
    const sessionKey = this.sessionKey(sessionId);
    const hashes = await this.redis.smembers(sessionKey);
    if (hashes.length > 0) {
      const tokenKeys = hashes.map((h) => this.key(h));
      await this.redis.del(...tokenKeys, sessionKey);
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private key(tokenHash: string): string {
    return `platform:rt:${tokenHash}`;
  }

  private sessionKey(sessionId: string): string {
    return `platform:session:${sessionId}:refresh_tokens`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

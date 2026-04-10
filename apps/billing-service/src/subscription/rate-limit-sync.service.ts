import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Subscription } from './subscription.entity';
import { BillingPlan } from './plan.entity';

/**
 * Redis'teki rate-limit tier anahtarı şablonu.
 * Kong pre-function Lua plugin bu format'ı okur.
 */
const tierKey = (tenantId: string) => `rate_limit:tier:${tenantId}`;

/** Tier cache TTL: 6 saat (planı değiştiren billing event hemen günceller) */
const TIER_TTL_SECONDS = 6 * 3600;

/**
 * Plan Bazlı Rate Limit Senkronizasyonu.
 *
 * Tenant'ın aktif abonelik planını Redis'e yazar.
 * Kong API Gateway bu bilgiyi okuyarak tier bazlı rate limit uygular.
 *
 * Tetiklenme noktaları:
 *  1. Plan aktivasyonu / değişimi (SubscriptionService tarafından çağrılır)
 *  2. Her 4 saatte bir periyodik senkronizasyon (Redis expiry buffer)
 *  3. Servis başlangıcında toplu sync (Redis flush sonrası recovery)
 */
@Injectable()
export class RateLimitSyncService implements OnModuleInit {
  private readonly logger = new Logger(RateLimitSyncService.name);
  private readonly redis:  Redis;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(BillingPlan)
    private readonly planRepo: Repository<BillingPlan>,
  ) {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect:          true,
      maxRetriesPerRequest: 3,
    });
  }

  async onModuleInit(): Promise<void> {
    // Başlangıçta tüm aktif abonelik tier'larını Redis'e yaz
    await this.syncAll().catch((err: Error) =>
      this.logger.warn(`Başlangıç tier sync hatası: ${err.message}`),
    );
  }

  /**
   * Belirli bir tenant'ın tier'ını Redis'e yazar.
   * Plan aktivasyonu ve değişimi sonrası çağrılır.
   */
  async syncTenant(tenantId: string, planId: string): Promise<void> {
    const tier = this.resolveTier(planId);
    await this.redis.set(tierKey(tenantId), tier, 'EX', TIER_TTL_SECONDS);

    this.logger.log(`Rate-limit tier Redis'e yazıldı: tenant=${tenantId} tier=${tier}`);
  }

  /**
   * Her 4 saatte bir tüm aktif aboneliklerin tier'larını yenile.
   * Redis flush veya restart sonrası recovery için.
   */
  @Cron('0 */4 * * *')
  async syncAll(): Promise<void> {
    this.logger.log('Rate-limit tier toplu senkronizasyonu başlıyor...');

    const subscriptions = await this.subscriptionRepo.find({
      where: [{ status: 'active' }, { status: 'trialing' }],
      select: ['tenantId', 'planId'],
    });

    if (!subscriptions.length) {
      this.logger.log('Senkronize edilecek aktif abonelik yok.');
      return;
    }

    // Pipeline ile toplu write (N+1 önleme)
    const pipeline = this.redis.pipeline();

    for (const sub of subscriptions) {
      const tier = this.resolveTier(sub.planId);
      pipeline.set(tierKey(sub.tenantId), tier, 'EX', TIER_TTL_SECONDS);
    }

    await pipeline.exec();

    this.logger.log(
      `${subscriptions.length} tenant'ın rate-limit tier'ı güncellendi.`,
    );
  }

  /**
   * Abonelik iptal edilince Redis'teki tier'ı sil.
   * Silinince fallback olarak 'starter' limiti uygulanır.
   */
  async removeTenant(tenantId: string): Promise<void> {
    await this.redis.del(tierKey(tenantId));
    this.logger.log(`Rate-limit tier kaldırıldı: tenant=${tenantId}`);
  }

  // ─── Yardımcı ────────────────────────────────────────────────────────────

  /**
   * planId → Kong'un okuduğu tier adını çözer.
   * Bilinmeyen plan → starter (en kısıtlı, güvenli fallback).
   */
  private resolveTier(planId: string): 'starter' | 'business' | 'enterprise' {
    if (planId.includes('enterprise')) return 'enterprise';
    if (planId.includes('business'))   return 'business';
    return 'starter';
  }
}

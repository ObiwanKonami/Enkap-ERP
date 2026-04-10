import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Not, IsNull } from 'typeorm';
import { Subscription } from '../subscription/subscription.entity';
import { BillingPlan } from '../subscription/plan.entity';
import { PaymentService } from './payment.service';
import { PlatformSettingsService } from '../platform-settings.service';

/**
 * Dunning (Borç Takip) Servisi.
 *
 * past_due abonelikler için otomatik yeniden ödeme denemeleri.
 * Zamanlama: 3. gün → 7. gün → 14. gün sonra iptal.
 *
 * Günlük 09:00 İstanbul saatinde çalışır.
 */
@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(BillingPlan)
    private readonly planRepo: Repository<BillingPlan>,
    private readonly paymentService:    PaymentService,
    private readonly platformSettings:  PlatformSettingsService,
  ) {}

  /**
   * past_due abonelikler için yeniden ödeme dene.
   * Her gün 09:00 UTC+3 (06:00 UTC).
   */
  @Cron('0 6 * * *', { timeZone: 'Europe/Istanbul' })
  async processDunning(): Promise<void> {
    this.logger.log('Dunning döngüsü başladı');

    const now = new Date();

    // next_attempt_at geçmiş, hâlâ past_due olanlar
    // (Doğrudan QueryBuilder kullanıyoruz — TypeORM FindOperator kısıtlaması)
    const pastDueSubs = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'past_due' })
      .getMany();

    let retried   = 0;
    let recovered = 0;
    let cancelled = 0;

    for (const sub of pastDueSubs) {
      await this.processSingle(sub, now, {
        onRetried:   () => retried++,
        onRecovered: () => recovered++,
        onCancelled: () => cancelled++,
      });
    }

    this.logger.log(
      `Dunning tamamlandı: toplam=${pastDueSubs.length}, ` +
      `denendi=${retried}, kurtarıldı=${recovered}, iptal=${cancelled}`,
    );
  }

  private async processSingle(
    sub: Subscription,
    now: Date,
    counters: { onRetried: () => void; onRecovered: () => void; onCancelled: () => void },
  ): Promise<void> {
    // Deneme sayısını PaymentAttempt tablosundan al
    // (Basit versiyon: subscriptionRepo üzerinden raw count)
    const attemptCount = await this.getAttemptCount(sub.id);

    // Max deneme sayısı dunning_delays listesi uzunluğuna eşit → sonra iptal
    const delays = await this.platformSettings.get<number[]>('dunning_delays', [3, 7, 14]);
    if (attemptCount >= delays.length) {
      sub.status = 'cancelled';
      await this.subscriptionRepo.save(sub);
      this.logger.log(
        `Max dunning denemesi aşıldı, iptal: tenant=${sub.tenantId}`,
      );
      counters.onCancelled();
      return;
    }

    // Bir sonraki deneme zamanı gelmemiş
    const nextAttemptAt = await this.calcNextAttemptDate(sub.updatedAt, attemptCount);
    if (nextAttemptAt > now) {
      return;
    }

    const plan = await this.planRepo.findOne({ where: { id: sub.planId } });
    if (!plan || plan.priceKurus === 0) {
      // Ücretsiz plan dunning'e girmez
      sub.status = 'active';
      await this.subscriptionRepo.save(sub);
      return;
    }

    counters.onRetried();

    const result = await this.paymentService.retryCharge({
      subscription: sub,
      amountKurus:  plan.priceKurus,
      plan,
    });

    if (result.success) {
      sub.status = 'active';
      // Dönem ilerlet
      const periodEnd = new Date(sub.currentPeriodEnd ?? now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      sub.currentPeriodStart = now;
      sub.currentPeriodEnd   = periodEnd;
      await this.subscriptionRepo.save(sub);

      this.logger.log(
        `Dunning kurtarma başarılı: tenant=${sub.tenantId}, ` +
        `deneme=${attemptCount + 1}`,
      );
      counters.onRecovered();
    } else {
      // Hâlâ başarısız — past_due kalır, bir sonraki deneme tarihini güncelle
      this.logger.warn(
        `Dunning denemesi başarısız: tenant=${sub.tenantId}, ` +
        `deneme=${attemptCount + 1}, hata=${result.errorMessage}`,
      );
    }
  }

  /** Deneme geçmişi sayısını al (ham SQL) */
  private async getAttemptCount(subscriptionId: string): Promise<number> {
    const result = await this.subscriptionRepo.manager.query(
      `SELECT COUNT(*) AS cnt
       FROM payment_attempts
       WHERE subscription_id = $1 AND status = 'failed'`,
      [subscriptionId],
    );
    return parseInt(result[0]?.cnt ?? '0', 10);
  }

  /** n. başarısız denemeden sonra kaç gün bekleneceğini hesapla — gecikme günleri platform ayarlarından okunur */
  private async calcNextAttemptDate(baseDate: Date, attemptCount: number): Promise<Date> {
    const delays = await this.platformSettings.get<number[]>('dunning_delays', [3, 7, 14]);
    const days   = delays[attemptCount] ?? 999;
    const next   = new Date(baseDate);
    next.setDate(next.getDate() + days);
    return next;
  }
}

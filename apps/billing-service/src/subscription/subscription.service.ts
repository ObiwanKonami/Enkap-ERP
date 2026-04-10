import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BillingPlan } from './plan.entity';
import { Subscription } from './subscription.entity';
import { IyzicoClient, type IyzicoCardDetails } from '../payment/iyzico.client';
import { PaymentService } from '../payment/payment.service';
import { RateLimitSyncService } from './rate-limit-sync.service';
import { PlatformSettingsService } from '../platform-settings.service';

/**
 * Abonelik Yönetim Servisi.
 *
 * Yaşam döngüsü:
 *   Kayıt → trialing (DB'den okunan gün) → active (ödeme alındı) → past_due (ödeme başarısız)
 *   → cancelled/expired
 *
 * Plan geçişi:
 *   Upgrade: anında geçerli, prorated hesaplama (TODO)
 *   Downgrade: dönem sonunda geçerli
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(BillingPlan)
    private readonly planRepo: Repository<BillingPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly iyzicoClient: IyzicoClient,
    private readonly paymentService: PaymentService,
    private readonly dataSource: DataSource,
    private readonly rateLimitSync: RateLimitSyncService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /** Mevcut planları listeler */
  async getPlans(): Promise<BillingPlan[]> {
    return this.planRepo.find({
      where: { isActive: true },
      order: { priceKurus: 'ASC' },
    });
  }

  /** Tenant'ın mevcut aboneliğini döndürür */
  async findByTenant(tenantId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findOne({ where: { tenantId } });
  }

  /**
   * Yeni abonelik başlat.
   *
   * Akış:
   *  1. Plan var mı kontrol et
   *  2. Daha önce abonelik var mı? (conflict)
   *  3. Trial başlat (14 gün)
   *  4. Kart varsa iyzico'ya kaydet + ileriki ödeme için token al
   */
  async startSubscription(params: {
    tenantId: string;
    planId: string;
    email: string;
    companyName: string;
    card?: IyzicoCardDetails;
  }): Promise<Subscription> {
    const plan = await this.planRepo.findOne({
      where: { id: params.planId, isActive: true },
    });

    if (!plan) {
      throw new NotFoundException(`Plan bulunamadı: ${params.planId}`);
    }

    const existing = await this.findByTenant(params.tenantId);
    if (existing) {
      throw new ConflictException(
        `Bu tenant için zaten bir abonelik mevcut. Mevcut durum: ${existing.status}`,
      );
    }

    // Deneme süresi gün sayısını platform ayarlarından oku (varsayılan: 14)
    const trialDays = await this.platformSettings.get<number>('trial_days', 14);
    const now       = new Date();
    const trialEnd  = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    let iyzicoRef:      string | null = null;
    let iyzicoCustomer: string | null = null;
    let cardToken:      string | null = null;

    // Kart verilmişse iyzico'ya kaydet (trial bitmeden)
    if (params.card && plan.iyzicoplanRef) {
      const result = await this.iyzicoClient.createSubscription({
        tenantId:       params.tenantId,
        email:          params.email,
        companyName:    params.companyName,
        pricingPlanRef: plan.iyzicoplanRef,
        card:           params.card,
      });

      if (result.status !== 'success') {
        throw new BadRequestException(
          `Kart kaydı başarısız: ${result.errorMessage ?? 'iyzico hatası'}`,
        );
      }

      iyzicoRef      = result.referenceCode;
      iyzicoCustomer = result.customerReferenceCode;
      cardToken      = result.cardToken;
    }

    const subscription = this.subscriptionRepo.create({
      tenantId:             params.tenantId,
      planId:               params.planId,
      status:               'trialing',
      trialEndsAt:          trialEnd,
      currentPeriodStart:   now,
      currentPeriodEnd:     trialEnd,
      iyzicoSubscriptionRef: iyzicoRef,
      iyzicoCustomerRef:    iyzicoCustomer,
      iyzicoCardToken:      cardToken,
    });

    const saved = await this.subscriptionRepo.save(subscription);

    this.logger.log(
      `Abonelik başlatıldı: tenant=${params.tenantId}, plan=${params.planId}, ` +
      `trialDays=${trialDays}, trial=${trialEnd.toISOString()}`,
    );

    // Rate-limit tier'ını Redis'e yaz (Kong okur)
    this.rateLimitSync.syncTenant(params.tenantId, params.planId).catch((err: Error) =>
      this.logger.warn(`Rate-limit tier sync hatası: ${err.message}`),
    );

    return saved;
  }

  /**
   * Mevcut aboneliğe kart ekle veya güncelle.
   * Trial süresinde kart eklenmemişse onboarding wizard buraya yönlendirir.
   */
  async addCard(tenantId: string, card: IyzicoCardDetails): Promise<Subscription> {
    const subscription = await this.subscriptionRepo.findOne({ where: { tenantId } });
    if (!subscription) {
      throw new NotFoundException('Abonelik bulunamadı.');
    }

    const plan = await this.planRepo.findOne({ where: { id: subscription.planId, isActive: true } });

    if (!plan?.iyzicoplanRef) {
      throw new BadRequestException('Bu plan için iyzico entegrasyonu mevcut değil.');
    }

    // Daha önce kart var mı? — önce iptal edip yeniden kaydet
    if (subscription.iyzicoSubscriptionRef) {
      await this.iyzicoClient.cancelSubscription(subscription.iyzicoSubscriptionRef).catch(() => undefined);
    }

    // Kullanıcı ve şirket bilgisi için basit lookup (TODO: TenantProfile servisi)
    const result = await this.iyzicoClient.createSubscription({
      tenantId:       tenantId,
      email:          `billing+${tenantId.slice(0, 8)}@enkap.com`,
      companyName:    'Enkap Müşterisi',
      pricingPlanRef: plan.iyzicoplanRef,
      card,
    });

    if (result.status !== 'success') {
      throw new BadRequestException(`Kart kaydı başarısız: ${result.errorMessage ?? 'iyzico hatası'}`);
    }

    subscription.iyzicoSubscriptionRef = result.referenceCode;
    subscription.iyzicoCustomerRef     = result.customerReferenceCode;
    subscription.iyzicoCardToken       = result.cardToken;

    const saved = await this.subscriptionRepo.save(subscription);
    this.logger.log(`Kart eklendi: tenant=${tenantId}`);
    return saved;
  }

  /**
   * Plan güncelle (upgrade/downgrade).
   * Upgrade: anında geçerli.
   * Downgrade: şu an sadece plan_id güncellenir (prorated: TODO).
   */
  async changePlan(tenantId: string, newPlanId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Abonelik bulunamadı.');
    }

    const newPlan = await this.planRepo.findOne({
      where: { id: newPlanId, isActive: true },
    });

    if (!newPlan) {
      throw new NotFoundException(`Plan bulunamadı: ${newPlanId}`);
    }

    subscription.planId = newPlanId;
    const saved = await this.subscriptionRepo.save(subscription);

    this.logger.log(`Plan değişikliği: tenant=${tenantId}, yeni plan=${newPlanId}`);

    // Rate-limit tier'ını hemen güncelle (downgrade/upgrade anında geçerli)
    this.rateLimitSync.syncTenant(tenantId, newPlanId).catch((err: Error) =>
      this.logger.warn(`Rate-limit tier sync hatası: ${err.message}`),
    );

    return saved;
  }

  /**
   * Aboneliği iptal et.
   * Varsayılan: dönem sonunda iptal (cancel_at_period_end = true).
   * immediate=true → hemen iptal.
   */
  async cancel(tenantId: string, immediate = false): Promise<void> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Abonelik bulunamadı.');
    }

    if (immediate) {
      subscription.status = 'cancelled';

      if (subscription.iyzicoSubscriptionRef) {
        await this.iyzicoClient.cancelSubscription(
          subscription.iyzicoSubscriptionRef,
        );
      }
    } else {
      subscription.cancelAtPeriodEnd = true;
    }

    await this.subscriptionRepo.save(subscription);
    this.logger.log(
      `Abonelik iptal: tenant=${tenantId}, immediate=${immediate}`,
    );

    // Hemen iptal → Redis'ten tier kaldır (fallback: starter)
    if (immediate) {
      this.rateLimitSync.removeTenant(tenantId).catch((err: Error) =>
        this.logger.warn(`Rate-limit tier kaldırma hatası: ${err.message}`),
      );
    }
  }

  /**
   * Trial bitişlerini kontrol et ve ödeme al.
   * Günlük cron ile çağrılır.
   */
  async processPeriodRenewals(): Promise<void> {
    const now = new Date();

    // Trial bitmiş, henüz active olmamış abonelikler
    const expiredTrials = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'trialing' })
      .andWhere('s.trial_ends_at <= :now', { now })
      .getMany();

    for (const sub of expiredTrials) {
      await this.chargeForRenewal(sub);
    }

    // active ve dönem sona ermişler
    const expiredPeriods = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.current_period_end <= :now', { now })
      .andWhere('s.cancel_at_period_end = false')
      .getMany();

    for (const sub of expiredPeriods) {
      await this.chargeForRenewal(sub);
    }

    // Dönem sonu iptal
    const toCancel = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.cancel_at_period_end = true')
      .andWhere('s.current_period_end <= :now', { now })
      .getMany();

    for (const sub of toCancel) {
      sub.status = 'cancelled';
      await this.subscriptionRepo.save(sub);
      this.logger.log(`Dönem sonu iptal: tenant=${sub.tenantId}`);
    }
  }

  private async chargeForRenewal(subscription: Subscription): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id: subscription.planId } });
    if (!plan || plan.priceKurus === 0) {
      // Enterprise veya ücretsiz — sadece dönem ilerlet
      this.advancePeriod(subscription);
      await this.subscriptionRepo.save(subscription);
      return;
    }

    const result = await this.paymentService.charge({
      subscription,
      amountKurus: plan.priceKurus,
    });

    if (result.success) {
      subscription.status = 'active';
      this.advancePeriod(subscription);
    } else {
      subscription.status = 'past_due';
    }

    await this.subscriptionRepo.save(subscription);
  }

  private advancePeriod(subscription: Subscription): void {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd   = periodEnd;
  }
}

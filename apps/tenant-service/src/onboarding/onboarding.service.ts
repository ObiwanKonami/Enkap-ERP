import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { HttpService }   from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { MailerService } from '@enkap/mailer';
import { slugify }                  from '../provisioning/slug.util';
import { ProvisioningOrchestrator } from '../provisioning/provisioning-orchestrator';
import { TenantProfileService }     from '../profile/tenant-profile.service';
import type { TenantProfile }       from '../profile/tenant-profile.entity';
import type { IyzicoCardDetails }   from './onboarding.types';
import { BillingEventsPublisher }   from '../events/billing-events.publisher';

export interface RegisterRequest {
  /** İstenen firma slug (otomatik üretilir, müşteri de verebilir) */
  companyName:   string;
  adminEmail:    string;
  adminPassword: string;   // Auth-service'e iletilir (hash işlemi orada)
  planId:        string;   // 'starter' | 'business' | 'enterprise'

  // Şirket profili
  vkn?:          string;
  tckn?:         string;
  taxOffice?:    string;
  phone?:        string;
  address?:      string;
  city?:         string;
  district?:     string;
  iban?:         string;

  // Opsiyonel kart (trial süresinde eklenmezse ileriki adımda)
  card?: IyzicoCardDetails;
}

export interface RegisterResult {
  tenantId:      string;
  tenantSlug:    string;
  planId:        string;
  trialEndsAt:   string;
  onboardingStep: string;
  message:       string;
}

export interface AddCardRequest {
  tenantId: string;
  card:     IyzicoCardDetails;
}

/**
 * Onboarding Orkestratörü.
 *
 * Adım sırası:
 *  1. Şirket profili oluştur (companyName, VKN, adres…)
 *  2. Tenant provision et (şema, migrasyonlar, seed)
 *  3. Billing-service'e abonelik başlat (trial 14 gün)
 *  4. (Opsiyonel) Kart ekle → iyzico'ya kaydet
 *
 * Billing-service ile iletişim:
 *  Aynı control_plane DB'si üzerinde doğrudan kayıt oluşturmak yerine
 *  billing-service REST API'si çağrılır — servis sınırları korunur.
 *  TODO: RabbitMQ ile async iletişime geçiş (Faz 4)
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly orchestrator:      ProvisioningOrchestrator,
    private readonly profileService:    TenantProfileService,
    private readonly httpService:       HttpService,
    private readonly config:            ConfigService,
    private readonly mailer:            MailerService,
    private readonly billingEvents:     BillingEventsPublisher,
  ) {}

  /**
   * Yeni müşteri kaydı.
   * Hata olursa provizyon zaten saga rollback yapar; profil oluşturulmamışsa silinecek yok.
   */
  async register(req: RegisterRequest): Promise<RegisterResult> {
    // 1 — Tenant slug: companyName'den otomatik üret
    const baseSlug = slugify(req.companyName);
    const tenantId = this.generateUUID();

    this.logger.log(
      `Onboarding başladı: ${req.companyName} (${baseSlug}) plan=${req.planId}`,
    );

    // 2 — Tenant provision (şema + migrasyonlar + seed ~30-90s)
    // tenant_profiles.tenant_id → tenant_routing.id FK olduğundan önce provision edilmeli
    // Slug çakışması durumunda orchestrator benzersiz slug üretir (-2, -3, ...)
    const provisionResult = await this.orchestrator.provision({
      tenantId,
      tenantSlug: baseSlug,
      tier:          this.planToTier(req.planId),
      companyName:   req.companyName,
      adminEmail:    req.adminEmail,
      adminPassword: req.adminPassword,
    });
    const tenantSlug = provisionResult.tenantSlug;

    // 3 — Şirket profilini oluştur (FK kısıtı sağlanmış olur)
    await this.profileService.create({
      tenantId:    tenantId,
      companyName: req.companyName,
      vkn:         req.vkn,
      tckn:        req.tckn,
      taxOffice:   req.taxOffice,
      phone:       req.phone,
      email:       req.adminEmail,
      address:     req.address,
      city:        req.city,
      district:    req.district,
      iban:        req.iban,
      invoicePrefix: this.buildInvoicePrefix(req.companyName),
    });

    // 4 — Billing aboneliği başlat
    //
    // Tercih: RabbitMQ event (async, fire-and-forget).
    // Fallback: HTTP (RabbitMQ yoksa — geliştirme ortamı veya geçici kesinti).
    //
    // trialEndsAt: RabbitMQ kullanıldığında bilinemiyor (async) — 14 günlük varsayılan kullanılır.
    const TRIAL_DAYS  = 14;
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const eventPublished = this.billingEvents.publishSubscriptionCreated({
      tenantId,
      planId:      req.planId,
      email:       req.adminEmail,
      companyName: req.companyName,
      card:        req.card,
    });

    if (!eventPublished) {
      // RabbitMQ hazır değil — HTTP fallback
      const billingUrl = this.config.get<string>('BILLING_SERVICE_URL', 'http://billing-service:3008');
      try {
        await firstValueFrom(
          this.httpService.post<{ trialEndsAt: string }>(
            `${billingUrl}/api/v1/subscriptions`,
            {
              tenantId,
              planId:      req.planId,
              email:       req.adminEmail,
              companyName: req.companyName,
              card:        req.card,
            },
          ),
        );
        this.logger.log(`Billing aboneliği HTTP ile oluşturuldu: tenant=${tenantId}`);
      } catch (err) {
        // Billing hatası onboarding'i durdurmamalı — tenant çalışır, sonra düzeltilebilir
        this.logger.warn(
          `Billing abonelik başlatma başarısız (tenant aktif): tenant=${tenantId}`,
          err,
        );
      }
    }

    // 5 — Onboarding tamamlandı (Seçenek A: kart trial sonrası /ayarlar/abonelik'ten girilir)
    await this.profileService.advanceOnboardingStep(tenantId, 'completed');
    const nextStep = 'completed';

    // 6 — Hoş geldiniz e-postası gönder (hata onboarding'i durdurmasın)
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://app.enkap.com.tr');
    this.mailer.sendWelcome(req.adminEmail, {
      adminName:   req.adminEmail.split('@')[0] ?? req.adminEmail,
      companyName: req.companyName,
      tenantSlug,
      loginUrl:    frontendUrl,
    }).catch((err: Error) => {
      this.logger.warn(`Hoş geldiniz e-postası gönderilemedi: ${err.message}`);
    });

    this.logger.log(
      `Onboarding tamamlandı: tenant=${tenantId}, adım=${nextStep}`,
    );

    return {
      tenantId,
      tenantSlug,
      planId:        req.planId,
      trialEndsAt,
      onboardingStep: nextStep,
      message:       'Kayıt tamamlandı. Sisteme giriş yapabilirsiniz.',
    };
  }

  /**
   * Kart ekleme adımı (onboarding wizard 2. ekran veya ayarlar).
   * Billing-service'te var olan aboneliğe kart bağlar.
   */
  async addCard(req: AddCardRequest): Promise<{ message: string }> {
    const billingUrl = this.config.get<string>('BILLING_SERVICE_URL', 'http://billing-service:3008');

    await firstValueFrom(
      this.httpService.patch(
        `${billingUrl}/api/v1/subscriptions/${req.tenantId}/card`,
        { card: req.card },
      ),
    );

    await this.profileService.advanceOnboardingStep(req.tenantId, 'completed');

    return { message: 'Kart başarıyla eklendi. Aboneliğiniz aktive edildi.' };
  }

  /** Onboarding durumunu getir */
  async getStatus(tenantId: string): Promise<TenantProfile> {
    return this.profileService.findByTenant(tenantId);
  }

  // ── Yardımcılar ──────────────────────────────────────────────────────────

  /** Şirket adından 3 harflik fatura prefix üret (ENK, ACM, TRD…) */
  private buildInvoicePrefix(companyName: string): string {
    return companyName
      .replace(/[^A-Za-zÇĞİÖŞÜçğışöşü]/g, '')
      .toUpperCase()
      .slice(0, 3)
      .padEnd(3, 'X');
  }

  private planToTier(planId: string): 'starter' | 'business' | 'enterprise' {
    if (planId === 'enterprise') return 'enterprise';
    if (planId === 'business')   return 'business';
    return 'starter';
  }

  private generateUUID(): string {
    const { randomUUID } = require('crypto') as typeof import('crypto');
    return randomUUID();
  }
}

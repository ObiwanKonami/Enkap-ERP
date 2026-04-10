import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { IyzicoClient } from './iyzico.client';
import { InvoicePdfService } from './invoice-pdf.service';
import { PaymentAttempt } from './payment-attempt.entity';
import { BillingInvoice } from './billing-invoice.entity';
import { Subscription } from '../subscription/subscription.entity';
import { BillingPlan } from '../subscription/plan.entity';
import { MailerService } from '@enkap/mailer';
import { randomUUID } from 'crypto';
import { PlatformSettingsService } from '../platform-settings.service';

const MONTH_TR = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export interface ChargeParams {
  subscription: Subscription;
  amountKurus: number;
  plan?: BillingPlan;
}

export interface ChargeResult {
  success: boolean;
  paymentId?: string;
  errorMessage?: string;
  attemptId: string;
}

/**
 * Ödeme tahsilat servisi.
 *
 * Sorumluluklar:
 *  1. iyzico üzerinden kart tahsilatı
 *  2. PaymentAttempt kaydı (denetim izi)
 *  3. BillingInvoice oluşturma (başarılı ödemede)
 *  4. Başarısız ödemelerde dunning schedule hesaplama (gecikme günleri DB'den okunur)
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attemptRepo: Repository<PaymentAttempt>,
    @InjectRepository(BillingInvoice)
    private readonly invoiceRepo: Repository<BillingInvoice>,
    @InjectDataSource()
    private readonly dataSource:  DataSource,
    private readonly iyzicoClient:      IyzicoClient,
    private readonly invoicePdf:        InvoicePdfService,
    private readonly mailer:            MailerService,
    private readonly platformSettings:  PlatformSettingsService,
  ) {}

  /**
   * Abonelik için ödeme tahsilatı yap.
   * Kart tokenı yoksa (ücretsiz/enterprise) başarılı döner.
   */
  async charge(params: ChargeParams): Promise<ChargeResult> {
    const { subscription, amountKurus } = params;

    // Kart tokenı yoksa ücretsiz plan — tahsilat gerekmez
    if (!subscription.iyzicoCardToken || !subscription.iyzicoCustomerRef) {
      this.logger.log(
        `Ücretsiz plan tahsilatı atlandı: tenant=${subscription.tenantId}`,
      );
      return { success: true, attemptId: 'free-plan' };
    }

    // Mevcut deneme sayısını hesapla
    const prevAttempts = await this.attemptRepo.count({
      where: { subscriptionId: subscription.id },
    });
    const attemptNumber = prevAttempts + 1;

    // Fatura numarası: INV-{tenantId kısa}-{dönem}-{deneme}
    const periodTag = this.buildPeriodTag(subscription.currentPeriodEnd ?? new Date());
    const invoiceNumber = `INV-${subscription.tenantId.slice(0, 8)}-${periodTag}-${attemptNumber}`;

    let iyzicoPaymentId: string | null = null;
    let success = false;
    let errorMessage: string | undefined;

    try {
      const result = await this.iyzicoClient.chargeCard({
        subscriptionRef: subscription.iyzicoSubscriptionRef ?? '',
        customerRef:     subscription.iyzicoCustomerRef,
        cardToken:       subscription.iyzicoCardToken,
        amountKurus,
        tenantId:        subscription.tenantId,
        invoiceNumber,
      });

      success          = result.status === 'success';
      iyzicoPaymentId  = result.paymentId ?? null;
      errorMessage     = result.errorMessage;

      if (success) {
        this.logger.log(
          `Ödeme başarılı: tenant=${subscription.tenantId}, ` +
          `tutar=${amountKurus}₺, paymentId=${iyzicoPaymentId}`,
        );
      } else {
        this.logger.warn(
          `Ödeme başarısız: tenant=${subscription.tenantId}, ` +
          `hata=${result.errorMessage ?? result.errorCode}`,
        );
      }
    } catch (err) {
      success      = false;
      errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
      this.logger.error(
        `Ödeme isteği exception: tenant=${subscription.tenantId}`,
        err,
      );
    }

    // Deneme kaydı oluştur — başarısız ise bir sonraki deneme tarihini hesapla
    const nextAttemptAt = success
      ? null
      : await this.calcNextAttemptAt(attemptNumber);

    const attempt = this.attemptRepo.create({
      subscriptionId: subscription.id,
      tenantId:       subscription.tenantId,
      amountKurus,
      currency:       'TRY',
      status:         success ? 'success' : 'failed',
      iyzicoPaymentId,
      failureReason:  errorMessage ?? null,
      attemptNumber,
      nextAttemptAt,
    });

    const savedAttempt = await this.attemptRepo.save(attempt);

    // Başarılı ödemede fatura oluştur ve e-posta gönder
    if (success && iyzicoPaymentId) {
      await this.createInvoice({
        subscription,
        plan: params.plan ?? null,
        amountKurus,
        invoiceNumber,
        paymentId: savedAttempt.id,
      });
    }

    return {
      success,
      paymentId:    iyzicoPaymentId ?? undefined,
      errorMessage,
      attemptId:    savedAttempt.id,
    };
  }

  /**
   * Dunning: past_due abonelikler için yeniden deneme.
   * DunningService tarafından çağrılır.
   */
  async retryCharge(params: ChargeParams): Promise<ChargeResult> {
    return this.charge(params);
  }

  /** Bir sonraki deneme zamanını hesapla — gecikme günleri platform ayarlarından okunur */
  private async calcNextAttemptAt(attemptNumber: number): Promise<Date | null> {
    const delays    = await this.platformSettings.get<number[]>('dunning_delays', [3, 7, 14]);
    const delayDays = delays[attemptNumber - 1];
    if (!delayDays) return null; // Max deneme sayısına ulaşıldı

    const next = new Date();
    next.setDate(next.getDate() + delayDays);
    return next;
  }

  /** Dönem etiketini yyyy-MM formatında üret */
  private buildPeriodTag(periodEnd: Date): string {
    const y = periodEnd.getFullYear();
    const m = String(periodEnd.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /** Başarılı ödeme sonrası fatura oluştur, PDF üret ve e-posta gönder */
  private async createInvoice(params: {
    subscription: Subscription;
    plan:         BillingPlan | null;
    amountKurus:  number;
    invoiceNumber: string;
    paymentId:    string;
  }): Promise<void> {
    const { subscription, plan, amountKurus, invoiceNumber, paymentId } = params;

    // KDV %20 dahil — KDV = tutar * 20 / 120
    const kdvKurus = Math.round((amountKurus * 20) / 120);
    const netKurus = amountKurus - kdvKurus;

    const invoice = this.invoiceRepo.create({
      subscriptionId: subscription.id,
      tenantId:       subscription.tenantId,
      invoiceNumber,
      periodStart:    subscription.currentPeriodStart ?? new Date(),
      periodEnd:      subscription.currentPeriodEnd   ?? new Date(),
      amountKurus:    netKurus,
      kdvKurus,
      totalKurus:     amountKurus,
      status:         'paid',
      paymentId,
      pdfPath:        null,
    });

    const saved = await this.invoiceRepo.save(invoice);

    this.logger.log(
      `Fatura oluşturuldu: ${invoiceNumber}, ` +
      `toplam=${amountKurus} kuruş, tenant=${subscription.tenantId}`,
    );

    // Tenant profil bilgisi (şirket adı ve e-posta)
    const profileRows = await this.dataSource.query<{ company_name: string; email: string | null }[]>(
      `SELECT company_name, email FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
      [subscription.tenantId],
    );
    const profile     = profileRows[0];
    const companyName = profile?.company_name ?? subscription.tenantId;
    const tenantEmail = profile?.email;

    // PDF oluştur ve e-posta gönder (fire-and-forget — fatura zaten kaydedildi)
    if (plan && tenantEmail) {
      this.sendInvoiceEmail(saved, plan, companyName, tenantEmail)
        .catch((err: Error) =>
          this.logger.warn(
            `Abonelik fatura e-postası gönderilemedi: ${invoiceNumber} — ${err.message}`,
          ),
        );
    }
  }

  /** Abonelik faturasını PDF olarak oluşturur ve e-posta gönderir */
  private async sendInvoiceEmail(
    invoice:     BillingInvoice,
    plan:        BillingPlan,
    companyName: string,
    email:       string,
  ): Promise<void> {
    const pdfBuffer = await this.invoicePdf.build(invoice, plan, companyName);

    const period  = `${invoice.periodStart.getFullYear()}-${String(invoice.periodStart.getMonth() + 1).padStart(2, '0')}`;
    const fmt     = (k: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(k / 100);

    await this.mailer.sendSubscriptionInvoice(email, {
      companyName,
      invoiceNo:   invoice.invoiceNumber,
      planName:    plan.name,
      period,
      netAmount:   fmt(invoice.amountKurus),
      kdvAmount:   fmt(invoice.kdvKurus),
      totalAmount: fmt(invoice.totalKurus),
    }, pdfBuffer);

    this.logger.log(`Abonelik faturası e-postası gönderildi: ${invoice.invoiceNumber} → ${email}`);
  }
}

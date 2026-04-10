import { Injectable, Logger } from '@nestjs/common';
import { Cron }               from '@nestjs/schedule';
import { InjectRepository }   from '@nestjs/typeorm';
import { InjectDataSource }   from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import {
  getTenantContext,
  TenantDataSourceManager,
  TenantRoutingService,
  runWithTenantContext,
} from '@enkap/database';
import { MailerService } from '@enkap/mailer';
import type { PaymentReminderData, ReminderLevel } from '@enkap/mailer';
import { PaymentInstallment } from './entities/payment-installment.entity';

/**
 * Varsayılan hatırlatma günleri:
 *  -3 → vadeden 3 gün önce (upcoming)
 *   1 → 1 gün gecikmede
 *   7 → 7 gün gecikmede
 *  30 → 30 gün gecikmede (son uyarı)
 *
 * Tenant'ın tenant_profiles.ar_reminder_days değeri varsa o kullanılır.
 */
const DEFAULT_REMINDER_DAYS = [-3, 1, 7, 30];

/**
 * Offset günü → ReminderLevel dönüştürücü.
 * Negatif offset = upcoming (vade öncesi), pozitif = overdue_N.
 */
function buildReminderLevel(offsetDays: number): ReminderLevel {
  if (offsetDays < 0) return 'upcoming';
  return `overdue_${offsetDays}` as ReminderLevel;
}

/**
 * Ödeme hatırlatma servisi.
 *
 * Her gün 08:00 İstanbul'da çalışır.
 * Her taksit için ilgili seviye daha önce gönderilmediyse
 * e-posta gönderilir. Push bildirimi auth-service üzerinden
 * ayrı bir integration (Faz 5B) olarak eklenecektir.
 *
 * İdempotency: payment_reminder_logs UNIQUE(installment_id, level) kısıtlaması
 * — aynı taksit için aynı seviye iki kez gönderilmez.
 */
@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @InjectRepository(PaymentInstallment)
    private readonly installmentRepo: Repository<PaymentInstallment>,
    private readonly dsManager:       TenantDataSourceManager,
    private readonly routingService:  TenantRoutingService,
    private readonly mailer:          MailerService,
    @InjectDataSource('control_plane')
    private readonly controlPlaneDs:  DataSource,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'Europe/Istanbul' })
  async processReminders(): Promise<void> {
    this.logger.log('Ödeme hatırlatmaları başladı');

    const tenants = await this.routingService.findAllActiveIds();

    const results = await Promise.allSettled(
      tenants.map((tenantId) =>
        runWithTenantContext(
          { tenantId, userId: 'system', sessionId: 'cron', userRoles: [], tier: 'starter' },
          () => this.processForTenant(),
        ),
      ),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(
      `Hatırlatma tamamlandı: ${tenants.length} tenant, ${failed} hata`,
    );
  }

  /**
   * Tenant'ın ar_reminder_days ayarını control plane'den çeker.
   * Bulunamazsa varsayılan [-3, 1, 7, 30] kullanılır.
   */
  private async getTenantReminderDays(tenantId: string): Promise<number[]> {
    try {
      const rows = await this.controlPlaneDs.query<{ ar_reminder_days: number[] }[]>(
        `SELECT ar_reminder_days FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );
      if (rows.length && Array.isArray(rows[0]!.ar_reminder_days) && rows[0]!.ar_reminder_days.length > 0) {
        return rows[0]!.ar_reminder_days;
      }
    } catch (err) {
      this.logger.warn(`ar_reminder_days çekilemedi tenant=${tenantId}, varsayılan kullanılıyor: ${String(err)}`);
    }
    return DEFAULT_REMINDER_DAYS;
  }

  private async processForTenant(): Promise<void> {
    const { tenantId } = getTenantContext();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Şirket adını ve hatırlatma günlerini paralel çek
    const [companyName, reminderDays] = await Promise.all([
      this.routingService.getCompanyName(tenantId),
      this.getTenantReminderDays(tenantId),
    ]);

    // Tenant'a özgü hatırlatma zamanlamasını oluştur
    const reminderSchedule = reminderDays.map((offsetDays) => ({
      level: buildReminderLevel(offsetDays),
      offsetDays,
    }));

    for (const entry of reminderSchedule) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - entry.offsetDays);
      const dateStr = targetDate.toISOString().slice(0, 10);

      // O gün vadesi olan ödenmemiş taksitler
      const installments = await this.installmentRepo.find({
        where: { tenantId, dueDate: dateStr, paidAt: IsNull() },
      });

      for (const installment of installments) {
        await this.sendIfNotSent(installment, entry.level, tenantId, companyName);
      }
    }
  }

  private async sendIfNotSent(
    installment: PaymentInstallment,
    level:       ReminderLevel,
    tenantId:    string,
    companyName: string,
  ): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);

    // İdempotency kontrolü + kayıt (tek sorgu ile ON CONFLICT SKIP)
    const result = await ds.query<{ inserted: boolean }[]>(
      `INSERT INTO payment_reminder_logs (tenant_id, installment_id, level, channel)
       VALUES ($1, $2, $3, 'email')
       ON CONFLICT (tenant_id, installment_id, level) DO NOTHING
       RETURNING true AS inserted`,
      [tenantId, installment.id, level],
    );

    // Daha önce gönderilmişse atla
    if (!result.length) return;

    // Fatura ve alacaklı bilgisini çek
    const invoiceRow = await ds.query<{
      invoice_no: string;
      customer_email: string;
      customer_name:  string;
      installment_no: number;
      total_parts:    number;
    }[]>(
      `SELECT
         i.invoice_no,
         COALESCE(c.email, '') AS customer_email,
         COALESCE(c.name,  '') AS customer_name,
         pi.installment_number AS installment_no,
         pp.installment_count  AS total_parts
       FROM payment_installments pi
       JOIN payment_plans pp ON pp.id = pi.plan_id
       JOIN invoices i        ON i.id  = pp.invoice_id
       LEFT JOIN crm_contacts c ON c.id = COALESCE(i.counterparty_id, i.customer_id)
       WHERE pi.id = $1`,
      [installment.id],
    );

    if (!invoiceRow.length || !invoiceRow[0]!.customer_email) {
      this.logger.warn(
        `Hatırlatma atlandı: taksit=${installment.id} — müşteri e-postası yok`,
      );
      return;
    }

    const info = invoiceRow[0]!;

    // Kuruş → TL formatı
    const amountTl = new Intl.NumberFormat('tr-TR', {
      style: 'currency', currency: 'TRY',
    }).format(Number(installment.amount));

    // "yyyy-MM-dd" → "dd.MM.yyyy"
    const [y, m, d] = (installment.dueDate as string).split('-');
    const formattedDue = `${d}.${m}.${y}`;

    const data: PaymentReminderData = {
      recipientName: info.customer_name,
      invoiceNo:     info.invoice_no,
      installmentNo: info.installment_no,
      totalParts:    info.total_parts,
      dueDate:       formattedDue,
      amount:        amountTl,
      level,
      companyName,
    };

    await this.mailer.sendPaymentReminder(info.customer_email, data);

    this.logger.log(
      `Hatırlatma gönderildi: taksit=${installment.id}, ` +
      `level=${level}, vade=${installment.dueDate}, tenant=${tenantId}`,
    );
  }
}

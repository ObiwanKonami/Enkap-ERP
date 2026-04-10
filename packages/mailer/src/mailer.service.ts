import { Injectable, Logger } from '@nestjs/common';
import { ConfigService }     from '@nestjs/config';
import { createTransport, Transporter, SendMailOptions } from 'nodemailer';

import {
  emailVerificationTemplate, EmailVerificationData,
  passwordResetTemplate, PasswordResetData,
  invoiceMailTemplate,   InvoiceMailData,
  paymentReminderTemplate, PaymentReminderData,
  welcomeMailTemplate,   WelcomeMailData,
  subscriptionInvoiceTemplate, SubscriptionInvoiceData,
  payslipTemplate, PayslipMailData,
  reconciliationStatementTemplate, ReconciliationStatementData,
} from './mail-templates';

/**
 * Nodemailer tabanlı e-posta gönderim servisi.
 *
 * Konfigürasyon ortam değişkenleri:
 *  SMTP_HOST    → SMTP sunucu adresi
 *  SMTP_PORT    → SMTP portu (varsayılan: 587)
 *  SMTP_SECURE  → TLS için "true" (port 465), yoksa STARTTLS
 *  SMTP_USER    → Gönderen hesap kullanıcı adı
 *  SMTP_PASS    → Gönderen hesap şifresi / app password
 *  SMTP_FROM    → "Gönderen Ad <adres>" formatında varsayılan gönderen
 *
 * SMTP_HOST yoksa e-posta gönderimi atlanır (geliştirme ortamı).
 */
@Injectable()
export class MailerService {
  private readonly logger      = new Logger(MailerService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');

    if (!host) {
      this.logger.warn('SMTP_HOST tanımlı değil — e-posta gönderimi devre dışı');
      this.transporter = null;
    } else {
      this.transporter = createTransport({
        host,
        port:   config.get<number>('SMTP_PORT', 587),
        secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: {
          user: config.get<string>('SMTP_USER'),
          pass: config.get<string>('SMTP_PASS'),
        },
      });
    }

    this.fromAddress = config.get<string>(
      'SMTP_FROM',
      'Enkap ERP <noreply@enkap.com.tr>',
    );
  }

  // ─── Temel gönderim ──────────────────────────────────────────────────────────

  async send(options: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.debug(`[DEV] E-posta atlandı: to=${options.to}, subject=${options.subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({ from: this.fromAddress, ...options });
      this.logger.log(`E-posta gönderildi: to=${options.to}`);
    } catch (err) {
      this.logger.error(
        `E-posta gönderilemedi: to=${options.to}, hata=${(err as Error).message}`,
      );
      throw err;
    }
  }

  // ─── E-posta doğrulama ───────────────────────────────────────────────────────

  async sendEmailVerification(to: string, data: EmailVerificationData): Promise<void> {
    const { subject, html, text } = emailVerificationTemplate(data);
    await this.send({ to, subject, html, text });
  }

  // ─── Şifre sıfırlama ─────────────────────────────────────────────────────────

  async sendPasswordReset(to: string, data: PasswordResetData): Promise<void> {
    const { subject, html, text } = passwordResetTemplate(data);
    await this.send({ to, subject, html, text });
  }

  // ─── Fatura teslimi ──────────────────────────────────────────────────────────

  async sendInvoice(
    to:        string,
    data:      InvoiceMailData,
    /** Opsiyonel: PDF dosyası buffer olarak eklenir */
    pdfBuffer?: Buffer,
  ): Promise<void> {
    const { subject, html, text } = invoiceMailTemplate(data);
    const attachments = pdfBuffer
      ? [{ filename: `Fatura-${data.invoiceNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
      : [];

    await this.send({ to, subject, html, text, attachments });
  }

  // ─── Ödeme hatırlatması ───────────────────────────────────────────────────────

  async sendPaymentReminder(to: string, data: PaymentReminderData): Promise<void> {
    const { subject, html, text } = paymentReminderTemplate(data);
    await this.send({ to, subject, html, text });
  }

  // ─── Hoş geldiniz ────────────────────────────────────────────────────────────

  async sendWelcome(to: string, data: WelcomeMailData): Promise<void> {
    const { subject, html, text } = welcomeMailTemplate(data);
    await this.send({ to, subject, html, text });
  }

  // ─── Bordro pusulası ─────────────────────────────────────────────────────────

  async sendPayslip(
    to:        string,
    data:      PayslipMailData,
    pdfBuffer: Buffer,
  ): Promise<void> {
    const { subject, html, text } = payslipTemplate(data);
    await this.send({
      to,
      subject,
      html,
      text,
      attachments: [{
        filename: `Bordro-${data.period.replace(' ', '-')}.pdf`,
        content:  pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
  }

  // ─── Cari Hesap Mutabakat Belgesi ────────────────────────────────────────────

  async sendReconciliationStatement(
    to:        string,
    data:      ReconciliationStatementData,
    pdfBuffer: Buffer,
  ): Promise<void> {
    const { subject, html, text } = reconciliationStatementTemplate(data);
    const filename = `Mutabakat-${data.contactName.replace(/\s+/g, '-')}-${data.statementDate.replace(/\./g, '')}.pdf`;

    await this.send({
      to,
      subject,
      html,
      text,
      attachments: [{
        filename,
        content:     pdfBuffer,
        contentType: 'application/pdf',
      }],
    });
  }

  // ─── Abonelik faturası ────────────────────────────────────────────────────────

  async sendSubscriptionInvoice(
    to:        string,
    data:      SubscriptionInvoiceData,
    pdfBuffer?: Buffer,
  ): Promise<void> {
    const { subject, html, text } = subscriptionInvoiceTemplate(data);
    const attachments = pdfBuffer
      ? [{ filename: `Abonelik-${data.invoiceNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
      : [];

    await this.send({ to, subject, html, text, attachments });
  }
}

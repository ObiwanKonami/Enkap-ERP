import { ConfigService } from '@nestjs/config';
import { SendMailOptions } from 'nodemailer';
import { EmailVerificationData, PasswordResetData, InvoiceMailData, PaymentReminderData, WelcomeMailData, SubscriptionInvoiceData, PayslipMailData, ReconciliationStatementData } from './mail-templates';
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
export declare class MailerService {
    private readonly config;
    private readonly logger;
    private readonly transporter;
    private readonly fromAddress;
    constructor(config: ConfigService);
    send(options: SendMailOptions): Promise<void>;
    sendEmailVerification(to: string, data: EmailVerificationData): Promise<void>;
    sendPasswordReset(to: string, data: PasswordResetData): Promise<void>;
    sendInvoice(to: string, data: InvoiceMailData, 
    /** Opsiyonel: PDF dosyası buffer olarak eklenir */
    pdfBuffer?: Buffer): Promise<void>;
    sendPaymentReminder(to: string, data: PaymentReminderData): Promise<void>;
    sendWelcome(to: string, data: WelcomeMailData): Promise<void>;
    sendPayslip(to: string, data: PayslipMailData, pdfBuffer: Buffer): Promise<void>;
    sendReconciliationStatement(to: string, data: ReconciliationStatementData, pdfBuffer: Buffer): Promise<void>;
    sendSubscriptionInvoice(to: string, data: SubscriptionInvoiceData, pdfBuffer?: Buffer): Promise<void>;
}

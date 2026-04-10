"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MailerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nodemailer_1 = require("nodemailer");
const mail_templates_1 = require("./mail-templates");
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
let MailerService = MailerService_1 = class MailerService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(MailerService_1.name);
        const host = config.get('SMTP_HOST');
        if (!host) {
            this.logger.warn('SMTP_HOST tanımlı değil — e-posta gönderimi devre dışı');
            this.transporter = null;
        }
        else {
            this.transporter = (0, nodemailer_1.createTransport)({
                host,
                port: config.get('SMTP_PORT', 587),
                secure: config.get('SMTP_SECURE', 'false') === 'true',
                auth: {
                    user: config.get('SMTP_USER'),
                    pass: config.get('SMTP_PASS'),
                },
            });
        }
        this.fromAddress = config.get('SMTP_FROM', 'Enkap ERP <noreply@enkap.com.tr>');
    }
    // ─── Temel gönderim ──────────────────────────────────────────────────────────
    async send(options) {
        if (!this.transporter) {
            this.logger.debug(`[DEV] E-posta atlandı: to=${options.to}, subject=${options.subject}`);
            return;
        }
        try {
            await this.transporter.sendMail({ from: this.fromAddress, ...options });
            this.logger.log(`E-posta gönderildi: to=${options.to}`);
        }
        catch (err) {
            this.logger.error(`E-posta gönderilemedi: to=${options.to}, hata=${err.message}`);
            throw err;
        }
    }
    // ─── E-posta doğrulama ───────────────────────────────────────────────────────
    async sendEmailVerification(to, data) {
        const { subject, html, text } = (0, mail_templates_1.emailVerificationTemplate)(data);
        await this.send({ to, subject, html, text });
    }
    // ─── Şifre sıfırlama ─────────────────────────────────────────────────────────
    async sendPasswordReset(to, data) {
        const { subject, html, text } = (0, mail_templates_1.passwordResetTemplate)(data);
        await this.send({ to, subject, html, text });
    }
    // ─── Fatura teslimi ──────────────────────────────────────────────────────────
    async sendInvoice(to, data, 
    /** Opsiyonel: PDF dosyası buffer olarak eklenir */
    pdfBuffer) {
        const { subject, html, text } = (0, mail_templates_1.invoiceMailTemplate)(data);
        const attachments = pdfBuffer
            ? [{ filename: `Fatura-${data.invoiceNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
            : [];
        await this.send({ to, subject, html, text, attachments });
    }
    // ─── Ödeme hatırlatması ───────────────────────────────────────────────────────
    async sendPaymentReminder(to, data) {
        const { subject, html, text } = (0, mail_templates_1.paymentReminderTemplate)(data);
        await this.send({ to, subject, html, text });
    }
    // ─── Hoş geldiniz ────────────────────────────────────────────────────────────
    async sendWelcome(to, data) {
        const { subject, html, text } = (0, mail_templates_1.welcomeMailTemplate)(data);
        await this.send({ to, subject, html, text });
    }
    // ─── Bordro pusulası ─────────────────────────────────────────────────────────
    async sendPayslip(to, data, pdfBuffer) {
        const { subject, html, text } = (0, mail_templates_1.payslipTemplate)(data);
        await this.send({
            to,
            subject,
            html,
            text,
            attachments: [{
                    filename: `Bordro-${data.period.replace(' ', '-')}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }],
        });
    }
    // ─── Cari Hesap Mutabakat Belgesi ────────────────────────────────────────────
    async sendReconciliationStatement(to, data, pdfBuffer) {
        const { subject, html, text } = (0, mail_templates_1.reconciliationStatementTemplate)(data);
        const filename = `Mutabakat-${data.contactName.replace(/\s+/g, '-')}-${data.statementDate.replace(/\./g, '')}.pdf`;
        await this.send({
            to,
            subject,
            html,
            text,
            attachments: [{
                    filename,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }],
        });
    }
    // ─── Abonelik faturası ────────────────────────────────────────────────────────
    async sendSubscriptionInvoice(to, data, pdfBuffer) {
        const { subject, html, text } = (0, mail_templates_1.subscriptionInvoiceTemplate)(data);
        const attachments = pdfBuffer
            ? [{ filename: `Abonelik-${data.invoiceNo}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
            : [];
        await this.send({ to, subject, html, text, attachments });
    }
};
exports.MailerService = MailerService;
exports.MailerService = MailerService = MailerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MailerService);
//# sourceMappingURL=mailer.service.js.map
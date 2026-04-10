/**
 * Enkap E-posta Şablonları — Türkçe HTML içerik.
 *
 * Sade inline-CSS tabanlı tasarım; tüm e-posta istemcileriyle uyumlu.
 * Harici CSS veya font bağımlılığı yoktur.
 */
export interface EmailVerificationData {
    /** Kullanıcının adı */
    name: string;
    /** Doğrulama bağlantısı (24 saat geçerli) */
    verifyUrl: string;
}
export declare const emailVerificationTemplate: (d: EmailVerificationData) => {
    subject: string;
    html: string;
    text: string;
};
export interface PasswordResetData {
    /** Kullanıcının adı */
    name: string;
    /** Sıfırlama bağlantısı (15 dakika geçerli) */
    resetUrl: string;
}
export declare const passwordResetTemplate: (d: PasswordResetData) => {
    subject: string;
    html: string;
    text: string;
};
export interface InvoiceMailData {
    /** Müşteri adı / ünvanı */
    recipientName: string;
    invoiceNo: string;
    /** "dd.MM.yyyy" formatında */
    invoiceDate: string;
    /** "dd.MM.yyyy" formatında */
    dueDate: string;
    /** "₺1.234,56" formatında */
    totalAmount: string;
    /** Gönderen şirket adı */
    senderName: string;
}
export declare const invoiceMailTemplate: (d: InvoiceMailData) => {
    subject: string;
    html: string;
    text: string;
};
export type ReminderLevel = 'upcoming' | 'overdue_1' | 'overdue_7' | 'overdue_30';
export interface PaymentReminderData {
    recipientName: string;
    invoiceNo: string;
    installmentNo: number;
    totalParts: number;
    /** "dd.MM.yyyy" */
    dueDate: string;
    /** "₺1.234,56" */
    amount: string;
    level: ReminderLevel;
    companyName: string;
}
export declare const paymentReminderTemplate: (d: PaymentReminderData) => {
    subject: string;
    html: string;
    text: string;
};
export interface WelcomeMailData {
    adminName: string;
    companyName: string;
    tenantSlug: string;
    loginUrl: string;
}
export declare const welcomeMailTemplate: (d: WelcomeMailData) => {
    subject: string;
    html: string;
    text: string;
};
export interface SubscriptionInvoiceData {
    companyName: string;
    invoiceNo: string;
    planName: string;
    /** "YYYY-MM" */
    period: string;
    /** "₺799,00" */
    netAmount: string;
    /** "₺159,80" */
    kdvAmount: string;
    /** "₺958,80" */
    totalAmount: string;
}
export interface PayslipMailData {
    /** Çalışanın adı */
    employeeName: string;
    /** "Mart 2025" gibi dönem etiketi */
    period: string;
    /** "₺18.450,00" formatında net ücret */
    netAmount: string;
    /** Şirket adı (gönderen) */
    companyName: string;
}
export declare const payslipTemplate: (d: PayslipMailData) => {
    subject: string;
    html: string;
    text: string;
};
export interface ReconciliationStatementData {
    /** Karşı taraf (müşteri/tedarikçi) adı */
    contactName: string;
    /** "dd.MM.yyyy" */
    statementDate: string;
    /** "₺12.345,67" */
    netBalance: string;
    /** 'alacak' veya 'borç' */
    balanceType: 'alacak' | 'borç';
    /** Gönderen şirket adı */
    senderName: string;
}
export declare const reconciliationStatementTemplate: (d: ReconciliationStatementData) => {
    subject: string;
    html: string;
    text: string;
};
export declare const subscriptionInvoiceTemplate: (d: SubscriptionInvoiceData) => {
    subject: string;
    html: string;
    text: string;
};

/**
 * Enkap E-posta Şablonları — Türkçe HTML içerik.
 *
 * Sade inline-CSS tabanlı tasarım; tüm e-posta istemcileriyle uyumlu.
 * Harici CSS veya font bağımlılığı yoktur.
 */

const BRAND_COLOR   = '#1a56db';
const TEXT_COLOR    = '#374151';
const BG_COLOR      = '#f9fafb';
const CARD_BG       = '#ffffff';
const BORDER_COLOR  = '#e5e7eb';
const MUTED_COLOR   = '#6b7280';

const layout = (content: string) => `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:Arial,sans-serif;color:${TEXT_COLOR};">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${BORDER_COLOR};border-radius:8px;">
          <!-- Başlık -->
          <tr>
            <td style="padding:24px 40px;border-bottom:1px solid ${BORDER_COLOR};">
              <span style="font-size:22px;font-weight:700;color:${BRAND_COLOR};">Enkap ERP</span>
            </td>
          </tr>
          <!-- İçerik -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Alt Bilgi -->
          <tr>
            <td style="padding:16px 40px;border-top:1px solid ${BORDER_COLOR};text-align:center;">
              <p style="margin:0;font-size:12px;color:${MUTED_COLOR};">
                Bu e-posta Enkap ERP platformu tarafından gönderilmiştir.<br>
                Herhangi bir sorunuz için <a href="mailto:destek@enkap.com.tr" style="color:${BRAND_COLOR};">destek@enkap.com.tr</a> adresine yazabilirsiniz.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const button = (text: string, url: string) =>
  `<a href="${url}" style="display:inline-block;padding:12px 28px;background:${BRAND_COLOR};color:#fff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">${text}</a>`;

// ─── E-posta Doğrulama ───────────────────────────────────────────────────────

export interface EmailVerificationData {
  /** Kullanıcının adı */
  name:      string;
  /** Doğrulama bağlantısı (24 saat geçerli) */
  verifyUrl: string;
}

export const emailVerificationTemplate = (d: EmailVerificationData) => ({
  subject: 'Enkap ERP — E-posta Adresinizi Doğrulayın',
  html: layout(`
    <h2 style="margin:0 0 16px;font-size:20px;">Merhaba, ${d.name}</h2>
    <p style="margin:0 0 24px;line-height:1.6;">
      Enkap ERP hesabınıza kaydolduğunuz için teşekkürler!<br>
      Hesabınızı aktifleştirmek için aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın.
    </p>
    ${button('E-posta Adresimi Doğrula', d.verifyUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.6;">
      Bu bağlantı <strong>24 saat</strong> süreyle geçerlidir.<br>
      Bu talebi siz başlatmadıysanız bu e-postayı görmezden gelebilirsiniz.
    </p>
  `),
  text: `E-posta doğrulama bağlantısı:\n${d.verifyUrl}\n\nBağlantı 24 saat geçerlidir.`,
});

// ─── Şifre Sıfırlama ─────────────────────────────────────────────────────────

export interface PasswordResetData {
  /** Kullanıcının adı */
  name: string;
  /** Sıfırlama bağlantısı (15 dakika geçerli) */
  resetUrl: string;
}

export const passwordResetTemplate = (d: PasswordResetData) => ({
  subject: 'Enkap ERP — Şifre Sıfırlama',
  html: layout(`
    <h2 style="margin:0 0 16px;font-size:20px;">Merhaba, ${d.name}</h2>
    <p style="margin:0 0 24px;line-height:1.6;">
      Şifre sıfırlama talebinde bulundunuz. Aşağıdaki butona tıklayarak yeni şifrenizi belirleyebilirsiniz.
    </p>
    ${button('Şifremi Sıfırla', d.resetUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.6;">
      Bu bağlantı <strong>15 dakika</strong> süreyle geçerlidir.<br>
      Bu talebi siz başlatmadıysanız bu e-postayı görmezden gelebilirsiniz.
    </p>
  `),
  text: `Şifre sıfırlama bağlantısı:\n${d.resetUrl}\n\nBağlantı 15 dakika geçerlidir.`,
});

// ─── Fatura Teslimi ───────────────────────────────────────────────────────────

export interface InvoiceMailData {
  /** Müşteri adı / ünvanı */
  recipientName: string;
  invoiceNo:     string;
  /** "dd.MM.yyyy" formatında */
  invoiceDate:   string;
  /** "dd.MM.yyyy" formatında */
  dueDate:       string;
  /** "₺1.234,56" formatında */
  totalAmount:   string;
  /** Gönderen şirket adı */
  senderName:    string;
}

export const invoiceMailTemplate = (d: InvoiceMailData) => ({
  subject: `Fatura: ${d.invoiceNo} — ${d.senderName}`,
  html: layout(`
    <h2 style="margin:0 0 16px;font-size:20px;">Fatura Bilgisi</h2>
    <p style="margin:0 0 24px;line-height:1.6;">
      Sayın <strong>${d.recipientName}</strong>,<br>
      ${d.invoiceDate} tarihli <strong>${d.invoiceNo}</strong> numaralı faturanız ekte sunulmuştur.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:6px;overflow:hidden;">
      <tr style="background:${BG_COLOR};">
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Fatura No</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${d.invoiceNo}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Fatura Tarihi</td>
        <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid ${BORDER_COLOR};">${d.invoiceDate}</td>
      </tr>
      <tr style="background:${BG_COLOR};">
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Vade Tarihi</td>
        <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid ${BORDER_COLOR};">${d.dueDate}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:15px;font-weight:700;">Toplam Tutar</td>
        <td style="padding:10px 16px;font-size:15px;font-weight:700;color:${BRAND_COLOR};">${d.totalAmount}</td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${MUTED_COLOR};">
      Fatura PDF'i bu e-postanın ekinde yer almaktadır.
    </p>
  `),
  text: `Fatura: ${d.invoiceNo}\nTutar: ${d.totalAmount}\nVade: ${d.dueDate}\nGönderen: ${d.senderName}`,
});

// ─── Ödeme Hatırlatması ───────────────────────────────────────────────────────

export type ReminderLevel = 'upcoming' | 'overdue_1' | 'overdue_7' | 'overdue_30';

const LEVEL_LABELS: Record<ReminderLevel, string> = {
  upcoming:   'Yaklaşan Vade',
  overdue_1:  '1 Gün Gecikme',
  overdue_7:  '7 Gün Gecikme',
  overdue_30: '30 Gün Gecikme — Son Uyarı',
};

const LEVEL_COLORS: Record<ReminderLevel, string> = {
  upcoming:   '#2563eb',
  overdue_1:  '#d97706',
  overdue_7:  '#dc2626',
  overdue_30: '#7c3aed',
};

export interface PaymentReminderData {
  recipientName: string;
  invoiceNo:     string;
  installmentNo: number;
  totalParts:    number;
  /** "dd.MM.yyyy" */
  dueDate:       string;
  /** "₺1.234,56" */
  amount:        string;
  level:         ReminderLevel;
  companyName:   string;
}

export const paymentReminderTemplate = (d: PaymentReminderData) => {
  const labelColor = LEVEL_COLORS[d.level];
  const label      = LEVEL_LABELS[d.level];

  return {
    subject: `[${label}] Fatura ${d.invoiceNo} — ${d.amount} vadesi ${d.dueDate}`,
    html: layout(`
      <div style="display:inline-block;padding:4px 12px;background:${labelColor}20;color:${labelColor};border-radius:4px;font-size:12px;font-weight:700;margin-bottom:16px;">
        ${label.toUpperCase()}
      </div>
      <h2 style="margin:0 0 16px;font-size:20px;">Ödeme Hatırlatması</h2>
      <p style="margin:0 0 24px;line-height:1.6;">
        Sayın <strong>${d.recipientName}</strong>,<br>
        <strong>${d.invoiceNo}</strong> numaralı faturanızın <strong>${d.installmentNo}/${d.totalParts}</strong>. taksiti hakkında bilgi sunmak istedik.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:6px;">
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Fatura No</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${d.invoiceNo}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Vade Tarihi</td>
          <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid ${BORDER_COLOR};">${d.dueDate}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;font-size:15px;font-weight:700;">Taksit Tutarı</td>
          <td style="padding:10px 16px;font-size:15px;font-weight:700;color:${labelColor};">${d.amount}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0;font-size:13px;color:${MUTED_COLOR};">
        Ödemenizi gerçekleştirdiyseniz bu bildirimi görmezden gelebilirsiniz.
        ${d.level === 'overdue_30' ? '<br><strong style="color:#7c3aed;">Bu son uyarıdır. Ödeme yapılmazsa yasal süreç başlatılabilir.</strong>' : ''}
      </p>
    `),
    text: `Ödeme Hatırlatması [${label}]\nFatura: ${d.invoiceNo}\nVade: ${d.dueDate}\nTutar: ${d.amount}`,
  };
};

// ─── Hoş Geldiniz (Onboarding) ────────────────────────────────────────────────

export interface WelcomeMailData {
  adminName:   string;
  companyName: string;
  tenantSlug:  string;
  loginUrl:    string;
}

export const welcomeMailTemplate = (d: WelcomeMailData) => ({
  subject: `Enkap ERP'ye Hoş Geldiniz — ${d.companyName}`,
  html: layout(`
    <h2 style="margin:0 0 8px;font-size:22px;">Hoş Geldiniz! 🎉</h2>
    <p style="margin:0 0 24px;color:${MUTED_COLOR};font-size:15px;">${d.companyName} hesabınız başarıyla oluşturuldu.</p>
    <p style="margin:0 0 24px;line-height:1.6;">
      Merhaba <strong>${d.adminName}</strong>,<br>
      Enkap ERP platformuna başarıyla kayıt oldunuz. Aşağıdaki bilgileri kullanarak sisteme giriş yapabilirsiniz.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:6px;margin-bottom:24px;">
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Firma Kodu</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:700;font-family:monospace;border-bottom:1px solid ${BORDER_COLOR};">${d.tenantSlug}</td>
      </tr>
    </table>
    ${button('Sisteme Giriş Yap', d.loginUrl)}
  `),
  text: `Enkap ERP'ye hoş geldiniz!\nFirma Kodunuz: ${d.tenantSlug}\nGiriş: ${d.loginUrl}`,
});

// ─── Abonelik Faturası ────────────────────────────────────────────────────────

export interface SubscriptionInvoiceData {
  companyName:  string;
  invoiceNo:    string;
  planName:     string;
  /** "YYYY-MM" */
  period:       string;
  /** "₺799,00" */
  netAmount:    string;
  /** "₺159,80" */
  kdvAmount:    string;
  /** "₺958,80" */
  totalAmount:  string;
}

// ─── Bordro Pusulası ──────────────────────────────────────────────────────────

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

export const payslipTemplate = (d: PayslipMailData) => ({
  subject: `${d.period} Dönemi Bordro Pusulası — ${d.companyName}`,
  html: layout(`
    <h2 style="margin:0 0 16px;font-size:20px;">Bordro Pusulası</h2>
    <p style="margin:0 0 24px;line-height:1.6;">
      Sayın <strong>${d.employeeName}</strong>,<br>
      <strong>${d.period}</strong> dönemine ait bordro pusulası ekte sunulmuştur.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:6px;">
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Dönem</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${d.period}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;">Net Ücret</td>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;color:${BRAND_COLOR};">${d.netAmount}</td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${MUTED_COLOR};">
      Bordro pusulasının detayları bu e-postanın ekindeki PDF dosyasında yer almaktadır.<br>
      Herhangi bir sorunuz için İnsan Kaynakları departmanına başvurunuz.
    </p>
  `),
  text: `${d.period} Bordro Pusulası\nNet Ücret: ${d.netAmount}\nDetaylar ekteki PDF'de.`,
});

// ─── Cari Hesap Mutabakat Belgesi ────────────────────────────────────────────

export interface ReconciliationStatementData {
  /** Karşı taraf (müşteri/tedarikçi) adı */
  contactName:  string;
  /** "dd.MM.yyyy" */
  statementDate: string;
  /** "₺12.345,67" */
  netBalance:   string;
  /** 'alacak' veya 'borç' */
  balanceType:  'alacak' | 'borç';
  /** Gönderen şirket adı */
  senderName:   string;
}

export const reconciliationStatementTemplate = (d: ReconciliationStatementData) => ({
  subject: `Cari Hesap Mutabakat Belgesi — ${d.statementDate} — ${d.senderName}`,
  html: layout(`
    <h2 style="margin:0 0 16px;font-size:20px;">Cari Hesap Mutabakat Belgesi</h2>
    <p style="margin:0 0 24px;line-height:1.6;">
      Sayın <strong>${d.contactName}</strong>,<br>
      <strong>${d.statementDate}</strong> tarihi itibarıyla hazırlanan cari hesap mutabakat belgeniz ekte sunulmuştur.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:6px;">
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Belge Tarihi</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${d.statementDate}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;">Net Bakiye (${d.balanceType})</td>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;color:${BRAND_COLOR};">${d.netBalance}</td>
      </tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:${MUTED_COLOR};">
      Mutabakat belgesini inceleyerek aşağıdaki adrese imzalı/kaşeli olarak iade etmenizi rica ederiz.<br>
      Herhangi bir itirazınız varsa lütfen 15 gün içinde bildirin.
    </p>
  `),
  text: `Cari Hesap Mutabakat Belgesi\nTarih: ${d.statementDate}\nNet Bakiye (${d.balanceType}): ${d.netBalance}\nGönderen: ${d.senderName}`,
});

export const subscriptionInvoiceTemplate = (d: SubscriptionInvoiceData) => ({
  subject: `Enkap Abonelik Faturası — ${d.invoiceNo} (${d.period})`,
  html: layout(`
    <h2 style="margin:0 0 16px;font-size:20px;">Abonelik Faturası</h2>
    <p style="margin:0 0 24px;line-height:1.6;">
      Sayın <strong>${d.companyName}</strong>,<br>
      ${d.period} dönemine ait Enkap ERP abonelik faturanız hazırlanmıştır.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BORDER_COLOR};border-radius:6px;">
      <tr style="background:${BG_COLOR};">
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Fatura No</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;border-bottom:1px solid ${BORDER_COLOR};">${d.invoiceNo}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Plan</td>
        <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid ${BORDER_COLOR};">${d.planName}</td>
      </tr>
      <tr style="background:${BG_COLOR};">
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">Net Tutar</td>
        <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid ${BORDER_COLOR};">${d.netAmount}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR};">KDV (%20)</td>
        <td style="padding:10px 16px;font-size:13px;border-bottom:1px solid ${BORDER_COLOR};">${d.kdvAmount}</td>
      </tr>
      <tr>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;">Toplam</td>
        <td style="padding:12px 16px;font-size:16px;font-weight:700;color:${BRAND_COLOR};">${d.totalAmount}</td>
      </tr>
    </table>
  `),
  text: `Abonelik Faturası ${d.invoiceNo}\nPlan: ${d.planName}\nToplam: ${d.totalAmount}`,
});

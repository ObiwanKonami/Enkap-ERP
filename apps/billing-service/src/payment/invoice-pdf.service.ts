import { Injectable } from '@nestjs/common';
import {
  PdfBase,
  COLORS,
  PAGE,
  formatKurus,
  formatDate,
} from '@enkap/reporting';
import type { BillingInvoice } from './billing-invoice.entity';
import type { BillingPlan } from '../subscription/plan.entity';

/**
 * Abonelik Faturası PDF Üreticisi (A4).
 *
 * Format:
 *  ─────────────────────────────────
 *  Enkap ERP — Abonelik Faturası
 *  Fatura No: INV-xxx | Dönem: YYYY-MM
 *  ─────────────────────────────────
 *  Müşteri: <companyName>
 *  Plan: <planName>
 *  ─────────────────────────────────
 *  Net Tutar  ₺xxx
 *  KDV %20    ₺xxx
 *  Toplam     ₺xxx
 *  ─────────────────────────────────
 */
class SubscriptionInvoiceDocument extends PdfBase {
  constructor(
    private readonly invoice:     BillingInvoice,
    private readonly plan:        BillingPlan,
    private readonly companyName: string,
  ) {
    super();
  }

  protected async build(): Promise<void> {
    const { doc, invoice, plan, companyName } = this;

    const period = `${invoice.periodStart.getFullYear()}-${String(invoice.periodStart.getMonth() + 1).padStart(2, '0')}`;

    // ── 1. Başlık ──────────────────────────────────────────────────────────
    this.drawPageHeader(
      'ABONELİK FATURASI',
      `Fatura No: ${invoice.invoiceNumber}  |  Dönem: ${period}`,
    );

    const y0 = PAGE.margin + 56;

    // ── 2. Müşteri / Plan Bilgisi ──────────────────────────────────────────
    this.drawInfoBlock(
      [
        ['Şirket',   companyName],
        ['Plan',     plan.name],
        ['Durum',    invoice.status === 'paid' ? 'Ödendi' : 'Bekliyor'],
      ],
      PAGE.margin,
      y0,
    );

    this.drawInfoBlock(
      [
        ['Dönem Başlangıç', formatDate(invoice.periodStart)],
        ['Dönem Bitiş',     formatDate(invoice.periodEnd)],
        ['Fatura Tarihi',   formatDate(invoice.createdAt)],
      ],
      PAGE.margin + PAGE.contentWidth / 2 + 10,
      y0,
    );

    // ── 3. Tutar Tablosu ───────────────────────────────────────────────────
    const tableY = y0 + 80;
    doc.rect(PAGE.margin, tableY - 4, PAGE.contentWidth, 0.5).fill(COLORS.border);

    // Başlık satırı
    doc.rect(PAGE.margin, tableY, PAGE.contentWidth, 22).fill(COLORS.tableHead);
    this.setFont('Bold', 9).doc
        .fillColor(COLORS.text)
        .text('Açıklama', PAGE.margin + 8, tableY + 6)
        .text('Tutar', PAGE.margin + PAGE.contentWidth - 80, tableY + 6, { width: 72, align: 'right' });

    const rows: Array<[string, number, boolean?]> = [
      [`Enkap ERP ${plan.name} Plan — ${period}`, invoice.amountKurus],
      ['KDV (%20)',                                invoice.kdvKurus],
    ];

    let rowY = tableY + 26;
    let alt  = false;

    for (const [label, kurus, bold] of rows) {
      if (alt) doc.rect(PAGE.margin, rowY, PAGE.contentWidth, 22).fill(COLORS.tableHead);

      this.setFont(bold ? 'Bold' : 'Regular', 9).doc
          .fillColor(COLORS.text)
          .text(label, PAGE.margin + 8, rowY + 6, { width: PAGE.contentWidth - 100 });

      this.setFont('Regular', 9).doc
          .text(formatKurus(kurus), PAGE.margin + PAGE.contentWidth - 80, rowY + 6, {
            width: 72,
            align: 'right',
          });

      rowY += 22;
      alt = !alt;
    }

    // Toplam satırı
    doc.rect(PAGE.margin, rowY, PAGE.contentWidth, 0.5).fill(COLORS.border);
    rowY += 8;

    doc.rect(PAGE.margin, rowY, PAGE.contentWidth, 30).fill(COLORS.primary + '18');
    this.setFont('Bold', 11).doc
        .fillColor(COLORS.primary)
        .text('TOPLAM', PAGE.margin + 8, rowY + 9)
        .text(
          formatKurus(invoice.totalKurus),
          PAGE.margin,
          rowY + 9,
          { width: PAGE.contentWidth - 10, align: 'right' },
        );

    // ── 4. Ödeme Notu ──────────────────────────────────────────────────────
    const noteY = rowY + 48;
    this.setFont('Regular', 8).doc
        .fillColor(COLORS.muted)
        .text(
          invoice.status === 'paid'
            ? 'Bu fatura otomatik ödeme ile tahsil edilmiştir.'
            : 'Ödeme bekleniyor. Sorun yaşıyorsanız destek@enkap.com.tr adresine yazınız.',
          PAGE.margin,
          noteY,
        );

    this.drawPageFooter(new Date());
  }
}

/**
 * Abonelik fatura PDF üretici servisi.
 */
@Injectable()
export class InvoicePdfService {
  async build(
    invoice:     BillingInvoice,
    plan:        BillingPlan,
    companyName: string,
  ): Promise<Buffer> {
    const doc = new SubscriptionInvoiceDocument(invoice, plan, companyName);
    return doc.toBuffer();
  }
}

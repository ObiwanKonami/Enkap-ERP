import { Injectable } from '@nestjs/common';
import { PdfBase, COLORS, PAGE, formatDate, formatKurus, formatNumber } from '../pdf-base';
import type { InvoiceReportData } from '../../shared/types';
import { QrGeneratorService } from '../../qr/qr-generator.service';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  E_FATURA: 'e-Fatura',
  E_ARSIV:  'e-Arşiv Fatura',
  PURCHASE: 'Alım Faturası',
  PROFORMA: 'Proforma Fatura',
};

/** Fatura durumu → Türkçe etiket + renk */
const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:        { label: 'TASLAK',         color: '#92400e', bg: '#fef3c7' },
  PENDING_GIB:  { label: 'ÖDEME BEKLİYOR', color: '#92400e', bg: '#fef3c7' },
  SENT_GIB:     { label: 'GİB\'E GÖNDERİLDİ', color: '#1e40af', bg: '#dbeafe' },
  ACCEPTED_GIB: { label: 'GİB ONAYLANDI',  color: '#065f46', bg: '#d1fae5' },
  REJECTED_GIB: { label: 'GİB REDDEDİLDİ', color: '#991b1b', bg: '#fee2e2' },
  CANCELLED:    { label: 'İPTAL EDİLDİ',   color: '#991b1b', bg: '#fee2e2' },
};

// Koyu lacivert — tablo başlık, fatura no badge, ÖDENECEK TUTAR kutusu
const NAVY = '#1a237e';

/**
 * Fatura PDF Şablonu.
 *
 * Layout (A4):
 *  ─────────────────────────────────────────────
 *  [Mavi çizgi]
 *  FATURA (büyük)              # Fatura No badge
 *  Tarih | Vade | Tür          Durum badge
 *  ─────────────────────────────────────────────
 *  [Satıcı Bento]  [Alıcı Bento]
 *  ─────────────────────────────────────────────
 *  # | Açıklama | Miktar | Birim | Br.F | İsk | KDV% | KDV | Toplam
 *  ─────────────────────────────────────────────
 *                  Ara Toplam   ₺xxx
 *                  KDV %20      ₺xxx
 *  ─────────────────────────────────────────────
 *  [ÖDENECEK TUTAR (lacivert kutu, büyük tutar)]
 *  IBAN / Notlar
 *  ─────────────────────────────────────────────
 *  [Sayfa altbilgisi]
 */
@Injectable()
export class InvoiceTemplate extends PdfBase {
  private data!: InvoiceReportData;

  constructor(private readonly qrGenerator: QrGeneratorService) {
    super();
  }

  setData(data: InvoiceReportData): this {
    this.data = data;
    return this;
  }

  protected async build(): Promise<void> {
    const { doc, data } = this;
    const W = PAGE.contentWidth;
    let y = PAGE.margin;

    // QR kod: E_FATURA ve E_ARSIV belgelerde sağ üst köşeye eklenir (GİB Karekod Kılavuzu v1.2)
    const isEBelge = (data.invoiceType === 'E_FATURA' || data.invoiceType === 'E_ARSIV') && !!data.gibUuid;
    let qrBuffer: Buffer | null = null;
    if (isEBelge) {
      try {
        const buyerId = data.partyVkn ?? data.partyTckn ?? '0000000000';
        qrBuffer = await this.qrGenerator.generateGibQr(
          this.qrGenerator.buildInvoiceQrData({
            sellerVkn:       data.companyVkn,
            buyerVknTckn:    buyerId,
            profileId:       data.invoiceType === 'E_ARSIV' ? 'EARSIVFATURA' : 'TICARIFATURA',
            invoiceNumber:   data.invoiceNumber,
            issueDate:       new Date(data.issueDate).toISOString().slice(0, 10),
            ettn:            data.gibUuid!,
            invoiceTypeCode: data.direction === 'OUT' ? 'SATIS' : 'ALIS',
            currency:        data.currency,
            subtotalKurus:   data.subtotalKurus,
            kdvBreakdown:    data.kdvBreakdown,
            totalKurus:      data.totalKurus,
            payableKurus:    data.totalKurus,
          }),
        );
      } catch {
        // QR üretimi başarısız olursa PDF oluşturmaya devam et
        qrBuffer = null;
      }
    }

    // ── 1. BAŞLIK ─────────────────────────────────────────────────────────
    // Üst mavi aksan çizgisi
    doc.rect(PAGE.margin, y, W, 3).fill(COLORS.primary);
    y += 10;

    // QR varsa sağ üst köşeye yerleştir (90×90pt)
    const QR_SIZE = 90;
    if (qrBuffer) {
      doc.image(qrBuffer, PAGE.margin + W - QR_SIZE, y, { width: QR_SIZE, height: QR_SIZE });
    }

    // Fatura no badge — sağ üst (QR varsa sola kaydır)
    const badgeW = 130;
    const badgeX = qrBuffer
      ? PAGE.margin + W - QR_SIZE - badgeW - 8
      : PAGE.margin + W - badgeW;
    doc.roundedRect(badgeX, y, badgeW, 22, 4).fill(NAVY);
    this.setFont('Bold', 9).doc
        .fillColor('#ffffff')
        .text(`# ${data.invoiceNumber}`, badgeX, y + 6, {
          width: badgeW, align: 'center', lineBreak: false,
        });

    // "FATURA" büyük başlık
    this.setFont('Bold', 22).doc
        .fillColor(NAVY)
        .text('FATURA', PAGE.margin, y + 2, {
          width: W - badgeW - 10, lineBreak: false,
        });

    y += 30;

    // Meta bilgiler (tarih, vade, tür)
    const metaParts: string[] = [
      `Tarih: ${formatDate(data.issueDate)}`,
      ...(data.dueDate ? [`Vade: ${formatDate(data.dueDate)}`] : []),
      `Tür: ${INVOICE_TYPE_LABELS[data.invoiceType] ?? data.invoiceType}`,
      `Yön: ${data.direction === 'OUT' ? 'Satış' : 'Alış'}`,
      ...(data.currency !== 'TRY' ? [`Döviz: ${data.currency}`] : []),
    ];
    this.setFont('Regular', 8).doc
        .fillColor(COLORS.muted)
        .text(metaParts.join('  |  '), PAGE.margin, y, {
          width: W - badgeW - 10, lineBreak: false,
        });

    // Durum badge (meta bilgilerin sağında)
    const badge = STATUS_BADGE[data.status ?? ''];
    if (badge) {
      doc.roundedRect(badgeX, y + 28, badgeW, 20, 4)
         .fill(badge.bg);
      doc.roundedRect(badgeX, y + 28, badgeW, 20, 4)
         .stroke(badge.color + '60');
      this.setFont('Bold', 8).doc
          .fillColor(badge.color)
          .text(badge.label, badgeX, y + 34, {
            width: badgeW, align: 'center', lineBreak: false,
          });
    }

    y += 16;

    // GİB UUID (varsa)
    if (data.gibUuid) {
      this.setFont('Regular', 7).doc
          .fillColor(COLORS.muted)
          .text(`GİB UUID: ${data.gibUuid}`, PAGE.margin, y, {
            width: W, lineBreak: false,
          });
      y += 12;
    }

    // e-Arşiv zorunlu ibaresi (VUK 509)
    if (data.invoiceType === 'E_ARSIV') {
      this.setFont('Regular', 7).doc
          .fillColor('#065f46')
          .text(
            'e-Arşiv İzni Kapsamında Elektronik Ortamda İletilmiştir',
            PAGE.margin, y,
            { width: W - (qrBuffer ? QR_SIZE + 8 : 0), lineBreak: false },
          );
      y += 12;
    }

    y += 10;
    doc.rect(PAGE.margin, y, W, 0.5).fill(COLORS.border);
    y += 10;

    // ── 2. SATICI / ALICI BENTO KARTLARI ──────────────────────────────────
    const cardW  = (W - 8) / 2;
    const cardH  = 80;
    const cardPad = 10;

    // Satıcı kartı
    doc.roundedRect(PAGE.margin, y, cardW, cardH, 5).fill('#f5f5f7');

    this.setFont('Regular', 7).doc
        .fillColor(COLORS.muted)
        .text('SATICI / DÜZENLEYEN', PAGE.margin + cardPad, y + cardPad, {
          width: cardW - cardPad * 2, lineBreak: false,
        });
    this.setFont('Bold', 9).doc
        .fillColor(NAVY)
        .text(data.companyName, PAGE.margin + cardPad, y + cardPad + 12, {
          width: cardW - cardPad * 2, lineBreak: false,
        });

    // Satıcı detay satırları: adres → MERSİS → Vergi Dairesi / VKN
    const sellerLines: string[] = [];
    if (data.companyAddress)  sellerLines.push(data.companyAddress);
    if (data.companyMersisNo) sellerLines.push(`MERSİS: ${data.companyMersisNo}`);
    const sellerTaxLine = [
      data.companyTaxOffice ? `V.D.: ${data.companyTaxOffice}` : '',
      data.companyVkn       ? `VKN: ${data.companyVkn}`        : '',
    ].filter(Boolean).join(' / ');
    if (sellerTaxLine) sellerLines.push(sellerTaxLine);
    if (data.companyPhone) sellerLines.push(`Tel: ${data.companyPhone}`);

    this.setFont('Regular', 7.5).doc
        .fillColor(COLORS.muted)
        .text(sellerLines.join('\n') || '—', PAGE.margin + cardPad, y + cardPad + 26, {
          width: cardW - cardPad * 2,
        });

    // Alıcı kartı
    const card2X = PAGE.margin + cardW + 8;
    doc.roundedRect(card2X, y, cardW, cardH, 5).fill('#f5f5f7');

    this.setFont('Regular', 7).doc
        .fillColor(COLORS.muted)
        .text('ALICI / MÜŞTERİ', card2X + cardPad, y + cardPad, {
          width: cardW - cardPad * 2, lineBreak: false,
        });
    this.setFont('Bold', 9).doc
        .fillColor(NAVY)
        .text(data.partyName || '—', card2X + cardPad, y + cardPad + 12, {
          width: cardW - cardPad * 2, lineBreak: false,
        });

    // Alıcı detay satırları: adres → MERSİS → Vergi Dairesi / VKN/TCKN
    const buyerLines: string[] = [];
    if (data.partyAddress)   buyerLines.push(data.partyAddress);
    if (data.partyMersisNo)  buyerLines.push(`MERSİS: ${data.partyMersisNo}`);
    const buyerTaxLine = [
      data.partyTaxOffice ? `V.D.: ${data.partyTaxOffice}` : '',
      data.partyVkn       ? `VKN: ${data.partyVkn}`        : '',
      data.partyTckn      ? `TCKN: ${data.partyTckn}`      : '',
    ].filter(Boolean).join(' / ');
    if (buyerTaxLine) buyerLines.push(buyerTaxLine);

    this.setFont('Regular', 7.5).doc
        .fillColor(COLORS.muted)
        .text(buyerLines.join('\n') || '—', card2X + cardPad, y + cardPad + 26, {
          width: cardW - cardPad * 2,
        });

    y += cardH + 14;

    // ── 3. KALEMLER TABLOSU ────────────────────────────────────────────────
    const columns = [
      { label: '#',         width: W * 0.04, align: 'center' as const },
      { label: 'Açıklama',  width: W * 0.24, align: 'left'   as const },
      { label: 'Miktar',    width: W * 0.08, align: 'right'  as const },
      { label: 'Birim',     width: W * 0.07, align: 'center' as const },
      { label: 'Br.Fiyat',  width: W * 0.13, align: 'right'  as const },
      { label: 'İsk.%',     width: W * 0.07, align: 'right'  as const },
      { label: 'KDV%',      width: W * 0.07, align: 'right'  as const },
      { label: 'KDV',       width: W * 0.13, align: 'right'  as const },
      { label: 'Toplam',    width: W * 0.17, align: 'right'  as const },
    ] as const;

    const tableRows = data.lines.map((line) => [
      String(line.lineNumber),
      line.description,
      formatNumber(line.quantity),
      line.unit,
      formatKurus(line.unitPriceKurus),
      line.discountPct > 0 ? `%${formatNumber(line.discountPct, 1)}` : '-',
      `%${line.kdvRate}`,
      formatKurus(line.kdvAmountKurus),
      formatKurus(line.lineTotalKurus),
    ]);

    let afterY = this.drawTable(
      columns as unknown as Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>,
      tableRows,
      y,
      18,
      { headerBg: NAVY, headerTextColor: '#ffffff' },
    );

    afterY += 10;

    // ── 4. TOPLAMLAR ──────────────────────────────────────────────────────
    doc.rect(PAGE.margin, afterY, W, 0.5).fill(COLORS.border);
    afterY += 6;

    afterY = this.drawTotalRow('Ara Toplam', formatKurus(data.subtotalKurus), afterY);

    for (const kdv of data.kdvBreakdown) {
      afterY = this.drawTotalRow(`KDV %${kdv.rate}`, formatKurus(kdv.amountKurus), afterY);
    }

    doc.rect(PAGE.margin, afterY, W, 0.5).fill(COLORS.border);
    afterY += 8;

    // ── 5. ÖDENECEK TUTAR KUTUSU ──────────────────────────────────────────
    const totalBoxH = 44;
    doc.rect(PAGE.margin, afterY, W, totalBoxH).fill(NAVY);

    this.setFont('Regular', 9).doc
        .fillColor('#ffffff')
        .opacity(0.75)
        .text('ÖDENECEK TUTAR', PAGE.margin + 14, afterY + 14, { lineBreak: false });

    this.setFont('Bold', 18).doc
        .fillColor('#ffffff')
        .opacity(1)
        .text(formatKurus(data.totalKurus), PAGE.margin, afterY + 12, {
          width: W - 14, align: 'right', lineBreak: false,
        });

    doc.opacity(1);
    afterY += totalBoxH + 14;

    // ── 6. IBAN VE NOTLAR ─────────────────────────────────────────────────
    if (data.bankAccount || data.notes) {
      doc.rect(PAGE.margin, afterY, W, 0.5).fill(COLORS.border);
      afterY += 10;

      if (data.bankAccount) {
        this.setFont('Regular', 7.5).doc.fillColor(COLORS.muted)
            .text('Banka Hesabı (IBAN):', PAGE.margin, afterY, { lineBreak: false });
        afterY += 12;
        this.setFont('Bold', 8).doc.fillColor(COLORS.text)
            .text(data.bankAccount, PAGE.margin, afterY, { lineBreak: false });
        afterY += 16;
      }

      if (data.notes) {
        this.setFont('Regular', 7.5).doc.fillColor(COLORS.muted)
            .text('Notlar:', PAGE.margin, afterY, { lineBreak: false });
        afterY += 12;
        this.setFont('Regular', 8).doc.fillColor(COLORS.text)
            .text(data.notes, PAGE.margin, afterY, { width: W });
      }
    }

    // ── 7. SAYFA ALTBİLGİSİ ───────────────────────────────────────────────
    this.drawPageFooter(new Date());
  }
}

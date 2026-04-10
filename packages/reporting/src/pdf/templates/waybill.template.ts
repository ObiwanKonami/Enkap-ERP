import { Injectable } from '@nestjs/common';
import { PdfBase, COLORS, PAGE, formatDate, formatNumber } from '../pdf-base';
import { QrGeneratorService } from '../../qr/qr-generator.service';
import type { WaybillReportData } from '../../shared/types';

const NAVY = '#1a237e';

const TYPE_LABELS: Record<string, string> = {
  SATIS:    'Satış İrsaliyesi',
  ALIS:     'Alış İrsaliyesi',
  TRANSFER: 'Transfer İrsaliyesi',
  IADE:     'İade İrsaliyesi',
};

const TYPE_COLORS: Record<string, string> = {
  SATIS:    '#0EA5E9',
  ALIS:     '#10B981',
  TRANSFER: '#8B5CF6',
  IADE:     '#F59E0B',
};

/**
 * İrsaliye PDF Şablonu (A4)
 *
 * Layout:
 *  [Mavi aksan çizgisi]
 *  İRSALİYE (büyük) + Tür badge    # No badge (lacivert)
 *  Tarih / Teslim Tarihi / Ref
 *  ─────────────────────────────────
 *  [Gönderici bento]  [Alıcı bento]
 *  ─────────────────────────────────
 *  [Taşıma bandı — gri]
 *  ─────────────────────────────────
 *  # | Ürün Adı | SKU | Miktar | Birim | Depo | Lot/Seri
 *  ─────────────────────────────────
 *  [Toplam mavi bant]
 *  Notlar
 *  ─────────────────────────────────
 *  [İmza Alanları]
 *  [Altbilgi]
 */
@Injectable()
export class WaybillTemplate extends PdfBase {
  private data!: WaybillReportData;

  constructor(private readonly qrGenerator: QrGeneratorService) {
    super();
  }

  setData(data: WaybillReportData): this {
    this.data = data;
    return this;
  }

  protected async build(): Promise<void> {
    const { doc, data } = this;
    const M = PAGE.margin;
    const W = PAGE.contentWidth;

    // ── 1. BAŞLIK ─────────────────────────────────────────────────────────────
    // Üst mavi aksan çizgisi
    doc.rect(M, M, W, 3).fill(COLORS.primary);
    let y = M + 10;

    // e-İrsaliye QR kodu (sağ üst köşe, GİB Karekod Kılavuzu v1.2 — EIRSALIYE senaryosu)
    const QR_SIZE = 90;
    let qrBuffer: Buffer | null = null;
    if (data.gibUuid) {
      try {
        qrBuffer = await this.qrGenerator.generateGibQr(
          this.qrGenerator.buildIrsaliyeQrData({
            senderVkn:     data.senderVkn ?? '',
            receiverVkn:   data.receiverVknTckn ?? '',
            waybillNumber: data.waybillNumber,
            issueDate:     data.shipDate.toISOString().slice(0, 10),
            ettn: data.gibUuid,
          }),
        );
        doc.image(qrBuffer, M + W - QR_SIZE, y, { width: QR_SIZE, height: QR_SIZE });
      } catch {
        // QR üretimi başarısız olursa PDF oluşturmaya devam et
        qrBuffer = null;
      }
    }

    // Sağ üst: irsaliye no badge — QR varsa sola kaydır
    const badgeW = 130;
    const badgeX = qrBuffer
      ? M + W - QR_SIZE - badgeW - 8
      : M + W - badgeW;
    doc.roundedRect(badgeX, y, badgeW, 22, 4).fill(NAVY);
    this.setFont('Bold', 9).doc
        .fillColor('#ffffff')
        .text(`# ${data.waybillNumber}`, badgeX, y + 6, {
          width: badgeW, align: 'center', lineBreak: false,
        });

    // Sol: "İRSALİYE" büyük başlık
    this.setFont('Bold', 22).doc
        .fillColor(NAVY)
        .text('İRSALİYE', M, y + 2, { width: W - badgeW - 10, lineBreak: false });

    y += 30;

    // Tür badge
    const typeColor = TYPE_COLORS[data.type] ?? COLORS.primary;
    const typeLabel = TYPE_LABELS[data.type] ?? data.type;
    const typeBadgeW = 110;
    doc.roundedRect(M, y, typeBadgeW, 18, 4).fill(`${typeColor}22`);
    this.setFont('Bold', 8).doc
        .fillColor(typeColor)
        .text(typeLabel, M + 4, y + 4, { width: typeBadgeW - 8, lineBreak: false });

    // Meta: tarihler sağda
    const metaParts: string[] = [`Sevk: ${formatDate(data.shipDate)}`];
    if (data.deliveryDate) metaParts.push(`Teslim: ${formatDate(data.deliveryDate)}`);
    if (data.refNumber)    metaParts.push(`Ref: ${data.refNumber}`);

    this.setFont('Regular', 8).doc
        .fillColor(COLORS.muted)
        .text(metaParts.join('  |  '), badgeX, y + 4, {
          width: badgeW, align: 'right', lineBreak: false,
        });

    y += 26;

    // GİB UUID
    if (data.gibUuid) {
      this.setFont('Regular', 7).doc
          .fillColor(COLORS.muted)
          .text(`GİB UUID: ${data.gibUuid}`, M, y, { width: W, lineBreak: false });
      y += 12;
    }

    y += 6;
    doc.rect(M, y, W, 0.5).fill(COLORS.border);
    y += 10;

    // ── 2. GÖNDERİCİ / ALICI BENTO KARTLARI ──────────────────────────────────
    const cardW   = (W - 8) / 2;
    const cardH   = 78;
    const cardPad = 10;

    // Gönderici kartı
    doc.roundedRect(M, y, cardW, cardH, 5).fill('#f5f5f7');
    this.setFont('Regular', 7).doc.fillColor(COLORS.muted)
        .text('GÖNDERİCİ / DÜZENLEYEN', M + cardPad, y + cardPad, {
          width: cardW - cardPad * 2, lineBreak: false,
        });
    this.setFont('Bold', 9).doc.fillColor(NAVY)
        .text(data.senderName, M + cardPad, y + cardPad + 12, {
          width: cardW - cardPad * 2, lineBreak: false,
        });
    const senderLines: string[] = [];
    if (data.senderVkn)     senderLines.push(`VKN: ${data.senderVkn}`);
    if (data.senderAddress) senderLines.push(data.senderAddress);
    this.setFont('Regular', 7.5).doc.fillColor(COLORS.muted)
        .text(senderLines.join('\n') || '—', M + cardPad, y + cardPad + 26, {
          width: cardW - cardPad * 2,
        });

    // Alıcı kartı
    const card2X = M + cardW + 8;
    doc.roundedRect(card2X, y, cardW, cardH, 5).fill('#f5f5f7');
    this.setFont('Regular', 7).doc.fillColor(COLORS.muted)
        .text('ALICI', card2X + cardPad, y + cardPad, {
          width: cardW - cardPad * 2, lineBreak: false,
        });
    this.setFont('Bold', 9).doc.fillColor(NAVY)
        .text(data.receiverName, card2X + cardPad, y + cardPad + 12, {
          width: cardW - cardPad * 2, lineBreak: false,
        });
    const receiverLines: string[] = [];
    if (data.receiverVknTckn) receiverLines.push(`VKN/TCKN: ${data.receiverVknTckn}`);
    if (data.receiverAddress)  receiverLines.push(data.receiverAddress);
    this.setFont('Regular', 7.5).doc.fillColor(COLORS.muted)
        .text(receiverLines.join('\n') || '—', card2X + cardPad, y + cardPad + 26, {
          width: cardW - cardPad * 2,
        });

    y += cardH + 10;

    // ── 3. TAŞIMA BİLGİLERİ BANDI ────────────────────────────────────────────
    const transFields = [
      ['Araç Plakası',  data.vehiclePlate],
      ['Sürücü',        data.driverName],
      ['Kargo Firması', data.carrierName],
      ['Takip No',      data.trackingNumber],
    ].filter((entry): entry is [string, string] => !!entry[1]);

    if (transFields.length > 0) {
      const bandH = 26;
      doc.roundedRect(M, y, W, bandH, 4).fill('#f5f5f7');

      let fieldX  = M + 12;
      const fieldY = y + 8;
      for (const [label, val] of transFields) {
        this.setFont('Bold', 7.5).doc.fillColor(COLORS.muted)
            .text(`${label}:`, fieldX, fieldY, { lineBreak: false });
        this.setFont('Regular', 8).doc.fillColor(COLORS.text)
            .text(val, fieldX + 68, fieldY, { width: 105, lineBreak: false });
        fieldX += 140;
        if (fieldX > M + W - 30) break;
      }
      y += bandH + 10;
    }

    // ── 4. KALEMLER TABLOSU ───────────────────────────────────────────────────
    const cols: Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }> = [
      { label: '#',        width: W * 0.05 },
      { label: 'Ürün Adı', width: W * 0.32 },
      { label: 'SKU',      width: W * 0.12 },
      { label: 'Miktar',   width: W * 0.09, align: 'right' },
      { label: 'Birim',    width: W * 0.07, align: 'center' },
      { label: 'Depo',     width: W * 0.22 },
      { label: 'Lot/Seri', width: W * 0.13 },
    ];

    let totalQty = 0;
    const tableRows: string[][] = data.lines.map((line) => {
      totalQty += Number(line.quantity);
      const depo = line.targetWarehouseName
        ? `${line.warehouseName ?? '—'} → ${line.targetWarehouseName}`
        : (line.warehouseName ?? '—');
      return [
        String(line.lineNumber),
        line.productName,
        line.sku ?? '—',
        formatNumber(Number(line.quantity)),
        line.unitCode,
        depo,
        [line.lotNumber, line.serialNumber].filter(Boolean).join(' / ') || '—',
      ];
    });

    const afterTableY = this.drawTable(cols, tableRows, y, 18, {
      headerBg: NAVY, headerTextColor: '#ffffff',
    });

    // Toplam bandı
    y = afterTableY + 2;
    doc.rect(M, y, W, 26).fill(NAVY);
    this.setFont('Bold', 9).doc.fillColor('#ffffff')
        .opacity(0.75)
        .text('TOPLAM KALEM SAYISI', M + 10, y + 8, { lineBreak: false });
    this.setFont('Bold', 14).doc.fillColor('#ffffff')
        .opacity(1)
        .text(formatNumber(totalQty), M, y + 6, { width: W - 14, align: 'right', lineBreak: false });
    doc.opacity(1);

    y += 34;

    // ── 5. NOTLAR ─────────────────────────────────────────────────────────────
    if (data.notes) {
      doc.rect(M, y, W, 0.5).fill(COLORS.border);
      y += 10;
      this.setFont('Bold', 7.5).doc.fillColor(COLORS.muted)
          .text('Notlar:', M, y, { lineBreak: false });
      y += 12;
      this.setFont('Regular', 8).doc.fillColor(COLORS.text)
          .text(data.notes, M, y, { width: W });
      y += 20;
    }

    // ── 6. İMZA ALANLARI ──────────────────────────────────────────────────────
    const sigY = PAGE.height - PAGE.margin - 64;
    const sigW = (W - 20) / 3;

    for (let i = 0; i < 3; i++) {
      const label = ['Düzenleyen', 'Teslim Eden', 'Teslim Alan'][i]!;
      const sx = M + i * (sigW + 10);
      doc.roundedRect(sx, sigY, sigW, 52, 4).fill('#f5f5f7');
      this.setFont('Bold', 7.5).doc.fillColor(COLORS.muted)
          .text(label.toUpperCase(), sx + 8, sigY + 8, { lineBreak: false });
      doc.rect(sx + 8, sigY + 40, sigW - 16, 0.5).fill(COLORS.border);
      this.setFont('Regular', 7).doc.fillColor(COLORS.muted)
          .text('Ad / İmza / Tarih', sx + 8, sigY + 43, { lineBreak: false });
    }

    // ── 7. ALTBİLGİ ───────────────────────────────────────────────────────────
    this.drawPageFooter(data.generatedAt);
  }
}

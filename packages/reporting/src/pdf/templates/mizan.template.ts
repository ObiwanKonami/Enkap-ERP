import { Injectable } from '@nestjs/common';
import { PdfBase, COLORS, PAGE, formatDate, formatKurus } from '../pdf-base';
import type { MizanReportData } from '../../shared/types';

/**
 * Mizan (Trial Balance) PDF Şablonu.
 *
 * Layout (A4 yatay opsiyonel, dikey kullanıyoruz):
 *  ─────────────────────────────────
 *  [Enkap Mavi Çizgi]
 *  MİZAN RAPORU
 *  Şirket Adı | Dönem: 01.01.2026 - 31.03.2026
 *  ─────────────────────────────────
 *  Hesap Kodu | Hesap Adı | Tür | Borç | Alacak | Net Bakiye
 *  ─────────────────────────────────
 *  [Tüm hesap satırları]
 *  ─────────────────────────────────
 *  TOPLAM               | ₺xxx  | ₺xxx  | —
 *  Durum: ✅ DENGELİ / ⚠️ DENGESİZ
 *  ─────────────────────────────────
 *  [Alt bilgi]
 */
@Injectable()
export class MizanTemplate extends PdfBase {
  private data!: MizanReportData;

  setData(data: MizanReportData): this {
    this.data = data;
    return this;
  }

  protected async build(): Promise<void> {
    const { doc, data } = this;

    // ── 1. Başlık ──────────────────────────────────────────────────────────
    this.drawPageHeader(
      'MİZAN RAPORU',
      `${data.companyName}  |  Dönem: ${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`,
    );

    // ── 2. Özet Bilgi Kutusu ───────────────────────────────────────────────
    const infoY = PAGE.margin + 52;

    this.drawInfoBlock(
      [
        ['Toplam Borç', formatKurus(data.totalDebitKurus)],
        ['Toplam Alacak', formatKurus(data.totalCreditKurus)],
      ],
      PAGE.margin,
      infoY,
    );

    const diffKurus = Math.abs(data.totalDebitKurus - data.totalCreditKurus);

    this.drawInfoBlock(
      [
        ['Fark', diffKurus === 0 ? '₺0,00' : formatKurus(diffKurus)],
        ['Durum', data.isBalanced ? '✓ DENGELİ' : '✗ DENGESİZ'],
      ],
      PAGE.margin + PAGE.contentWidth / 2 + 10,
      infoY,
      PAGE.contentWidth / 2 - 10,
    );

    // Dengeli değilse uyarı kutusu
    if (!data.isBalanced) {
      const warnY = infoY + 50;
      doc.rect(PAGE.margin, warnY, PAGE.contentWidth, 22)
         .fill('#fef3c7');

      this.setFont('Bold', 9).doc
          .fillColor(COLORS.warning)
          .text(
            `⚠  MİZAN DENGESİZ — Fark: ${formatKurus(diffKurus)}. ` +
            'Muhasebe kayıtlarını kontrol ediniz.',
            PAGE.margin + 8,
            warnY + 6,
            { width: PAGE.contentWidth - 16 },
          );
    }

    // ── 3. Mizan Tablosu ───────────────────────────────────────────────────
    const tableY = infoY + (data.isBalanced ? 52 : 80);
    doc.rect(PAGE.margin, tableY - 4, PAGE.contentWidth, 0.5).fill(COLORS.border);

    const W = PAGE.contentWidth;
    const columns = [
      { label: 'Kod',        width: W * 0.10, align: 'left'  as const },
      { label: 'Hesap Adı',  width: W * 0.35, align: 'left'  as const },
      { label: 'Tür',        width: W * 0.10, align: 'center' as const },
      { label: 'Borç',       width: W * 0.15, align: 'right' as const },
      { label: 'Alacak',     width: W * 0.15, align: 'right' as const },
      { label: 'Net Bakiye', width: W * 0.15, align: 'right' as const },
    ] as const;

    const TYPE_LABELS: Record<string, string> = {
      ASSET:      'Varlık',
      LIABILITY:  'Kaynak',
      EQUITY:     'Özkaynak',
      REVENUE:    'Gelir',
      EXPENSE:    'Gider',
      MEMORANDUM: 'Nazım',
    };

    const tableRows = data.rows
      // Sıfır bakiyeli hesapları gizle — raporu yoğunlaştır
      .filter((r) => r.totalDebitKurus !== 0 || r.totalCreditKurus !== 0)
      .map((row) => {
        const isDebitBalance  = row.netBalanceKurus >= 0;
        const netLabel = isDebitBalance
          ? `${formatKurus(row.netBalanceKurus)} (B)`
          : `${formatKurus(-row.netBalanceKurus)} (A)`;

        return [
          row.code,
          row.name,
          TYPE_LABELS[row.type] ?? row.type,
          formatKurus(row.totalDebitKurus),
          formatKurus(row.totalCreditKurus),
          netLabel,
        ];
      });

    let afterY = this.drawTable(
      columns as unknown as Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>,
      tableRows,
      tableY,
    );

    // ── 4. Genel Toplam ────────────────────────────────────────────────────
    afterY += 4;
    doc.rect(PAGE.margin, afterY, PAGE.contentWidth, 0.5).fill(COLORS.border);
    afterY += 2;

    afterY = this.drawTotalRow(
      'Toplam Borç',
      formatKurus(data.totalDebitKurus),
      afterY,
      { bold: true },
    );

    afterY = this.drawTotalRow(
      'Toplam Alacak',
      formatKurus(data.totalCreditKurus),
      afterY,
      { bold: true },
    );

    doc.rect(PAGE.margin, afterY, PAGE.contentWidth, 0.5).fill(COLORS.border);

    const statusColor = data.isBalanced ? COLORS.success : COLORS.danger;
    const statusLabel = data.isBalanced ? '✓ DENGELİ' : '✗ DENGESİZ';

    afterY = this.drawTotalRow(
      statusLabel,
      data.isBalanced ? '₺0,00' : formatKurus(diffKurus),
      afterY + 2,
      { bold: true, color: statusColor, bgColor: statusColor + '15' },
    );

    this.drawPageFooter(data.generatedAt);
  }
}

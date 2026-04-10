import { Injectable } from '@nestjs/common';
import { PdfBase, COLORS, PAGE, formatDate, formatKurus, formatNumber } from '../pdf-base';
import type { StockReportData } from '../../shared/types';

/**
 * Stok Durumu Raporu PDF Şablonu.
 *
 * Layout (A4):
 *  ─────────────────────────────────
 *  STOK DURUM RAPORU
 *  Şirket | Tarih | Depo
 *  ─────────────────────────────────
 *  Özet: Ürün sayısı | Toplam değer | Kritik stok sayısı
 *  ─────────────────────────────────
 *  SKU | Ürün Adı | Kategori | Miktar | Birim | Ort. Maliyet | Toplam Değer
 *  ─────────────────────────────────
 *  [Kritik stok satırları kırmızıyla işaretlenir]
 *  ─────────────────────────────────
 *  TOPLAM DEĞER: ₺xxx
 *  [Alt bilgi]
 */
@Injectable()
export class StockReportTemplate extends PdfBase {
  private data!: StockReportData;

  setData(data: StockReportData): this {
    this.data = data;
    return this;
  }

  protected async build(): Promise<void> {
    const { doc, data } = this;

    // ── 1. Başlık ──────────────────────────────────────────────────────────
    this.drawPageHeader(
      'STOK DURUM RAPORU',
      `${data.companyName}  |  ${formatDate(data.reportDate)}${data.warehouseName ? `  |  Depo: ${data.warehouseName}` : ''}`,
    );

    // ── 2. Özet Kutusu ─────────────────────────────────────────────────────
    const summaryY = PAGE.margin + 52;
    doc.rect(PAGE.margin, summaryY, PAGE.contentWidth, 36).fill(COLORS.tableHead);

    const colW = PAGE.contentWidth / 3;

    const summaryItems = [
      { label: 'Toplam Ürün Çeşidi', value: String(data.products.length) },
      { label: 'Toplam Stok Değeri', value: formatKurus(data.totalValueKurus) },
      { label: 'Kritik Stok', value: String(data.criticalCount) },
    ];

    summaryItems.forEach((item, i) => {
      const x = PAGE.margin + i * colW + 10;

      this.setFont('Regular', 8).doc
          .fillColor(COLORS.muted)
          .text(item.label, x, summaryY + 6);

      const valueColor = i === 2 && data.criticalCount > 0 ? COLORS.danger : COLORS.text;
      this.setFont('Bold', 11).doc
          .fillColor(valueColor)
          .text(item.value, x, summaryY + 18);
    });

    // ── 3. Ürün Tablosu ────────────────────────────────────────────────────
    const tableY = summaryY + 46;
    doc.rect(PAGE.margin, tableY - 4, PAGE.contentWidth, 0.5).fill(COLORS.border);

    const W = PAGE.contentWidth;
    const columns = [
      { label: 'SKU',          width: W * 0.12, align: 'left'  as const },
      { label: 'Ürün Adı',     width: W * 0.28, align: 'left'  as const },
      { label: 'Kategori',     width: W * 0.13, align: 'left'  as const },
      { label: 'Miktar',       width: W * 0.10, align: 'right' as const },
      { label: 'Birim',        width: W * 0.07, align: 'center' as const },
      { label: 'Ort. Maliyet', width: W * 0.15, align: 'right' as const },
      { label: 'Toplam Değer', width: W * 0.15, align: 'right' as const },
    ] as const;

    // Kritik ürünleri üstte göster, sonra değere göre sırala
    const sorted = [...data.products].sort((a, b) => {
      if (a.isCritical && !b.isCritical) return -1;
      if (!a.isCritical && b.isCritical) return  1;
      return b.totalValueKurus - a.totalValueKurus;
    });

    // Tabloya özel çizim: kritik satırları renklendir
    let y = tableY;
    const rowHeight = 18;

    // Başlık satırı
    doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight + 2).fill(COLORS.tableHead);

    let x = PAGE.margin + 4;
    for (const col of columns) {
      this.setFont('Bold', 8).doc
          .fillColor(COLORS.text)
          .text(col.label, x, y + 5, {
            width: col.width - 8,
            align: col.align,
            lineBreak: false,
          });
      x += col.width;
    }
    y += rowHeight + 2;

    for (let i = 0; i < sorted.length; i++) {
      const product = sorted[i]!;

      if (y + rowHeight > PAGE.height - PAGE.margin - 40) {
        doc.addPage();
        y = PAGE.margin + 10;
      }

      // Kritik stok → açık kırmızı arka plan
      if (product.isCritical) {
        doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight).fill('#fef2f2');
      } else if (i % 2 === 1) {
        doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight).fill('#f9fafb');
      }

      doc.rect(PAGE.margin, y + rowHeight - 0.5, PAGE.contentWidth, 0.5).fill(COLORS.border);

      const textColor = product.isCritical ? COLORS.danger : COLORS.text;
      const cells = [
        product.sku,
        product.isCritical ? `⚠ ${product.name}` : product.name,
        product.category ?? '-',
        formatNumber(product.quantity),
        product.unit,
        formatKurus(product.avgCostKurus),
        formatKurus(product.totalValueKurus),
      ];

      x = PAGE.margin + 4;
      const colArr = columns as unknown as Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>;
      for (let j = 0; j < colArr.length; j++) {
        const col = colArr[j]!;
        this.setFont('Regular', 8).doc
            .fillColor(j < 3 ? textColor : COLORS.text)
            .text(cells[j] ?? '', x, y + 5, {
              width: col.width - 8,
              align: col.align ?? 'left',
              lineBreak: false,
            });
        x += col.width;
      }
      y += rowHeight;
    }

    // ── 4. Toplam Değer ────────────────────────────────────────────────────
    y += 6;
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 0.5).fill(COLORS.border);
    y += 2;

    y = this.drawTotalRow(
      'TOPLAM STOK DEĞERİ',
      formatKurus(data.totalValueKurus),
      y,
      { bold: true, bgColor: COLORS.primary + '15', color: COLORS.primary },
    );

    // ── 5. Kritik Stok Uyarısı ─────────────────────────────────────────────
    if (data.criticalCount > 0) {
      y += 8;
      doc.rect(PAGE.margin, y, PAGE.contentWidth, 22).fill('#fef3c7');

      this.setFont('Regular', 8).doc
          .fillColor(COLORS.warning)
          .text(
            `⚠  ${data.criticalCount} ürün minimum stok seviyesinin altında. ` +
            'Kırmızı işaretli satırlar acil sipariş gerektirir.',
            PAGE.margin + 8,
            y + 6,
            { width: PAGE.contentWidth - 16 },
          );
    }

    this.drawPageFooter(data.generatedAt);
  }
}

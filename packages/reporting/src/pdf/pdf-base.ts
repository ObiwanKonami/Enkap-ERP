import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { formatDate, formatKurus, formatNumber } from '../shared/format';

export { formatDate, formatKurus, formatNumber };

/**
 * PDF üretim temel sınıfı.
 *
 * Türkçe karakter desteği:
 *   PDFKit built-in fontlar (Helvetica) ISO-8859-1 kapsar — ğ, ş, ı, ç, ö, ü
 *   Latin Extended-A'ya (ISO-8859-9) ihtiyaç duyar.
 *   Çözüm: DejaVu Sans gömülü font (Debian: fonts-dejavu-core paketi).
 *   REPORT_FONT_PATH ortam değişkeniyle özel font belirtilir.
 *   Fallback: /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf (Ubuntu/Debian)
 *
 * Docker image için Dockerfile'a ekle:
 *   RUN apt-get install -y fonts-dejavu-core
 */

const FONT_CANDIDATES = [
  process.env.REPORT_FONT_PATH,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
].filter(Boolean) as string[];

const FONT_BOLD_CANDIDATES = [
  process.env.REPORT_FONT_BOLD_PATH,
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
].filter(Boolean) as string[];

function resolveFontPath(candidates: string[]): string | null {
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Sayfa boyutu ve kenar boşlukları */
export const PAGE = {
  width:   595.28, // A4 pt
  height:  841.89,
  margin:  40,
  contentWidth: 595.28 - 80,
} as const;

/** Renk paleti */
export const COLORS = {
  primary:    '#1a56db',  // Enkap mavi
  text:       '#111827',
  muted:      '#6b7280',
  border:     '#e5e7eb',
  tableHead:  '#f3f4f6',
  warning:    '#d97706',
  danger:     '#dc2626',
  success:    '#059669',
} as const;

/**
 * Temel PDF belge oluşturucusu.
 * Alt sınıflar build() metodunu implemente eder.
 */
export abstract class PdfBase {
  protected doc!: PDFKit.PDFDocument;
  protected fontRegular: string | null;
  protected fontBold: string | null;

  constructor() {
    this.fontRegular = resolveFontPath(FONT_CANDIDATES);
    this.fontBold    = resolveFontPath(FONT_BOLD_CANDIDATES);
  }

  /** PDF Buffer üretir */
  async toBuffer(): Promise<Buffer> {
    this.doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
      info: { Creator: 'Enkap ERP', Producer: 'Enkap ERP' },
    });

    // Font ayarla
    if (this.fontRegular) {
      this.doc.registerFont('Regular', this.fontRegular);
      if (this.fontBold) this.doc.registerFont('Bold', this.fontBold);
      else this.doc.registerFont('Bold', this.fontRegular);
    }

    await this.build();
    this.doc.end();

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      this.doc.on('end',  () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
    });
  }

  protected abstract build(): Promise<void>;

  // ─── Yardımcı Metodlar ───────────────────────────────────────────────────

  protected setFont(type: 'Regular' | 'Bold', size: number): this {
    if (this.fontRegular) {
      this.doc.font(type).fontSize(size);
    } else {
      // Gömülü font yoksa Helvetica (Türkçe karakter kısıtlı)
      this.doc.font(type === 'Bold' ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    }
    return this;
  }

  /** Sayfa başlığı + Enkap logosu alanı */
  protected drawPageHeader(
    title: string,
    subtitle?: string,
  ): void {
    const { doc } = this;

    // Başlık çizgisi
    doc.rect(PAGE.margin, PAGE.margin, PAGE.contentWidth, 3)
       .fill(COLORS.primary);

    // Başlık metni
    this.setFont('Bold', 16).doc
        .fillColor(COLORS.primary)
        .text(title, PAGE.margin, PAGE.margin + 12);

    if (subtitle) {
      this.setFont('Regular', 9).doc
          .fillColor(COLORS.muted)
          .text(subtitle, PAGE.margin, PAGE.margin + 32);
    }

    doc.moveDown(3);
  }

  /** Sayfa altbilgisi (sayfa no + tarih) */
  protected drawPageFooter(generatedAt: Date): void {
    const { doc } = this;
    const y = PAGE.height - PAGE.margin - 20;

    doc.rect(PAGE.margin, y, PAGE.contentWidth, 0.5)
       .fill(COLORS.border);

    this.setFont('Regular', 7).doc
        .fillColor(COLORS.muted)
        .text(
          `Oluşturulma: ${formatDate(generatedAt)} — Enkap ERP`,
          PAGE.margin,
          y + 5,
          { align: 'left', width: PAGE.contentWidth / 2 },
        )
        .text(
          `Sayfa ${(doc as unknown as { _pageBuffer: unknown[] })._pageBuffer?.length ?? 1}`,
          PAGE.margin + PAGE.contentWidth / 2,
          y + 5,
          { align: 'right', width: PAGE.contentWidth / 2 },
        );
  }

  /** İki sütunlu bilgi bloğu (etiket: değer çiftleri) */
  protected drawInfoBlock(
    pairs: Array<[string, string]>,
    x: number,
    startY: number,
    width = PAGE.contentWidth / 2 - 10,
  ): number {
    let y = startY;
    for (const [label, value] of pairs) {
      this.setFont('Regular', 8).doc
          .fillColor(COLORS.muted)
          .text(label, x, y, { width, continued: false });

      this.setFont('Bold', 8).doc
          .fillColor(COLORS.text)
          .text(value, x, y + 10, { width });

      y += 24;
    }
    return y;
  }

  /**
   * Genel tablo çizici.
   *
   * @param headers — Sütun başlıkları ve genişlikleri
   * @param rows    — Satır verisi (string dizisi, headers ile aynı uzunlukta)
   * @param startY  — Tablonun başladığı Y koordinatı
   */
  protected drawTable(
    headers: Array<{ label: string; width: number; align?: 'left' | 'right' | 'center' }>,
    rows: string[][],
    startY: number,
    rowHeight = 18,
    options: { alternateRows?: boolean; headerBg?: string; headerTextColor?: string } = {},
  ): number {
    const { doc } = this;
    const { alternateRows = true, headerBg = COLORS.tableHead, headerTextColor = COLORS.text } = options;
    let y = startY;

    // Başlık satırı
    doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight + 2)
       .fill(headerBg);

    let x = PAGE.margin + 4;
    for (const col of headers) {
      this.setFont('Bold', 8).doc
          .fillColor(headerTextColor)
          .text(col.label, x, y + 5, {
            width: col.width - 8,
            align: col.align ?? 'left',
            lineBreak: false,
          });
      x += col.width;
    }
    y += rowHeight + 2;

    // Veri satırları
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;

      // Sayfa taşması kontrolü
      if (y + rowHeight > PAGE.height - PAGE.margin - 30) {
        doc.addPage();
        y = PAGE.margin + 10;
      }

      if (alternateRows && i % 2 === 1) {
        doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight)
           .fill('#f9fafb');
      }

      // Alt kenarlık
      doc.rect(PAGE.margin, y + rowHeight - 0.5, PAGE.contentWidth, 0.5)
         .fill(COLORS.border);

      x = PAGE.margin + 4;
      for (let j = 0; j < headers.length; j++) {
        const col = headers[j]!;
        this.setFont('Regular', 8).doc
            .fillColor(COLORS.text)
            .text(row[j] ?? '', x, y + 5, {
              width: col.width - 8,
              align: col.align ?? 'left',
              lineBreak: false,
            });
        x += col.width;
      }
      y += rowHeight;
    }

    return y;
  }

  /** Toplam satırı (sağ hizalı, kalın) */
  protected drawTotalRow(
    label: string,
    amount: string,
    y: number,
    options: { bold?: boolean; color?: string; bgColor?: string } = {},
  ): number {
    const { doc } = this;
    const { bold = false, color = COLORS.text, bgColor } = options;

    if (bgColor) {
      doc.rect(PAGE.margin, y, PAGE.contentWidth, 20).fill(bgColor);
    }

    this.setFont(bold ? 'Bold' : 'Regular', 9).doc
        .fillColor(COLORS.muted)
        .text(label, PAGE.margin + 4, y + 5, {
          width: PAGE.contentWidth - 120,
          align: 'right',
        });

    this.setFont('Bold', 9).doc
        .fillColor(color)
        .text(amount, PAGE.margin + PAGE.contentWidth - 115, y + 5, {
          width: 110,
          align: 'right',
        });

    return y + 22;
  }
}

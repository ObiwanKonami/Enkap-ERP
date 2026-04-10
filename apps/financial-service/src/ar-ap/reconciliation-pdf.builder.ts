import { PdfBase, PAGE, COLORS, formatKurus } from '@enkap/reporting';
import type { ReconciliationStatement } from './reconciliation.service';

/**
 * Cari Hesap Mutabakat Belgesi PDF üreticisi.
 *
 * Türkiye muhasebe pratiğinde kullanılan standart format:
 *  - Başlık: Cari Hesap Mutabakat Belgesi
 *  - Cari bilgileri (ad, tür, tarih)
 *  - Fatura hareketleri tablosu (tarih, fatura no, borç, alacak, durum)
 *  - Alt özet: toplam alacak, toplam borç, net bakiye
 */
export class ReconciliationPdfBuilder extends PdfBase {
  constructor(private readonly statement: ReconciliationStatement) {
    super();
  }

  protected async build(): Promise<void> {
    const { doc, statement } = this;

    this.drawPageHeader(
      'Cari Hesap Mutabakat Belgesi',
      `Oluşturma Tarihi: ${statement.generatedAt}`,
    );

    // ── Cari bilgisi ──────────────────────────────────────────────────────
    const typeLabel = statement.contactType === 'customer' ? 'Müşteri' : 'Tedarikçi';

    this.drawInfoBlock(
      [
        ['Cari Türü',    typeLabel],
        ['Cari Adı',     statement.contactName],
        ['Belge Tarihi', statement.generatedAt],
      ],
      PAGE.margin,
      doc.y,
    );

    doc.moveDown(1);

    // ── Hareketler tablosu ────────────────────────────────────────────────
    const colFatura  = 120;
    const colTarih   = 68;
    const colVade    = 68;
    const colBorc    = 82;
    const colAlacak  = 82;
    const colDurum   = PAGE.contentWidth - colFatura - colTarih - colVade - colBorc - colAlacak;

    const headers = [
      { label: 'Fatura No',  width: colFatura },
      { label: 'Tarih',      width: colTarih,  align: 'center' as const },
      { label: 'Vade',       width: colVade,   align: 'center' as const },
      { label: 'Borç (₺)',   width: colBorc,   align: 'right'  as const },
      { label: 'Alacak (₺)', width: colAlacak, align: 'right'  as const },
      { label: 'Durum',      width: colDurum },
    ];

    const rows = statement.lines.map((line) => [
      line.invoiceNo,
      line.invoiceDate,
      line.dueDate ?? '—',
      line.direction === 'IN'  ? formatKurus(line.amount) : '',
      line.direction === 'OUT' ? formatKurus(line.amount) : '',
      this.statusLabel(line.status),
    ]);

    let y = this.drawTable(headers, rows, doc.y);

    // ── Özet ─────────────────────────────────────────────────────────────
    y += 8;

    y = this.drawTotalRow(
      'Toplam Alacak',
      formatKurus(statement.totalReceivable),
      y,
    );

    y = this.drawTotalRow(
      'Toplam Borç',
      formatKurus(statement.totalPayable),
      y,
    );

    const netColor = statement.netBalance >= 0 ? COLORS.success : COLORS.danger;
    const netLabel = statement.netBalance >= 0 ? 'Net Alacak (Bakiye)' : 'Net Borç (Bakiye)';

    this.drawTotalRow(
      netLabel,
      formatKurus(Math.abs(statement.netBalance)),
      y,
      { bold: true, color: netColor, bgColor: COLORS.tableHead },
    );

    // ── İmza alanı ────────────────────────────────────────────────────────
    const sigY = PAGE.height - PAGE.margin - 100;
    doc.rect(PAGE.margin, sigY, PAGE.contentWidth, 0.5).fill(COLORS.border);

    this.setFont('Regular', 8).doc
        .fillColor(COLORS.muted)
        .text(
          'Yukarıdaki cari hesap mutabakatını kabul ediyorum.',
          PAGE.margin,
          sigY + 10,
        );

    this.setFont('Regular', 8).doc
        .fillColor(COLORS.muted)
        .text('Ad Soyad / İmza / Kaşe:', PAGE.margin, sigY + 35)
        .text('Tarih:', PAGE.margin + PAGE.contentWidth / 2, sigY + 35);

    // İmza çizgisi
    doc.rect(PAGE.margin, sigY + 70, PAGE.contentWidth / 2 - 20, 0.5)
       .fill(COLORS.border);
    doc.rect(PAGE.margin + PAGE.contentWidth / 2, sigY + 70, PAGE.contentWidth / 2 - 20, 0.5)
       .fill(COLORS.border);

    this.drawPageFooter(new Date());
  }

  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      DRAFT:        'Taslak',
      PENDING_GIB:  'GİB Kuyruğu',
      SENT_GIB:     'Gönderildi',
      ACCEPTED_GIB: 'Onaylandı',
      REJECTED_GIB: 'Reddedildi',
      CANCELLED:    'İptal',
    };
    return map[status] ?? status;
  }
}

import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { InvoiceReportData, MizanReportData, StockReportData } from '../shared/types';
import { formatDate, formatKurus, formatKurusAmount, formatNumber } from '../shared/format';

/** Enkap Excel tema renkleri */
const THEME = {
  headerFill:  '1a56db',  // Enkap mavi
  headerFont:  'FFFFFF',
  altRow:      'F3F4F6',
  border:      'E5E7EB',
  danger:      'DC2626',
  warning:     'D97706',
  success:     '059669',
  totalBg:     'EFF6FF',
  totalFont:   '1a56db',
} as const;

/**
 * Excel Rapor Üretici Servisi.
 *
 * ExcelJS stream API kullanır — büyük raporlar için bellek dostu.
 * Tüm metodlar Buffer döndürür (HTTP response'a gömülür).
 *
 * Dosya formatı: .xlsx (Open XML — muhasebe yazılımı uyumlu)
 * Türkçe karakter: UTF-8 (ExcelJS native destekler)
 */
@Injectable()
export class ExcelBuilderService {

  // ─── Fatura Listesi ────────────────────────────────────────────────────────

  async buildFaturaExcel(invoices: InvoiceReportData[]): Promise<Buffer> {
    const wb = this.createWorkbook('Fatura Raporu');
    const ws = wb.addWorksheet('Faturalar', { views: [{ state: 'frozen', ySplit: 1 }] });

    // Sütun tanımları
    ws.columns = [
      { header: 'Fatura No',    key: 'no',          width: 18 },
      { header: 'Tür',          key: 'type',         width: 14 },
      { header: 'Yön',          key: 'direction',    width: 8  },
      { header: 'Tarih',        key: 'date',         width: 14 },
      { header: 'Vade Tarihi',  key: 'due',          width: 14 },
      { header: 'Karşı Taraf',  key: 'party',        width: 30 },
      { header: 'VKN/TCKN',     key: 'taxId',        width: 14 },
      { header: 'Ara Toplam ₺', key: 'subtotal',     width: 16 },
      { header: 'KDV Toplam ₺', key: 'kdvTotal',     width: 16 },
      { header: 'Genel Toplam ₺',key: 'total',       width: 16 },
      { header: 'Para Birimi',  key: 'currency',     width: 10 },
      { header: 'GİB UUID',     key: 'gibUuid',      width: 38 },
    ];

    this.styleHeaderRow(ws);

    for (const inv of invoices) {
      const kdvTotal = inv.kdvBreakdown.reduce((s, k) => s + k.amountKurus, 0);
      ws.addRow({
        no:        inv.invoiceNumber,
        type:      inv.invoiceType,
        direction: inv.direction === 'OUT' ? 'Satış' : 'Alış',
        date:      formatDate(inv.issueDate),
        due:       inv.dueDate ? formatDate(inv.dueDate) : '',
        party:     inv.partyName,
        taxId:     inv.partyVkn ?? inv.partyTckn ?? '',
        subtotal:  formatKurusAmount(inv.subtotalKurus),
        kdvTotal:  formatKurusAmount(kdvTotal),
        total:     formatKurusAmount(inv.totalKurus),
        currency:  inv.currency,
        gibUuid:   inv.gibUuid ?? '',
      });
    }

    this.applyAlternateRows(ws, invoices.length);
    this.addTotalRow(ws, 'total', 'Genel Toplam', invoices.length);

    return this.toBuffer(wb);
  }

  // ─── Mizan Excel ───────────────────────────────────────────────────────────

  async buildMizanExcel(data: MizanReportData): Promise<Buffer> {
    const wb = this.createWorkbook('Mizan Raporu');

    // ── Sayfa 1: Mizan Detayı ──────────────────────────────────────────────
    const wsDetail = wb.addWorksheet('Mizan Detayı', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    wsDetail.columns = [
      { header: 'Hesap Kodu',   key: 'code',         width: 14 },
      { header: 'Hesap Adı',    key: 'name',         width: 40 },
      { header: 'Tür',          key: 'type',         width: 12 },
      { header: 'Normal Bakiye',key: 'normalBalance', width: 14 },
      { header: 'Borç ₺',       key: 'debit',        width: 18 },
      { header: 'Alacak ₺',     key: 'credit',       width: 18 },
      { header: 'Net Bakiye ₺', key: 'net',          width: 18 },
      { header: 'Bakiye Yönü',  key: 'direction',    width: 12 },
    ];

    this.styleHeaderRow(wsDetail);

    const TYPE_TR: Record<string, string> = {
      ASSET: 'Varlık', LIABILITY: 'Kaynak', EQUITY: 'Özkaynak',
      REVENUE: 'Gelir', EXPENSE: 'Gider', MEMORANDUM: 'Nazım',
    };

    for (const row of data.rows) {
      const netAbs  = Math.abs(row.netBalanceKurus);
      const netDir  = row.netBalanceKurus >= 0 ? 'Borç' : 'Alacak';
      const wsRow = wsDetail.addRow({
        code:          row.code,
        name:          row.name,
        type:          TYPE_TR[row.type] ?? row.type,
        normalBalance: row.normalBalance === 'DEBIT' ? 'Borç' : 'Alacak',
        debit:         row.totalDebitKurus  / 100,
        credit:        row.totalCreditKurus / 100,
        net:           netAbs / 100,
        direction:     netDir,
      });

      // Kritik durum: normal bakiye yönüyle uyumsuz hesap
      const expected = row.normalBalance === 'DEBIT' ? 'Borç' : 'Alacak';
      if (netAbs > 0 && netDir !== expected) {
        wsRow.getCell('net').fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: 'FFFEF2F2' },
        };
        wsRow.getCell('net').font = { color: { argb: 'FFDC2626' }, bold: true };
      }
    }

    // Sayı formatı
    ['debit', 'credit', 'net'].forEach((col) => {
      wsDetail.getColumn(col).numFmt = '#,##0.00\\ ₺';
    });

    this.applyAlternateRows(wsDetail, data.rows.length);

    // Toplam satırı
    const totalRow = wsDetail.addRow({
      code:   '',
      name:   'GENEL TOPLAM',
      debit:  data.totalDebitKurus  / 100,
      credit: data.totalCreditKurus / 100,
      net:    Math.abs(data.totalDebitKurus - data.totalCreditKurus) / 100,
      direction: data.isBalanced ? '✓ DENGELİ' : '✗ DENGESİZ',
    });
    this.styleTotalRow(totalRow);

    const statusCell = totalRow.getCell('direction');
    statusCell.font = {
      bold: true,
      color: { argb: data.isBalanced ? `FF${THEME.success}` : `FF${THEME.danger}` },
    };

    // ── Sayfa 2: Özet (KDV türü bazlı) ────────────────────────────────────
    const wsSummary = wb.addWorksheet('Özet');
    wsSummary.addRow(['Mizan Özeti']);
    wsSummary.addRow(['Şirket',    data.companyName]);
    wsSummary.addRow(['Dönem',     `${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`]);
    wsSummary.addRow(['Durum',     data.isBalanced ? 'DENGELİ' : 'DENGESİZ']);
    wsSummary.addRow(['Oluşturulma', formatDate(data.generatedAt)]);
    wsSummary.addRow([]);
    wsSummary.addRow(['Borç Toplam',   data.totalDebitKurus  / 100]);
    wsSummary.addRow(['Alacak Toplam', data.totalCreditKurus / 100]);
    wsSummary.addRow(['Fark',          Math.abs(data.totalDebitKurus - data.totalCreditKurus) / 100]);

    return this.toBuffer(wb);
  }

  // ─── Stok Excel ────────────────────────────────────────────────────────────

  async buildStokExcel(data: StockReportData): Promise<Buffer> {
    const wb = this.createWorkbook('Stok Raporu');
    const ws = wb.addWorksheet('Stok Durumu', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = [
      { header: 'SKU',             key: 'sku',         width: 16 },
      { header: 'Ürün Adı',        key: 'name',        width: 36 },
      { header: 'Kategori',        key: 'category',    width: 18 },
      { header: 'Mevcut Miktar',   key: 'quantity',    width: 16 },
      { header: 'Birim',           key: 'unit',        width: 10 },
      { header: 'Min. Stok',       key: 'minQty',      width: 12 },
      { header: 'Kritik Mi?',      key: 'critical',    width: 12 },
      { header: 'Ort. Maliyet ₺',  key: 'avgCost',     width: 16 },
      { header: 'Toplam Değer ₺',  key: 'totalValue',  width: 18 },
    ];

    this.styleHeaderRow(ws);

    // Kritik ürünler üstte
    const sorted = [...data.products].sort((a, b) => {
      if (a.isCritical && !b.isCritical) return -1;
      if (!a.isCritical && b.isCritical) return  1;
      return b.totalValueKurus - a.totalValueKurus;
    });

    for (const p of sorted) {
      const row = ws.addRow({
        sku:        p.sku,
        name:       p.name,
        category:   p.category ?? '',
        quantity:   p.quantity,
        unit:       p.unit,
        minQty:     p.minStockQty,
        critical:   p.isCritical ? 'EVET ⚠' : 'Hayır',
        avgCost:    p.avgCostKurus   / 100,
        totalValue: p.totalValueKurus / 100,
      });

      if (p.isCritical) {
        ['sku', 'name', 'quantity', 'critical'].forEach((col) => {
          row.getCell(col).font = { color: { argb: `FF${THEME.danger}` }, bold: true };
        });
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
      }
    }

    ['quantity', 'minQty'].forEach((c) => {
      ws.getColumn(c).numFmt = '#,##0.00';
    });
    ['avgCost', 'totalValue'].forEach((c) => {
      ws.getColumn(c).numFmt = '#,##0.00\\ ₺';
    });

    this.applyAlternateRows(ws, sorted.length, sorted.map((p) => p.isCritical));

    const totalRow = ws.addRow({
      sku:        '',
      name:       'TOPLAM',
      totalValue: data.totalValueKurus / 100,
    });
    this.styleTotalRow(totalRow);

    return this.toBuffer(wb);
  }

  // ─── Yardımcı Metodlar ─────────────────────────────────────────────────────

  private createWorkbook(title: string): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Enkap ERP';
    wb.modified = new Date();
    wb.title    = title;
    return wb;
  }

  private styleHeaderRow(ws: ExcelJS.Worksheet): void {
    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font    = { bold: true, color: { argb: `FF${THEME.headerFont}` }, size: 10 };
      cell.fill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${THEME.headerFill}` } };
      cell.border  = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    });
  }

  private applyAlternateRows(
    ws: ExcelJS.Worksheet,
    rowCount: number,
    skipMask?: boolean[],  // true olan satırlar zaten renkli — atlıyoruz
  ): void {
    for (let i = 2; i <= rowCount + 1; i++) {
      if (skipMask?.[i - 2]) continue;  // Kritik satırlar kendi renginde
      if (i % 2 === 0) {
        ws.getRow(i).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${THEME.altRow}` },
        };
      }
    }
  }

  private addTotalRow(
    ws: ExcelJS.Worksheet,
    sumColumn: string,
    label: string,
    dataRowCount: number,
  ): void {
    const totalRow = ws.addRow({});
    totalRow.getCell(1).value = label;
    totalRow.getCell(sumColumn).value = {
      formula: `SUM(${sumColumn}2:${sumColumn}${dataRowCount + 1})`,
    };
    this.styleTotalRow(totalRow);
  }

  private styleTotalRow(row: ExcelJS.Row): void {
    row.height = 20;
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { bold: true, color: { argb: `FF${THEME.totalFont}` } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FFEFF6FF` } };
      cell.border = {
        top:    { style: 'thin',   color: { argb: `FF${THEME.headerFill}` } },
        bottom: { style: 'medium', color: { argb: `FF${THEME.headerFill}` } },
      };
    });
  }

  private async toBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
    const arrayBuffer = await wb.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}

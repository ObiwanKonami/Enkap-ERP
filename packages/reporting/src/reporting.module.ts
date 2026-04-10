import { Module } from '@nestjs/common';
import { InvoiceTemplate } from './pdf/templates/invoice.template';
import { MizanTemplate } from './pdf/templates/mizan.template';
import { StockReportTemplate } from './pdf/templates/stock-report.template';
import { ExcelBuilderService } from './excel/excel-builder.service';
import { QrGeneratorService } from './qr/qr-generator.service';

/**
 * Raporlama Modülü.
 *
 * Kullanım — finansal servis veya stok servisine import edilir:
 *   @Module({ imports: [ReportingModule] })
 *
 * Sağlanan servisler:
 *   - InvoiceTemplate     — Fatura PDF
 *   - MizanTemplate       — Mizan PDF
 *   - StockReportTemplate — Stok Raporu PDF
 *   - ExcelBuilderService — Tüm Excel raporları
 *   - QrGeneratorService  — GİB standartlarında e-Belge QR kodu
 */
@Module({
  providers: [
    InvoiceTemplate,
    MizanTemplate,
    StockReportTemplate,
    ExcelBuilderService,
    QrGeneratorService,
  ],
  exports: [
    InvoiceTemplate,
    MizanTemplate,
    StockReportTemplate,
    ExcelBuilderService,
    QrGeneratorService,
  ],
})
export class ReportingModule {}

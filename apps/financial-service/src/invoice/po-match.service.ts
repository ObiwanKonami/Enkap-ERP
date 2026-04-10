import { Injectable, Logger } from '@nestjs/common';
import { TenantDataSourceManager } from '@enkap/database';

/**
 * PO eşleştirme durumları:
 *  MATCHED   → PO bulundu, tutar ve satıcı uyuşuyor, GRN mevcut
 *  PARTIAL   → PO bulundu ama kısmi eşleşme (tutar farkı ≤ %5 tolerans)
 *  MISMATCH  → PO bulundu ama ciddi tutar farkı
 *  UNMATCHED → PO bulunamadı
 */
export type PoMatchStatus = 'MATCHED' | 'PARTIAL' | 'MISMATCH' | 'UNMATCHED';

export interface PoMatchResult {
  purchaseOrderId: string | null;
  poNumber:        string | null;
  matchStatus:     PoMatchStatus;
  grnExists:       boolean;
  amountDiffPct:   number | null;
}

/**
 * PO-Fatura 3-Way Match Servisi
 *
 * Gelen (IN) fatura onaylandığında veya GİB'den geldiğinde otomatik eşleştirme yapar.
 *
 * 3-Way Match:
 *  1. Purchase Order (PO) — satın alma siparişi
 *  2. Goods Receipt Note (GRN) — mal kabul
 *  3. Invoice — tedarikçi faturası
 *
 * Eşleştirme stratejisi:
 *  - vendorId (counterpartyId) ile PO'ları filtrele
 *  - Toplam tutar karşılaştır (±%5 tolerans)
 *  - GRN varlığını doğrula
 *  - Sonucu invoices.purchase_order_id + po_match_status olarak yaz
 */
@Injectable()
export class PoMatchService {
  private readonly logger = new Logger(PoMatchService.name);

  /** Tutar farkı yüzdesi — bu eşik altında MATCHED, üstünde MISMATCH */
  private static readonly TOLERANCE_PCT = 5;

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Gelen fatura için PO eşleştirmesi yap.
   * Sadece IN yönlü faturalar için çağrılır.
   */
  async matchInvoiceToPo(
    invoiceId: string,
    tenantId: string,
  ): Promise<PoMatchResult> {
    const ds = await this.dsManager.getDataSource(tenantId);

    // Fatura bilgilerini al
    const invoiceRows = await ds.query<Array<{
      id: string;
      counterparty_id: string | null;
      vendor_id: string | null;
      total: number;
      direction: string;
    }>>(
      `SELECT id, counterparty_id, vendor_id, total, direction
       FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId],
    );

    const invoice = invoiceRows[0];
    if (!invoice || invoice.direction !== 'IN') {
      return { purchaseOrderId: null, poNumber: null, matchStatus: 'UNMATCHED', grnExists: false, amountDiffPct: null };
    }

    const vendorId = invoice.counterparty_id ?? invoice.vendor_id;
    if (!vendorId) {
      this.logger.debug(`PO eşleştirme: vendorId yok, fatura=${invoiceId}`);
      return { purchaseOrderId: null, poNumber: null, matchStatus: 'UNMATCHED', grnExists: false, amountDiffPct: null };
    }

    // Aynı tedarikçinin bekleyen (sent/partial/received) PO'larını bul
    // total_kurus → kuruş, invoice.total → decimal (TL) — dönüşüm yapılır
    const poRows = await ds.query<Array<{
      id: string;
      order_number: string;
      total_kurus: number;
      status: string;
    }>>(
      `SELECT id, order_number, total_kurus, status
       FROM purchase_orders
       WHERE vendor_id = $1 AND tenant_id = $2
         AND status IN ('sent', 'partial', 'received')
       ORDER BY order_date DESC`,
      [vendorId, tenantId],
    );

    if (!poRows.length) {
      await this.updateInvoiceMatch(ds, invoiceId, tenantId, null, 'UNMATCHED');
      return { purchaseOrderId: null, poNumber: null, matchStatus: 'UNMATCHED', grnExists: false, amountDiffPct: null };
    }

    // Fatura toplam TL → kuruş (PO total_kurus ile karşılaştırma için)
    const invoiceTotalKurus = Math.round(Number(invoice.total) * 100);

    // En yakın tutar eşleşmesini bul
    let bestMatch: { id: string; orderNumber: string; diffPct: number } | null = null;

    for (const po of poRows) {
      const poTotal = Number(po.total_kurus);
      if (poTotal === 0) continue;

      const diffPct = Math.abs((invoiceTotalKurus - poTotal) / poTotal) * 100;

      if (!bestMatch || diffPct < bestMatch.diffPct) {
        bestMatch = { id: po.id, orderNumber: po.order_number, diffPct };
      }
    }

    if (!bestMatch) {
      await this.updateInvoiceMatch(ds, invoiceId, tenantId, null, 'UNMATCHED');
      return { purchaseOrderId: null, poNumber: null, matchStatus: 'UNMATCHED', grnExists: false, amountDiffPct: null };
    }

    // GRN varlığını kontrol et
    const grnRows = await ds.query<Array<{ id: string }>>(
      `SELECT id FROM goods_receipts
       WHERE purchase_order_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [bestMatch.id, tenantId],
    );
    const grnExists = grnRows.length > 0;

    // Match status belirle
    let matchStatus: PoMatchStatus;
    if (bestMatch.diffPct <= PoMatchService.TOLERANCE_PCT && grnExists) {
      matchStatus = bestMatch.diffPct === 0 ? 'MATCHED' : 'PARTIAL';
    } else if (bestMatch.diffPct <= PoMatchService.TOLERANCE_PCT) {
      matchStatus = 'PARTIAL'; // Tutar uyuyor ama GRN yok
    } else {
      matchStatus = 'MISMATCH';
    }

    // Faturayı güncelle
    await this.updateInvoiceMatch(ds, invoiceId, tenantId, bestMatch.id, matchStatus);

    this.logger.log(
      `PO eşleştirme: fatura=${invoiceId} → PO=${bestMatch.orderNumber} ` +
      `durum=${matchStatus} fark=%${bestMatch.diffPct.toFixed(1)} grn=${grnExists}`,
    );

    return {
      purchaseOrderId: bestMatch.id,
      poNumber:        bestMatch.orderNumber,
      matchStatus,
      grnExists,
      amountDiffPct:   Math.round(bestMatch.diffPct * 10) / 10,
    };
  }

  private async updateInvoiceMatch(
    ds: import('typeorm').DataSource,
    invoiceId: string,
    tenantId: string,
    purchaseOrderId: string | null,
    matchStatus: PoMatchStatus,
  ): Promise<void> {
    await ds.query(
      `UPDATE invoices
       SET purchase_order_id = $1, po_match_status = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [purchaseOrderId, matchStatus, invoiceId, tenantId],
    );
  }
}

/**
 * Finansal modüle ait paylaşılan tip tanımları.
 * Tüm servisler bu tipleri kullanır.
 */
export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';
export type InvoiceType = 'E_FATURA' | 'E_ARSIV' | 'PURCHASE' | 'PROFORMA';
export type InvoiceDirection = 'OUT' | 'IN';
export type InvoiceStatus = 'DRAFT' | 'APPROVED' | 'PENDING_GIB' | 'SENT_GIB' | 'ACCEPTED_GIB' | 'REJECTED_GIB' | 'CANCELLED';
/** Geçerli KDV oranları (2023 sonrası Türkiye) */
export type KdvRate = 0 | 1 | 10 | 20;
/** Tevkifat oranı — pay/payda formatı */
export interface TevkifatRatio {
    readonly numerator: number;
    readonly denominator: number;
}
export interface InvoiceSummary {
    readonly invoiceId: string;
    readonly invoiceNumber: string;
    readonly status: InvoiceStatus;
    readonly total: number;
    readonly kdvTotal: number;
    readonly currency: Currency;
    readonly issueDate: string;
}

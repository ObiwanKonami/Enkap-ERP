/**
 * Finansal modüle ait paylaşılan tip tanımları.
 * Tüm servisler bu tipleri kullanır.
 */

export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP';

export type InvoiceType =
  | 'E_FATURA'   // GİB'e gönderilen B2B fatura
  | 'E_ARSIV'    // GİB'e gönderilen B2C fatura
  | 'PURCHASE'   // Alış faturası (gelen)
  | 'PROFORMA';  // Pro-forma fatura

export type InvoiceDirection = 'OUT' | 'IN';

export type InvoiceStatus =
  | 'DRAFT'              // Taslak
  | 'APPROVED'           // Onaylandı — GİB'e gönderilebilir
  | 'PENDING_GIB'        // GİB'e gönderilmeyi bekliyor
  | 'SENT_GIB'           // GİB'e gönderildi
  | 'ACCEPTED_GIB'       // GİB tarafından kabul edildi
  | 'REJECTED_GIB'       // GİB tarafından reddedildi
  | 'ARCHIVE_REPORTED'   // e-Arşiv'e raporlandı
  | 'CANCELLED';         // İptal edildi

/** Geçerli KDV oranları (2023 sonrası Türkiye) */
export type KdvRate = 0 | 1 | 10 | 20;

/** Tevkifat oranı — pay/payda formatı */
export interface TevkifatRatio {
  readonly numerator: number;   // 2, 3, 5, 7, 9
  readonly denominator: number; // 10
}

export interface InvoiceSummary {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly status: InvoiceStatus;
  readonly total: number;
  readonly kdvTotal: number;
  readonly currency: Currency;
  readonly issueDate: string; // dd.MM.yyyy
}

/**
 * Fatura satırı — tek doğruluk kaynağı.
 * Backend DTO: unitPrice (TL), kdvRate, discountPct, lineTotal (TL).
 * Frontend bu alanları doğrudan kullanır.
 */
export interface InvoiceLine {
  id:           string;
  description:  string;
  quantity:     number;
  unit:         string;
  unitPrice:    number;      // TL cinsinden (backend DTO ile aynı)
  kdvRate:      KdvRate;
  discountPct:  number;      // default 0
  lineTotal:    number;      // TL cinsinden
  productId?:   string;
}

/**
 * Fatura ana kaydı — tek doğruluk kaynağı.
 * Backend entity alanlarıyla tam uyumlu.
 */
export interface Invoice {
  id:              string;
  invoiceNumber:   string;
  invoiceType:     InvoiceType;
  direction:       InvoiceDirection;
  status:          InvoiceStatus;
  /** GİB zorunlu UUID — e-Fatura/e-Arşiv sorgulama için */
  gibUuid?:        string;
  /** crm_contacts.id — müşteri veya tedarikçi CRM referansı */
  counterpartyId?: string;
  customerName?:   string;
  vendorName?:     string;
  issueDate:       string;   // ISO 8601
  /** Vade tarihi — AR/AP hesaplamalarında kullanılır */
  dueDate?:        string;   // ISO 8601
  total:           number;
  subtotal:        number;
  vatTotal:        number;
  currency:        Currency;
  lines?:          InvoiceLine[];
}

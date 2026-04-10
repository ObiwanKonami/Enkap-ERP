/**
 * Raporlama paketi veri tipleri.
 * Servisler domain entity'lerini bu tiplere map ederek raporlara besler.
 */

// ─── Fatura PDF Tipleri ───────────────────────────────────────────────────────

export interface InvoiceLineData {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPriceKurus: number;
  discountPct: number;
  kdvRate: number;
  kdvAmountKurus: number;
  lineTotalKurus: number;
}

export interface KdvBreakdown {
  rate: number;
  amountKurus: number;
}

export interface InvoiceReportData {
  // Şirket (satıcı) bilgisi
  companyName:      string;
  companyVkn:       string;
  companyTaxOffice?: string;
  companyMersisNo?:  string;
  companyAddress:   string;
  companyPhone?:    string;
  companyEmail?:    string;

  // Fatura meta
  invoiceNumber: string;
  gibUuid?: string;
  invoiceType: string;   // 'E_FATURA' | 'E_ARSIV' | ...
  direction: 'OUT' | 'IN';
  issueDate: Date;
  dueDate?: Date;

  // Karşı taraf (alıcı)
  partyName:        string;
  partyVkn?:        string;
  partyTckn?:       string;
  partyTaxOffice?:  string;
  partyMersisNo?:   string;
  partyAddress?:    string;

  // Kalemler
  lines: InvoiceLineData[];

  // Toplamlar (kuruş cinsinden)
  subtotalKurus: number;
  kdvBreakdown: KdvBreakdown[];
  totalKurus: number;
  currency: string;
  exchangeRate?: number;

  notes?: string;
  bankAccount?: string;    // IBAN
  status?: string;         // InvoiceStatus — damga/badge için
}

// ─── Mizan PDF/Excel Tipleri ──────────────────────────────────────────────────

export interface MizanRowData {
  code: string;
  name: string;
  type: string;
  totalDebitKurus: number;
  totalCreditKurus: number;
  netBalanceKurus: number;
  normalBalance: 'DEBIT' | 'CREDIT';
}

export interface MizanReportData {
  companyName: string;
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  rows: MizanRowData[];
  totalDebitKurus: number;
  totalCreditKurus: number;
  isBalanced: boolean;
  generatedAt: Date;
}

// ─── İrsaliye PDF Tipleri ─────────────────────────────────────────────────────

export interface WaybillLineData {
  lineNumber:  number;
  productName: string;
  sku?:        string;
  quantity:    number;
  unitCode:    string;
  /** Kaynak depo adı (çözümlenmiş) */
  warehouseName?:       string;
  targetWarehouseName?: string;
  lotNumber?:           string;
  serialNumber?:        string;
}

export interface WaybillReportData {
  waybillNumber:   string;
  type:            'SATIS' | 'ALIS' | 'TRANSFER' | 'IADE';
  shipDate:        Date;
  deliveryDate?:   Date;

  // Gönderici
  senderName:      string;
  senderVkn?:      string;
  senderAddress?:  string;

  // Alıcı
  receiverName:    string;
  receiverVknTckn?: string;
  receiverAddress?: string;

  // Taşıma
  vehiclePlate?:   string;
  driverName?:     string;
  carrierName?:    string;
  trackingNumber?: string;

  // GİB
  gibUuid?:        string;
  gibStatus?:      string;

  // Referans
  refNumber?: string;
  refType?:   string;

  lines:       WaybillLineData[];
  notes?:      string;
  generatedAt: Date;
}

// ─── Stok Raporu PDF/Excel Tipleri ───────────────────────────────────────────

export interface StockProductRow {
  sku: string;
  name: string;
  category?: string;
  quantity: number;
  unit: string;
  avgCostKurus: number;
  totalValueKurus: number;
  minStockQty: number;
  isCritical: boolean;
}

export interface StockReportData {
  companyName: string;
  tenantId: string;
  reportDate: Date;
  warehouseName?: string;
  products: StockProductRow[];
  totalValueKurus: number;
  criticalCount: number;
  generatedAt: Date;
}

import { Injectable, Logger } from '@nestjs/common';

/** UAE Peppol BIS 3.0 fatura satırı */
export interface UaeInvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPriceAed: bigint;  // AED fils
  netAmountAed: bigint;  // AED fils
  vatRate: 5 | 0 | 'exempt';
  vatAmountAed: bigint;  // AED fils
}

/** UAE Peppol BIS 3.0 fatura verisi */
export interface UaeInvoiceData {
  id: string;
  date: string;            // yyyy-MM-dd
  dueDate?: string;
  supplierName: string;
  supplierTrn: string;     // 15 haneli TRN
  customerName: string;
  customerTrn?: string;    // B2B ise zorunlu
  lines: UaeInvoiceLine[];
  vatSummaryAed: {
    standardRatedNet: bigint;
    standardVatAmount: bigint;
    zeroRatedNet: bigint;
    exemptNet: bigint;
  };
  totalExclVatAed: bigint;
  vatTotalAed: bigint;
  totalInclVatAed: bigint;
  currencyCode?: string;   // varsayılan: AED
  note?: string;
}

/**
 * UAE Peppol BIS 3.0 XML Üretici.
 *
 * UAE FTA elektronik fatura standardı:
 *  - Peppol BIS Billing 3.0 profili
 *  - UBL 2.1 XML formatı
 *  - AED para birimi
 *  - Tedarikçi ve müşteri TRN'leri zorunlu (B2B)
 *
 * Referans: UAE FTA e-Invoice Implementation Guide (2023)
 * Namespace'ler: OASIS UBL 2.1 standart namespace'leri kullanılır.
 */
@Injectable()
export class PeppolBuilderService {
  private readonly logger = new Logger(PeppolBuilderService.name);

  /**
   * Peppol BIS 3.0 uyumlu UBL 2.1 XML üretir.
   *
   * @param invoice  Fatura verisi
   * @returns        UTF-8 XML string
   */
  buildInvoiceXml(invoice: UaeInvoiceData): string {
    this.logger.debug(`Peppol XML üretiliyor: fatura=${invoice.id}`);

    const currency = invoice.currencyCode ?? 'AED';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${this.escape(invoice.id)}</cbc:ID>
  <cbc:IssueDate>${invoice.date}</cbc:IssueDate>
  ${invoice.dueDate ? `<cbc:DueDate>${invoice.dueDate}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${invoice.note ? `<cbc:Note>${this.escape(invoice.note)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${currency}</cbc:TaxCurrencyCode>

  <!-- Tedarikçi (Supplier) -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0088">${this.escape(invoice.supplierTrn)}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${this.escape(invoice.supplierName)}</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escape(invoice.supplierTrn)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escape(invoice.supplierName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Müşteri (Customer) -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${this.escape(invoice.customerName)}</cbc:Name>
      </cac:PartyName>
      ${invoice.customerTrn ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escape(invoice.customerTrn)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escape(invoice.customerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- VAT Özeti -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${this.filsToAed(invoice.vatTotalAed)}</cbc:TaxAmount>
    ${this.buildVatBreakdown(invoice, currency)}
  </cac:TaxTotal>

  <!-- Fatura Toplamları -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${this.filsToAed(invoice.totalExclVatAed)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${this.filsToAed(invoice.totalExclVatAed)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${this.filsToAed(invoice.totalInclVatAed)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${this.filsToAed(invoice.totalInclVatAed)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Fatura Satırları -->
  ${invoice.lines.map((line) => this.buildInvoiceLine(line, currency)).join('\n  ')}
</Invoice>`;

    this.logger.debug(
      `Peppol XML üretildi: fatura=${invoice.id} boyut=${xml.length}B`,
    );

    return xml;
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  /** VAT ayrıntı satırı (TaxSubtotal) */
  private buildVatBreakdown(invoice: UaeInvoiceData, currency: string): string {
    const sections: string[] = [];

    // Standart oranlı (%5)
    if (invoice.vatSummaryAed.standardRatedNet > 0n) {
      sections.push(`<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${this.filsToAed(invoice.vatSummaryAed.standardRatedNet)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${this.filsToAed(invoice.vatSummaryAed.standardVatAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>5</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`);
    }

    // Sıfır oranlı
    if (invoice.vatSummaryAed.zeroRatedNet > 0n) {
      sections.push(`<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${this.filsToAed(invoice.vatSummaryAed.zeroRatedNet)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`);
    }

    // Muaf
    if (invoice.vatSummaryAed.exemptNet > 0n) {
      sections.push(`<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${this.filsToAed(invoice.vatSummaryAed.exemptNet)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">0.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>E</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`);
    }

    return sections.join('\n  ');
  }

  /** Fatura satırı XML bloğu */
  private buildInvoiceLine(line: UaeInvoiceLine, currency: string): string {
    const vatCategoryId = line.vatRate === 'exempt' ? 'E' : line.vatRate === 0 ? 'Z' : 'S';
    const vatPercent    = line.vatRate === 'exempt' ? 0 : line.vatRate;

    return `<cac:InvoiceLine>
    <cbc:ID>${this.escape(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${this.escape(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${this.filsToAed(line.netAmountAed)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${this.filsToAed(line.vatAmountAed)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${this.filsToAed(line.netAmountAed)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${this.filsToAed(line.vatAmountAed)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>${vatCategoryId}</cbc:ID>
          <cbc:Percent>${vatPercent}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${this.escape(line.description)}</cbc:Description>
      <cbc:Name>${this.escape(line.description)}</cbc:Name>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${this.filsToAed(line.unitPriceAed)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }

  /**
   * Fils (en küçük birim) → AED ondalık string.
   * Örnek: 105_00n fils → "105.00"
   */
  private filsToAed(fils: bigint): string {
    const whole = fils / 100n;
    const frac  = fils % 100n;
    return `${whole}.${String(frac).padStart(2, '0')}`;
  }

  /** XML özel karakter kaçış */
  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

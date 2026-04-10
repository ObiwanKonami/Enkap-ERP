import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/** ZATCA fatura satırı */
export interface ZatcaInvoiceLine {
  id: string;
  name: string;
  quantity: number;
  unitCode: string;
  unitPriceSar: bigint;  // SAR halalah cinsinden
  netAmountSar: bigint;  // SAR halalah
  vatRate: 15 | 0 | 'exempt';
  vatAmountSar: bigint;  // SAR halalah
}

/** ZATCA fatura verisi */
export interface ZatcaInvoiceData {
  /** Yerel fatura numarası */
  id: string;
  /** ZATCA zorunlu UUID v4 (her fatura benzersiz) */
  uuid: string;
  /** Fatura tarihi (yyyy-MM-dd) */
  issueDate: string;
  /** Fatura saati (HH:mm:ss) */
  issueTime?: string;
  /** Satıcı ticaret unvanı */
  sellerName: string;
  /** Satıcı VAT Registration Number (15 hane) */
  sellerVrn: string;
  /** Alıcı ticaret unvanı */
  buyerName: string;
  /** Alıcı VRN (B2B ise zorunlu) */
  buyerVrn?: string;
  /** Fatura satırları */
  lines: ZatcaInvoiceLine[];
  /** KDV hariç toplam (SAR halalah) */
  totalExclVatSar: bigint;
  /** Toplam VAT (SAR halalah) */
  vatTotalSar: bigint;
  /** KDV dahil toplam (SAR halalah) */
  totalInclVatSar: bigint;
  /**
   * Önceki faturanın hash'i (SHA-256, Base64).
   * İlk fatura için: hash("") = "NWZlMmZjNTFhNWI..."
   */
  previousInvoiceHash: string;
  /** Fatura türü: 388=Standart(B2B), 381=Alacak, 383=Borç, 780=Basit(B2C) */
  invoiceTypeCode?: '388' | '381' | '383' | '780';
}

/** ZATCA API yanıtı */
export interface ZatcaResponse {
  status: 'REPORTED' | 'CLEARED' | 'ERROR';
  /** Onaylanmış ve ZATCA damgası basılmış XML (clearance mode) */
  clearedInvoice?: string;
  /** Uyarı mesajları (zorunlu alan eksikliği vb.) */
  warnings?: string[];
  /** Hata mesajları */
  errors?: string[];
}

/**
 * ZATCA (Zakat, Tax and Customs Authority) e-Fatura XML Üretici.
 *
 * Suudi Arabistan e-Fatura Fazı 2 (2023 sonrası):
 *  - UBL 2.1 + ZATCA profili
 *  - QR kodu zorunlu (TLV Base64 encoding)
 *  - PIH (Previous Invoice Hash) zinciri
 *  - İki mod: Reporting (B2C) ve Clearance (B2B)
 *
 * VAT oranları KSA:
 *  15% — Standart oran (2020'de %5'ten artırıldı)
 *  0%  — İhracat ve belirli kategoriler
 *  Muaf — Belirli sektörler
 *
 * Para birimi: SAR (Suudi Riyal) — en küçük birim halalah (1 SAR = 100 halalah)
 */
@Injectable()
export class ZatcaBuilderService {
  private readonly logger = new Logger(ZatcaBuilderService.name);

  /**
   * ZATCA uyumlu UBL 2.1 XML faturası üretir.
   *
   * @param invoice  Fatura verisi
   * @returns        UTF-8 XML string
   */
  buildInvoiceXml(invoice: ZatcaInvoiceData): string {
    this.logger.debug(`ZATCA XML üretiliyor: fatura=${invoice.id} uuid=${invoice.uuid}`);

    const invoiceTypeCode = invoice.invoiceTypeCode ?? '388';
    const issueTime = invoice.issueTime ?? '00:00:00';
    const invoiceHash = this.computeInvoiceHash(invoice.previousInvoiceHash); // PIH alanı için yer tutucu

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <!-- ZATCA zorunlu alanlar -->
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${this.escape(invoice.id)}</cbc:ID>
  <cbc:UUID>${this.escape(invoice.uuid)}</cbc:UUID>
  <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${invoiceTypeCode === '388' ? '0100000' : '0200000'}">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>

  <!-- Önceki fatura hash'i (PIH — zincir bütünlüğü) -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${invoice.previousInvoiceHash}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  <!-- QR Kodu -->
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${this.generateQrCode(invoice)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>

  <!-- İmza alanı (CSID ile imzalanacak) -->
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>

  <!-- Satıcı -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${this.escape(invoice.sellerVrn)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.escape(invoice.sellerName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escape(invoice.sellerVrn)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escape(invoice.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Alıcı -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>${this.escape(invoice.buyerName)}</cbc:Name>
      </cac:PartyName>
      ${invoice.buyerVrn ? `<cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escape(invoice.buyerVrn)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escape(invoice.buyerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>

  <!-- VAT Toplamı -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SAR">${this.halalahToSar(invoice.vatTotalSar)}</cbc:TaxAmount>
    ${this.buildVatBreakdown(invoice)}
  </cac:TaxTotal>

  <!-- Fatura Toplamları -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${this.halalahToSar(invoice.totalExclVatSar)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${this.halalahToSar(invoice.totalExclVatSar)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${this.halalahToSar(invoice.totalInclVatSar)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${this.halalahToSar(invoice.totalInclVatSar)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>

  <!-- Fatura Satırları -->
  ${invoice.lines.map((line, idx) => this.buildInvoiceLine(line, idx + 1)).join('\n  ')}

</Invoice>`;

    void invoiceHash; // PIH sonraki faturada kullanılır

    this.logger.debug(
      `ZATCA XML üretildi: fatura=${invoice.id} boyut=${xml.length}B`,
    );

    return xml;
  }

  /**
   * ZATCA QR kodu üretir (TLV Binary → Base64).
   *
   * TLV (Tag-Length-Value) encoding:
   *  Tag 1: Satıcı adı
   *  Tag 2: VAT Registration Number
   *  Tag 3: Fatura tarihi+saati (ISO 8601)
   *  Tag 4: KDV dahil toplam (SAR ondalık)
   *  Tag 5: VAT tutarı (SAR ondalık)
   *
   * Her alan: [tag: 1 byte][length: 1 byte][value: N byte]
   * Sonuç: tüm TLV bytes → Base64
   */
  generateQrCode(invoice: ZatcaInvoiceData): string {
    const dateTime = `${invoice.issueDate}T${invoice.issueTime ?? '00:00:00'}`;
    const totalInclVat = this.halalahToSar(invoice.totalInclVatSar);
    const vatTotal     = this.halalahToSar(invoice.vatTotalSar);

    const fields: Array<[number, string]> = [
      [1, invoice.sellerName],
      [2, invoice.sellerVrn],
      [3, dateTime],
      [4, totalInclVat],
      [5, vatTotal],
    ];

    const buffers: Buffer[] = [];

    for (const [tag, value] of fields) {
      const valueBuffer  = Buffer.from(value, 'utf8');
      const tagBuffer    = Buffer.from([tag]);
      const lengthBuffer = Buffer.from([valueBuffer.length]);
      buffers.push(tagBuffer, lengthBuffer, valueBuffer);
    }

    const tlvBuffer = Buffer.concat(buffers);
    return tlvBuffer.toString('base64');
  }

  /**
   * Fatura XML'inin SHA-256 hash'ini hesaplar (Base64 encoded).
   * ZATCA zinciri için kullanılır: her faturanın hash'i sonraki faturaya PIH olarak eklenir.
   *
   * @param xml  Ham XML string veya önceki hash (ilk fatura için boş string)
   */
  computeInvoiceHash(xml: string): string {
    return crypto
      .createHash('sha256')
      .update(xml, 'utf8')
      .digest('base64');
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  /** VAT ayrıntı satırları */
  private buildVatBreakdown(invoice: ZatcaInvoiceData): string {
    // Orana göre grupla
    const groups = new Map<string, { taxable: bigint; tax: bigint }>();

    for (const line of invoice.lines) {
      const key = String(line.vatRate);
      const existing = groups.get(key) ?? { taxable: 0n, tax: 0n };
      groups.set(key, {
        taxable: existing.taxable + line.netAmountSar,
        tax:     existing.tax    + line.vatAmountSar,
      });
    }

    const sections: string[] = [];

    for (const [rateStr, amounts] of groups) {
      const rate = rateStr === 'exempt' ? 'exempt' : Number(rateStr);
      const categoryId = rate === 'exempt' ? 'E' : rate === 0 ? 'Z' : 'S';
      const percent    = rate === 'exempt' ? 0 : rate;

      sections.push(`<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SAR">${this.halalahToSar(amounts.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SAR">${this.halalahToSar(amounts.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${categoryId}</cbc:ID>
        <cbc:Percent>${percent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`);
    }

    return sections.join('\n  ');
  }

  /** Fatura satırı XML bloğu */
  private buildInvoiceLine(line: ZatcaInvoiceLine, lineNumber: number): string {
    const vatCategoryId = line.vatRate === 'exempt' ? 'E' : line.vatRate === 0 ? 'Z' : 'S';
    const vatPercent    = line.vatRate === 'exempt' ? 0 : line.vatRate;

    return `<cac:InvoiceLine>
    <cbc:ID>${lineNumber}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${this.escape(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${this.halalahToSar(line.netAmountSar)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${this.halalahToSar(line.vatAmountSar)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${this.halalahToSar(line.netAmountSar + line.vatAmountSar)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${this.escape(line.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${vatCategoryId}</cbc:ID>
        <cbc:Percent>${vatPercent}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SAR">${this.halalahToSar(line.unitPriceSar)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }

  /**
   * Halalah (en küçük birim) → SAR ondalık string.
   * Örnek: 15000n → "150.00" (1 SAR = 100 halalah)
   */
  private halalahToSar(halalah: bigint): string {
    const whole = halalah / 100n;
    const frac  = halalah % 100n;
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

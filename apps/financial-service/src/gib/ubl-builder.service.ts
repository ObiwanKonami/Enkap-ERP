import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';
import type { Invoice } from '../invoice/entities/invoice.entity';
import type { InvoiceLine } from '../invoice/entities/invoice-line.entity';
import { Money } from '../shared/money';
import { getKdvExemption } from '@enkap/shared-types';
import type {
  GibProfileId,
  GibInvoiceTypeCode,
  SectoralDto,
} from './dto/send-invoice.dto';

export interface SellerInfo {
  taxId: string;       // VKN (10 hane)
  taxOffice: string;
  name: string;
  address: string;
  city: string;
  district?: string;
  country: string;
}

export interface BuyerInfo {
  taxId?: string;      // VKN (B2B) veya TCKN (B2C)
  name: string;
  address?: string;
  city?: string;
  district?: string;
  country?: string;
  email?: string;
}

/**
 * UBL-TR 2.1 formatında e-Fatura / e-Arşiv XML üreticisi.
 *
 * GİB teknik kılavuzuna uygun:
 *  - Namespace: urn:oasis:names:specification:ubl:schema:xsd:Invoice-2
 *  - Extension: GİB'e özgü UBL-TR uzantıları
 *  - CustomizationID: TR1.2
 *  - Sektörel uzantılar: SGK, Elektrik Şarj, İlaç/Tıbbi Cihaz, İDİS
 *
 * İmzalama (XAdES-BES) bu serviste YAPILMAZ — ayrı Java servisi sorumludur.
 * Bu servis imzalanmamış ham XML üretir.
 *
 * Tarih/saat: Europe/Istanbul (UTC+3)
 */

export interface GibBuildOptions {
  profileId?: GibProfileId;
  invoiceTypeCode?: GibInvoiceTypeCode;
  documentNumber?: string;
  sectoral?: SectoralDto;
}

@Injectable()
export class UblBuilderService {

  /**
   * Fatura için UBL-TR 2.1 XML string üretir.
   *
   * @param options ProfileID, InvoiceTypeCode ve sektörel uzantı parametreleri.
   *                Belirtilmezse fatura tipinden otomatik belirlenir.
   */
  buildInvoiceXml(
    invoice: Invoice,
    lines: InvoiceLine[],
    seller: SellerInfo,
    buyer: BuyerInfo,
    options?: GibBuildOptions,
  ): string {
    const issueDate = format(new Date(invoice.issueDate), 'yyyy-MM-dd');
    const issueTime = '00:00:00'; // GİB: saat zorunlu değil ama boş bırakılmamalı

    const profileId: string = options?.profileId
      ?? (invoice.invoiceType === 'E_ARSIV' ? 'EARSIVFATURA' : 'TEMELFATURA');

    const invoiceTypeCode: string = options?.invoiceTypeCode
      ?? (invoice.direction === 'OUT' ? 'SATIS' : 'ALIS');

    // GİB belge numarası: 16 karakter (dto'dan gelen documentNumber öncelikli)
    const documentId = options?.documentNumber ?? invoice.invoiceNumber;

    const subtotal = Money.fromDecimal(invoice.subtotal);
    const kdvTotal = Money.fromDecimal(invoice.kdvTotal);
    const total = Money.fromDecimal(invoice.total);
    const discountTotal = Money.fromDecimal(invoice.discountTotal);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
      <!-- XAdES-BES imzası buraya eklenir (Java GIB servisi tarafından) -->
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${documentId}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:GUID>${invoice.gibUuid}</cbc:GUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${invoiceTypeCode}</cbc:InvoiceTypeCode>

  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>

  ${this.buildSellerParty(seller)}

  ${this.buildBuyerParty(buyer)}

  ${this.buildPaymentTerms(invoice)}

  ${options?.sectoral ? this.buildSectoralExtensions(profileId, options.sectoral) : ''}

  ${this.buildTaxTotal(kdvTotal, invoice.currency)}

  ${this.buildLegalMonetaryTotal(subtotal, discountTotal, kdvTotal, total, invoice.currency)}

  ${lines.map((line, i) => this.buildInvoiceLine(line, i + 1, invoice.currency)).join('\n  ')}

</Invoice>`;
  }

  // ─── Özel bölüm oluşturucular ────────────────────────────────────────────────

  private buildSellerParty(seller: SellerInfo): string {
    return `<cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${seller.taxId}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(seller.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(seller.address)}</cbc:StreetName>
        ${seller.district ? `<cbc:CitySubdivisionName>${this.escapeXml(seller.district)}</cbc:CitySubdivisionName>` : ''}
        <cbc:CityName>${this.escapeXml(seller.city)}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${seller.country}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:TaxOffice>${this.escapeXml(seller.taxOffice)}</cbc:TaxOffice>
        <cac:TaxScheme>
          <cbc:Name>VKN</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
  }

  private buildBuyerParty(buyer: BuyerInfo): string {
    const schemeId = buyer.taxId?.length === 11 ? 'TCKN' : 'VKN';
    return `<cac:AccountingCustomerParty>
    <cac:Party>
      ${buyer.taxId ? `<cac:PartyIdentification>
        <cbc:ID schemeID="${schemeId}">${buyer.taxId}</cbc:ID>
      </cac:PartyIdentification>` : ''}
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(buyer.name)}</cbc:Name>
      </cac:PartyName>
      ${buyer.address ? `<cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(buyer.address)}</cbc:StreetName>
        ${buyer.district ? `<cbc:CitySubdivisionName>${this.escapeXml(buyer.district)}</cbc:CitySubdivisionName>` : ''}
        <cbc:CityName>${this.escapeXml(buyer.city ?? '')}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${buyer.country ?? 'Türkiye'}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>` : ''}
    </cac:Party>
  </cac:AccountingCustomerParty>`;
  }

  private buildPaymentTerms(invoice: Invoice): string {
    if (!invoice.dueDate) return '';
    const dueDateStr = format(new Date(invoice.dueDate), 'yyyy-MM-dd');
    return `<cac:PaymentTerms>
    <cbc:Note>Vade Tarihi: ${dueDateStr}</cbc:Note>
  </cac:PaymentTerms>`;
  }

  private buildTaxTotal(kdvTotal: Money, currency: string): string {
    return `<cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${kdvTotal.toGibString()}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxAmount currencyID="${currency}">${kdvTotal.toGibString()}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;
  }

  private buildLegalMonetaryTotal(
    subtotal: Money,
    discountTotal: Money,
    kdvTotal: Money,
    total: Money,
    currency: string,
  ): string {
    return `<cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${subtotal.add(discountTotal).toGibString()}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${subtotal.toGibString()}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${total.toGibString()}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${discountTotal.toGibString()}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${currency}">${total.toGibString()}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
  }

  private buildInvoiceLine(
    line: InvoiceLine,
    lineNum: number,
    currency: string,
  ): string {
    const unitPrice = Money.fromDecimal(line.unitPrice);
    const grossAmount = unitPrice.multiply(line.quantity);
    const discountAmount = grossAmount.percentage(line.discountPct);
    const matrah = grossAmount.subtract(discountAmount);

    return `<cac:InvoiceLine>
    <cbc:ID>${lineNum}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${line.unit}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${matrah.toGibString()}</cbc:LineExtensionAmount>
    ${line.discountPct > 0 ? `<cac:AllowanceCharge>
      <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
      <cbc:Amount currencyID="${currency}">${discountAmount.toGibString()}</cbc:Amount>
    </cac:AllowanceCharge>` : ''}
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${Money.fromDecimal(line.kdvAmount).toGibString()}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${matrah.toGibString()}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${Money.fromDecimal(line.kdvAmount).toGibString()}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:Percent>${line.kdvRate}</cbc:Percent>
          ${line.kdvRate === 0 ? this.buildKdvExemptionBlock(line.kdvExemptionCode) : ''}
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${unitPrice.toGibString()}</cbc:PriceAmount>
    </cac:Price>
    <cac:Item>
      <cbc:Name>${this.escapeXml(line.description)}</cbc:Name>
    </cac:Item>
  </cac:InvoiceLine>`;
  }

  /**
   * KDV oranı %0 olan satırlar için TaxExemptionReasonCode + TaxExemptionReason bloğu üretir.
   * GİB UBL-TR 2.1 zorunluluğu: %0 KDV'de muafiyet kodu ve açıklaması bulunmalıdır.
   */
  private buildKdvExemptionBlock(exemptionCode?: string): string {
    const entry = getKdvExemption(exemptionCode ?? '350');
    return `<cbc:TaxExemptionReasonCode>${entry.code}</cbc:TaxExemptionReasonCode>
          <cbc:TaxExemptionReason>${this.escapeXml(entry.name)}</cbc:TaxExemptionReason>`;
  }

  /**
   * Sektörel UBL-TR uzantı bloklarını üretir.
   *
   * ProfileID'e göre:
   *  SGK           → PaymentMeans/PayeeFinancialAccount/ID (IBAN)
   *  ENERJI (SARJ) → Delivery/DeliveryParty/PartyIdentification (PLAKA + ARACKIMLIKNO)
   *  ILAC_TIBBICIHAZ → Item/Description GTIN barkod notası
   *  IDIS          → Delivery/Shipment (SE numarası + etiket no)
   */
  private buildSectoralExtensions(profileId: string, sectoral: SectoralDto): string {
    const parts: string[] = [];

    if (profileId === 'SGK' && 'iban' in sectoral && sectoral.iban) {
      parts.push(`<cac:PaymentMeans>
    <cbc:PaymentMeansCode>42</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${this.escapeXml(sectoral.iban)}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>`);
    }

    if ((profileId === 'ENERJI') && 'schemeId' in sectoral) {
      const sarj = sectoral as { schemeId: string; vehicleId: string };
      parts.push(`<cac:Delivery>
    <cac:DeliveryParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${this.escapeXml(sarj.schemeId)}">${this.escapeXml(sarj.vehicleId)}</cbc:ID>
      </cac:PartyIdentification>
    </cac:DeliveryParty>
  </cac:Delivery>`);
    }

    if (profileId === 'ILAC_TIBBICIHAZ' && 'gtinBarcode' in sectoral && sectoral.gtinBarcode) {
      // İlaç barkod notası her satıra eklenir — burada fatura düzeyinde header notu
      parts.push(`<cbc:Note>GTIN:${this.escapeXml(sectoral.gtinBarcode)}</cbc:Note>`);
    }

    if (profileId === 'IDIS' && 'shipmentNumber' in sectoral) {
      const idis = sectoral as { shipmentNumber: string; labelNumber: string };
      parts.push(`<cac:Delivery>
    <cac:Shipment>
      <cbc:ID>${this.escapeXml(idis.shipmentNumber)}</cbc:ID>
      <cbc:Information>${this.escapeXml(idis.labelNumber)}</cbc:Information>
    </cac:Shipment>
  </cac:Delivery>`);
    }

    return parts.join('\n  ');
  }

  /** XML özel karakterlerini kaçış karakteriyle değiştirir */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export interface IrsaliyeLine {
  lineNum: number;
  description: string;
  quantity: number;
  unitCode: string;
}

export interface IrsaliyeParty {
  taxId: string;
  taxOffice?: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface IrsaliyeData {
  /** e-İrsaliye UUID'i (GİB GUID) — UUID v4 */
  uuid: string;
  /** İrsaliye numarası — GİB formatı: {PREFIX}{YIL}{AY}-{SIRA:05} */
  documentNumber: string;
  /** Düzenlenme tarihi */
  issueDate: Date;
  /** Sevkiyat tarihi */
  despatchDate: Date;
  /** İrsaliye türü: SEVK (gönderen) veya ALIS (alıcı tarafı) */
  documentType: 'SEVK' | 'ALIS';
  despatcher: IrsaliyeParty;
  receiver: IrsaliyeParty;
  lines: IrsaliyeLine[];
  notes?: string;
}

/**
 * UBL-TR 2.1 formatında e-İrsaliye XML üreticisi.
 *
 * GİB teknik kılavuzu: e-İrsaliye Teknik Kılavuzu v1.3
 * Namespace: urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2
 *
 * e-İrsaliye kullanım zorunluluğu:
 *  - Fatura düzenleme yükümlüsü firmalar için zorunlu (GİB tebliği)
 *  - Taşıma belgesi olarak kullanılır (KDV mevzuatı)
 *
 * İmzalama (XAdES-T) bu serviste YAPILMAZ — Java GİB servisi sorumludur.
 */
@Injectable()
export class IrsaliyeBuilderService {

  /**
   * Yeni e-İrsaliye için UUID ve numara üretir.
   * Üretim ortamında numara GİB'den veya kendi numaratörden alınmalıdır.
   */
  generateDocumentId(prefix: string, year: number, month: number, sequence: number): {
    uuid: string;
    documentNumber: string;
  } {
    const monthStr = String(month).padStart(2, '0');
    const sequenceStr = String(sequence).padStart(5, '0');
    return {
      uuid: uuidv4(),
      documentNumber: `${prefix}${year}${monthStr}-${sequenceStr}`,
    };
  }

  /**
   * e-İrsaliye UBL-TR 2.1 XML string üretir.
   * Üretilen XML imzasız ham XML'dir.
   */
  buildDespatchAdviceXml(data: IrsaliyeData): string {
    const issueDate = format(data.issueDate, 'yyyy-MM-dd');
    const despatchDate = format(data.despatchDate, 'yyyy-MM-dd');

    return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
               xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
               xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
               xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
      <!-- XAdES imzası buraya eklenir (Java GIB servisi tarafından) -->
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>EARSIVFATURA</cbc:ProfileID>
  <cbc:ID>${data.documentNumber}</cbc:ID>
  <cbc:GUID>${data.uuid}</cbc:GUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DespatchAdviceTypeCode>${data.documentType}</cbc:DespatchAdviceTypeCode>
  <cbc:LineCountNumeric>${data.lines.length}</cbc:LineCountNumeric>

  ${data.notes ? `<cbc:Note>${this.escapeXml(data.notes)}</cbc:Note>` : ''}

  ${this.buildParty('cac:DespatchSupplierParty', data.despatcher)}

  ${this.buildParty('cac:DeliveryCustomerParty', data.receiver)}

  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cac:ShipmentStage>
      <cbc:TransportModeCode>4</cbc:TransportModeCode>
      <!-- 4 = Karayolu -->
    </cac:ShipmentStage>
    <cac:Delivery>
      <cac:RequestedDeliveryPeriod>
        <cbc:EndDate>${despatchDate}</cbc:EndDate>
      </cac:RequestedDeliveryPeriod>
    </cac:Delivery>
  </cac:Shipment>

  ${data.lines.map((line) => this.buildDespatchLine(line)).join('\n  ')}

</DespatchAdvice>`;
  }

  // ─── Özel bölüm oluşturucular ────────────────────────────────────────────────

  private buildParty(tagName: string, party: IrsaliyeParty): string {
    const schemeId = party.taxId.length === 11 ? 'TCKN' : 'VKN';
    return `<${tagName}>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${schemeId}">${party.taxId}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(party.name)}</cbc:Name>
      </cac:PartyName>
      ${party.address ? `<cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(party.address)}</cbc:StreetName>
        <cbc:CityName>${this.escapeXml(party.city ?? '')}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${party.country ?? 'Türkiye'}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>` : ''}
      ${party.taxOffice ? `<cac:PartyTaxScheme>
        <cbc:TaxOffice>${this.escapeXml(party.taxOffice)}</cbc:TaxOffice>
        <cac:TaxScheme>
          <cbc:Name>VKN</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </${tagName}>`;
  }

  private buildDespatchLine(line: IrsaliyeLine): string {
    return `<cac:DespatchLine>
    <cbc:ID>${line.lineNum}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:DeliveredQuantity>
    <cac:Item>
      <cbc:Name>${this.escapeXml(line.description)}</cbc:Name>
    </cac:Item>
  </cac:DespatchLine>`;
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

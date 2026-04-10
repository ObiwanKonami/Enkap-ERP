import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Waybill } from './entities/waybill.entity';

/**
 * e-İrsaliye UBL-TR 2.1 XML üretici.
 *
 * Standart: GİB e-İrsaliye Teknik Kılavuzu v1.2
 * Format:   UBL 2.1 DespatchAdvice (tr-ubl-despatchadvice-2.1)
 *
 * NOT: Bu implementasyon GİB test ortamı için uygundur.
 * Production için Java/BouncyCastle imzalama servisi (XAdES-T) gereklidir.
 * İmzasız XML → /sign endpoint'ine gönderilir → imzalı XML döner.
 */
@Injectable()
export class WaybillXmlService {
  /**
   * İrsaliye için UBL-TR 2.1 DespatchAdvice XML üretir.
   * Dönen XML imzasız — GİB'e göndermeden önce signing service'ten geçer.
   */
  generate(waybill: Waybill): string {
    const uuid      = waybill.gibUuid ?? randomUUID().toUpperCase();
    const issueDate = this.formatDate(waybill.shipDate);
    const issueTime = '00:00:00';

    const lines = waybill.lines.map((l, i) => this.buildLine(i + 1, l)).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<DespatchAdvice
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${this.mapTypeToProfileId(waybill.type)}</cbc:ProfileID>
  <cbc:ID>${this.escapeXml(waybill.waybillNumber)}</cbc:ID>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>${this.mapTypeToCode(waybill.type)}</cbc:DespatchAdviceTypeCode>
  ${waybill.notes ? `<cbc:Note>${this.escapeXml(waybill.notes)}</cbc:Note>` : ''}
  <cbc:LineCountNumeric>${waybill.lines.length}</cbc:LineCountNumeric>

  <!-- Gönderici -->
  <cac:DespatchSupplierParty>
    <cac:Party>
      ${waybill.senderVkn ? `<cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${this.escapeXml(waybill.senderVkn)}</cbc:ID>
      </cac:PartyIdentification>` : ''}
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(waybill.senderName)}</cbc:Name>
      </cac:PartyName>
      ${waybill.senderAddress ? `<cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(waybill.senderAddress)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>` : ''}
    </cac:Party>
  </cac:DespatchSupplierParty>

  <!-- Alıcı -->
  <cac:DeliveryCustomerParty>
    <cac:Party>
      ${waybill.receiverVknTckn ? `<cac:PartyIdentification>
        <cbc:ID schemeID="${waybill.receiverVknTckn.length === 10 ? 'VKN' : 'TCKN'}">${this.escapeXml(waybill.receiverVknTckn)}</cbc:ID>
      </cac:PartyIdentification>` : ''}
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(waybill.receiverName)}</cbc:Name>
      </cac:PartyName>
      ${waybill.receiverAddress ? `<cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(waybill.receiverAddress)}</cbc:StreetName>
        <cac:Country><cbc:Name>Türkiye</cbc:Name></cac:Country>
      </cac:PostalAddress>` : ''}
    </cac:Party>
  </cac:DeliveryCustomerParty>

  <!-- Taşıma -->
  <cac:Shipment>
    <cbc:ID>${this.escapeXml(waybill.waybillNumber)}</cbc:ID>
    ${waybill.vehiclePlate || waybill.driverName ? `<cac:TransportHandlingUnit>
      <cbc:ID>1</cbc:ID>
      ${waybill.vehiclePlate ? `<cac:ActualPackage>
        <cbc:ID>${this.escapeXml(waybill.vehiclePlate)}</cbc:ID>
      </cac:ActualPackage>` : ''}
    </cac:TransportHandlingUnit>` : ''}
    ${waybill.vehiclePlate ? `<cac:ShipmentStage>
      <cbc:TransportModeCode>3</cbc:TransportModeCode>
      <cac:TransportMeans>
        <cac:RoadTransport>
          <cbc:LicensePlateID>${this.escapeXml(waybill.vehiclePlate)}</cbc:LicensePlateID>
        </cac:RoadTransport>
      </cac:TransportMeans>
      ${waybill.driverName ? `<cac:DriverPerson>
        <cbc:FirstName>${this.escapeXml(waybill.driverName)}</cbc:FirstName>
        ${waybill.driverTckn ? `<cac:IdentityDocumentReference>
          <cbc:ID schemeID="TCKN">${this.escapeXml(waybill.driverTckn)}</cbc:ID>
        </cac:IdentityDocumentReference>` : ''}
      </cac:DriverPerson>` : ''}
    </cac:ShipmentStage>` : ''}
    <cac:Delivery>
      <cbc:ActualDeliveryDate>${waybill.deliveryDate ? this.formatDate(waybill.deliveryDate) : issueDate}</cbc:ActualDeliveryDate>
    </cac:Delivery>
  </cac:Shipment>

  <!-- Kalemler -->
${lines}

</DespatchAdvice>`;
  }

  private buildLine(
    lineNo: number,
    line: { productName: string; sku?: string; quantity: number; unitCode: string; lotNumber?: string; serialNumber?: string },
  ): string {
    return `  <cac:DespatchLine>
    <cbc:ID>${lineNo}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="${this.escapeXml(line.unitCode)}">${Number(line.quantity).toFixed(4)}</cbc:DeliveredQuantity>
    ${line.lotNumber ? `<cbc:Note>Lot: ${this.escapeXml(line.lotNumber)}</cbc:Note>` : ''}
    ${line.serialNumber ? `<cbc:Note>Seri: ${this.escapeXml(line.serialNumber)}</cbc:Note>` : ''}
    <cac:Item>
      <cbc:Name>${this.escapeXml(line.productName)}</cbc:Name>
      ${line.sku ? `<cac:SellersItemIdentification>
        <cbc:ID>${this.escapeXml(line.sku)}</cbc:ID>
      </cac:SellersItemIdentification>` : ''}
    </cac:Item>
  </cac:DespatchLine>`;
  }

  private mapTypeToProfileId(type: string): string {
    switch (type) {
      case 'ALIS':     return 'ALISIIRSALIYE';
      case 'TRANSFER': return 'TRANSFERIRSALIYE';
      case 'IADE':     return 'IADEIIRSALIYE';
      default:         return 'SEVKIIRSALIYE'; // SATIS
    }
  }

  private mapTypeToCode(type: string): string {
    switch (type) {
      case 'ALIS':     return 'ALIS';
      case 'TRANSFER': return 'TRANSFER';
      case 'IADE':     return 'IADE';
      default:         return 'SEVK';
    }
  }

  private formatDate(d: Date | string): string {
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().slice(0, 10);
  }

  private escapeXml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

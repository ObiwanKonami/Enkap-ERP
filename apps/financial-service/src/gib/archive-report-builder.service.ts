import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

export interface ArchiveDocumentEntry {
  ettn: string;           // Fatura GUID
  invoiceNumber: string;  // Belge numarası
  profileId: string;      // EARSIVFATURA, ESMM vb.
  issueDate: Date;        // Kesim tarihi
  sellerVkn: string;      // Satıcı VKN
  buyerVknTckn: string;   // Alıcı VKN veya TCKN
  total: number;          // Toplam tutar (kuruş → string'e çevrilir)
  currency: string;       // TRY, USD vb.
}

export interface ArchiveReportXmlOptions {
  reportDate: Date;       // Raporlama tarihi (bugün)
  integratorVkn: string;  // Enkap entegratör VKN — env: GIB_INTEGRATOR_VKN
  tenantVkn: string;      // Tenant VKN
  entries: ArchiveDocumentEntry[];
}

/**
 * GİB eArsivRaporu UBL XML builder.
 *
 * GİB teknik kılavuzuna göre REPORTING kategorisi belgeler (EARSIVFATURA, ESMM vb.)
 * her gün 23:59'a kadar GİB Raporlama API'sine toplu bildirilmelidir.
 * Bu servis o raporun UBL XML'ini üretir.
 *
 * İmzalama YAPILMAZ — çağıran (ArchiveReportingService) entegratör mühürüyle imzalar.
 */
@Injectable()
export class ArchiveReportBuilderService {
  buildReportXml(opts: ArchiveReportXmlOptions): string {
    const reportId = uuidv4().toUpperCase();
    const reportDateStr = format(opts.reportDate, 'yyyy-MM-dd');
    const reportTimeStr = format(opts.reportDate, 'HH:mm:ss');
    const entryCount = opts.entries.length;

    const invoiceLines = opts.entries
      .map((e, i) => this.buildInvoiceLine(e, i + 1))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<earchiveReport xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
                xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
                xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
                xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
      <!-- XAdES-BES entegratör mali mühür imzası (Java GIB servisi tarafından eklenir) -->
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>EARSIVRAPORU</cbc:ProfileID>
  <cbc:ID>${reportId}</cbc:ID>
  <cbc:IssueDate>${reportDateStr}</cbc:IssueDate>
  <cbc:IssueTime>${reportTimeStr}</cbc:IssueTime>
  <cbc:LineCountNumeric>${entryCount}</cbc:LineCountNumeric>

  <!-- Entegratör (Enkap) bilgisi -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${opts.integratorVkn}</cbc:ID>
      </cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingSupplierParty>

  <!-- Rapor sahibi tenant VKN -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${opts.tenantVkn}</cbc:ID>
      </cac:PartyIdentification>
    </cac:Party>
  </cac:AccountingCustomerParty>

${invoiceLines}

</earchiveReport>`;
  }

  private buildInvoiceLine(entry: ArchiveDocumentEntry, lineNum: number): string {
    const issueDateStr = format(new Date(entry.issueDate), 'yyyy-MM-dd');
    // Kuruş → TL (2 decimal)
    const totalStr = (entry.total / 100).toFixed(2);
    const schemeId = entry.buyerVknTckn.length === 11 ? 'TCKN' : 'VKN';

    return `  <cac:InvoiceLine>
    <cbc:ID>${lineNum}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${entry.currency}">${totalStr}</cbc:LineExtensionAmount>
    <cac:DocumentReference>
      <cbc:ID>${entry.ettn}</cbc:ID>
      <cbc:DocumentTypeCode>ETTN</cbc:DocumentTypeCode>
    </cac:DocumentReference>
    <cac:DocumentReference>
      <cbc:ID>${entry.invoiceNumber}</cbc:ID>
      <cbc:DocumentTypeCode>BELGE_NO</cbc:DocumentTypeCode>
    </cac:DocumentReference>
    <cac:DocumentReference>
      <cbc:ID>${entry.profileId}</cbc:ID>
      <cbc:DocumentTypeCode>PROFIL</cbc:DocumentTypeCode>
    </cac:DocumentReference>
    <cac:DocumentReference>
      <cbc:ID>${issueDateStr}</cbc:ID>
      <cbc:DocumentTypeCode>KESIM_TARIHI</cbc:DocumentTypeCode>
    </cac:DocumentReference>
    <cac:DocumentReference>
      <cbc:ID schemeID="${schemeId}">${entry.buyerVknTckn}</cbc:ID>
      <cbc:DocumentTypeCode>ALICI_VKN_TCKN</cbc:DocumentTypeCode>
    </cac:DocumentReference>
  </cac:InvoiceLine>`;
  }
}

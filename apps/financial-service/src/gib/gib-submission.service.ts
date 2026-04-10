import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { UblBuilderService, SellerInfo, BuyerInfo } from './ubl-builder.service';
import { MtomSoapService } from './mtom-soap.service';
import { GibEnvelopeService } from './gib-envelope.service';
import { GibAuditService, GibAuditAction } from './gib-audit.service';
import { getSignerType } from './document-behavior';
import type { SendInvoiceDto } from './dto/send-invoice.dto';
import type { Invoice } from '../invoice/entities/invoice.entity';
import type { InvoiceLine } from '../invoice/entities/invoice-line.entity';

/**
 * GİB EF-VAP Fatura Gönderme Servisi
 *
 * Akış:
 *  1. Fatura + satırları DB'den çek
 *  2. UBL-TR 2.1 XML üret (ProfileID + sektörel uzantılarla)
 *  3. Java imzalama servisi → XAdES-BES imzası
 *  4. ZIP + MD5/SHA-256
 *  5. SENDERENVELOPE oluştur → MTOM SOAP sendDocument → GİB
 *  6. Zarf ve fatura statüsünü güncelle
 *  7. Audit log yaz
 *
 * GİB'e iletişim SOAP 1.2 + MTOM üzerinden gerçekleşir (REST/JSON değil).
 */
@Injectable()
export class GibSubmissionService {
  private readonly logger = new Logger(GibSubmissionService.name);

  private readonly SIGNER_ENDPOINT =
    process.env.GIB_SIGNER_ENDPOINT ?? 'http://gib-signer:8080';

  private readonly INTEGRATOR_SIGNER_ENDPOINT =
    process.env.GIB_INTEGRATOR_SIGNER_ENDPOINT ?? 'http://gib-integrator-signer:8081';

  constructor(
    private readonly ublBuilder: UblBuilderService,
    private readonly mtomSoap: MtomSoapService,
    private readonly envelopeService: GibEnvelopeService,
    private readonly auditService: GibAuditService,
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Faturayı GİB EF-VAP protokolü ile gönderir.
   *
   * @param dto         Gönderim parametreleri (profileId, invoiceTypeCode, receiverAlias, sektörel vb.)
   * @param userId      İşlemi yapan kullanıcı ID'si (audit için)
   * @param ipAddress   İstemci IP adresi (audit için)
   */
  async submitInvoice(
    dto: SendInvoiceDto,
    userId: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; envelopeId?: string; gibStatusCode?: number; error?: string }> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    // ─── 1. Fatura + satırları çek ───────────────────────────────────────────
    const invoiceRows = await dataSource.query<Invoice[]>(
      `SELECT * FROM invoices WHERE id=$1 AND tenant_id=$2`,
      [dto.invoiceId, tenantId],
    );
    const invoice = invoiceRows[0];
    if (!invoice) throw new NotFoundException('Fatura bulunamadı');

    if (invoice.status !== 'APPROVED') {
      throw new BadRequestException(
        `Fatura onaylanmış olmalıdır. Mevcut durum: ${invoice.status}`,
      );
    }

    const lines = await dataSource.query<InvoiceLine[]>(
      `SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY sort_order`,
      [dto.invoiceId],
    );

    // ─── 2. Satıcı/alıcı bilgisi ─────────────────────────────────────────────
    const seller = await this.fetchSellerInfo(dataSource, tenantId);
    const buyer = await this.fetchBuyerInfo(dataSource, invoice);

    // ─── 3. UBL-TR XML üret ──────────────────────────────────────────────────
    const rawXml = this.ublBuilder.buildInvoiceXml(invoice, lines, seller, buyer, {
      profileId: dto.profileId,
      invoiceTypeCode: dto.invoiceTypeCode,
      documentNumber: dto.documentNumber,
      sectoral: dto.sectoral,
    });

    this.logger.debug(
      `UBL-TR XML üretildi: invoice=${invoice.invoiceNumber} profile=${dto.profileId} ` +
      `size=${rawXml.length}`,
    );

    // ─── 4. Java XAdES-BES imzası ────────────────────────────────────────────
    const documentUuid = invoice.gibUuid ?? randomUUID();
    let signedXml: string;
    let signatureHash: string | undefined;
    try {
      const signResult = await this.signXml(rawXml, documentUuid, dto.profileId, tenantId);
      signedXml = signResult.xml;
      signatureHash = signResult.signatureHash;
    } catch (err) {
      this.logger.error(`İmzalama hatası: invoice=${dto.invoiceId} err=${err}`);
      await this.auditService.log({
        tenantId, userId, invoiceId: dto.invoiceId,
        action: GibAuditAction.GIB_ERROR,
        details: { stage: 'signing', error: String(err) },
        ipAddress,
      }).catch(() => undefined);
      return { success: false, error: `İmzalama servisi hatası: ${err}` };
    }

    await this.auditService.log({
      tenantId, userId, invoiceId: dto.invoiceId,
      documentUuid,
      signatureHash,
      action: GibAuditAction.INVOICE_SIGNED,
      details: { profileId: dto.profileId, documentNumber: dto.documentNumber },
      ipAddress,
    }).catch(() => undefined);

    // ─── 5. Fatura statüsünü PENDING_GIB'e çek ───────────────────────────────
    await dataSource.query(
      `UPDATE invoices
       SET status='PENDING_GIB', profile_id=$1, invoice_type_code=$2,
           document_number=$3, envelope_uuid=NULL, updated_at=NOW()
       WHERE id=$4 AND tenant_id=$5`,
      [dto.profileId, dto.invoiceTypeCode, dto.documentNumber ?? null, dto.invoiceId, tenantId],
    );

    // ─── 6. SENDERENVELOPE oluştur → MTOM SOAP → GİB ─────────────────────────
    // senderAlias öncelik sırası: DTO > tenant_profiles.gib_gb_alias > env default
    const filename = `${dto.documentNumber ?? invoice.invoiceNumber}.zip`;
    const envelopeResult = await this.envelopeService.createAndSend({
      signedXml,
      filename,
      documentId: dto.invoiceId,
      receiverAlias: dto.receiverAlias,
      senderAlias: dto.senderAlias ?? seller.gbAlias ?? undefined,
      userId,
      ipAddress,
    });

    // ─── 7. Faturaya envelope_uuid bağla ─────────────────────────────────────
    await dataSource.query(
      `UPDATE invoices SET envelope_uuid=$1, updated_at=NOW()
       WHERE id=$2 AND tenant_id=$3`,
      [envelopeResult.envelopeId, dto.invoiceId, tenantId],
    );

    this.logger.log(
      `GİB gönderimi tamamlandı: invoice=${invoice.invoiceNumber} ` +
      `envelope=${envelopeResult.envelopeId} gibKod=${envelopeResult.gibStatusCode}`,
    );

    return {
      success: envelopeResult.success,
      envelopeId: envelopeResult.envelopeId,
      gibStatusCode: envelopeResult.gibStatusCode,
    };
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  /**
   * XML'i XAdES-BES ile imzalar.
   * REPORTING kategorisi belgeler (e-Arşiv vb.) → Enkap entegratör mühürü (INTEGRATOR_SIGNER_ENDPOINT)
   * ENVELOPE kategorisi belgeler (e-Fatura vb.) → Tenant mali mühürü (SIGNER_ENDPOINT)
   *
   * KRİTİK: Java'dan dönen signedXmlBase64 verisi asla string manipülasyonuyla decode EDİLMEZ.
   * Buffer.from(..., 'base64') ile direkt kullanılır — aksi hâlde GİB 1160 (İmza Geçersiz) hatası.
   */
  private async signXml(
    rawXml: string,
    uuid: string,
    profileId?: string,
    tenantId?: string,
    documentType: 'INVOICE' | 'WAYBILL' | 'ARCHIVE' | 'APP_RESPONSE' = 'INVOICE',
  ): Promise<{ xml: string; signatureHash: string }> {
    const signerType = profileId ? getSignerType(profileId) : 'TENANT';
    const endpoint = signerType === 'INTEGRATOR'
      ? this.INTEGRATOR_SIGNER_ENDPOINT
      : this.SIGNER_ENDPOINT;

    const xmlBase64 = Buffer.from(rawXml, 'utf-8').toString('base64');
    const response = await fetch(`${endpoint}/sign/xades-bes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xmlBase64, signerType, tenantId, documentType, uuid }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    const result = (await response.json()) as { signedXmlBase64: string; signatureHash: string };
    // signedXmlBase64 doğrudan Buffer'a alınır — string manipülasyonu yapılmaz
    return {
      xml: Buffer.from(result.signedXmlBase64, 'base64').toString('utf-8'),
      signatureHash: result.signatureHash,
    };
  }

  private async fetchSellerInfo(
    dataSource: import('typeorm').DataSource,
    tenantId: string,
  ): Promise<SellerInfo & { gbAlias: string | null }> {
    const rows = await dataSource.query<Array<{
      tax_id: string; tax_office: string; company_name: string;
      address: string; city: string; district: string | null; gib_gb_alias: string | null;
    }>>(
      `SELECT tax_id, tax_office, company_name, address, city, district, gib_gb_alias
       FROM tenant_profiles WHERE tenant_id=$1`,
      [tenantId],
    );
    const p = rows[0];
    if (!p) throw new BadRequestException('Tenant profili bulunamadı');
    return {
      taxId: p.tax_id,
      taxOffice: p.tax_office,
      name: p.company_name,
      address: p.address,
      city: p.city,
      district: p.district ?? undefined,
      country: 'Türkiye',
      gbAlias: p.gib_gb_alias ?? null,
    };
  }

  private async fetchBuyerInfo(
    dataSource: import('typeorm').DataSource,
    invoice: Invoice,
  ): Promise<BuyerInfo> {
    if (!invoice.counterpartyId) {
      return { name: 'Nihai Tüketici', country: 'Türkiye' };
    }
    const rows = await dataSource.query<Array<{
      tax_id: string; full_name: string; address: string; city: string; district: string | null; email: string;
    }>>(
      `SELECT tax_id, full_name, address, city, district, email
       FROM crm_contacts WHERE id=$1`,
      [invoice.counterpartyId],
    );
    const c = rows[0];
    if (!c) return { name: 'Bilinmeyen Alıcı', country: 'Türkiye' };
    return {
      taxId: c.tax_id || undefined,
      name: c.full_name,
      address: c.address || undefined,
      city: c.city || undefined,
      district: c.district ?? undefined,
      country: 'Türkiye',
      email: c.email || undefined,
    };
  }
}

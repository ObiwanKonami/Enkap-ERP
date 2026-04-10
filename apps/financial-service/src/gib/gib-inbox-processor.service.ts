import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { TenantDataSourceManager, TenantRoutingService } from '@enkap/database';
import { GibAuditService, GibAuditAction } from './gib-audit.service';
import { PoMatchService } from '../invoice/po-match.service';

/**
 * Gelen Zarf İşlemci Servisi
 *
 * incoming_envelopes tablosunda processed=false olan kayıtları işler.
 * Her 5 dakikada bir çalışır (GibInboxService'in senkron ACK döndürmesinden
 * bağımsız olarak arka planda işleme yapılır).
 *
 * Belge türüne göre yönlendirme:
 *  - INVOICE / ApplicationResponse  → invoices.commercial_status güncelle
 *  - RECEIPTADVICE                  → waybill-service HTTP event (e-İrsaliye)
 *  - Diğerleri                      → audit log + işaretle, manuel inceleme
 */
@Injectable()
export class GibInboxProcessorService {
  private readonly logger = new Logger(GibInboxProcessorService.name);

  constructor(
    private readonly tenantDataSourceManager: TenantDataSourceManager,
    private readonly tenantRoutingService: TenantRoutingService,
    private readonly auditService: GibAuditService,
    private readonly poMatchService: PoMatchService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processUnhandledEnvelopes(): Promise<void> {
    const tenantIds = await this.tenantRoutingService.findAllActiveIds();

    for (const tenantId of tenantIds) {
      await this.processTenantInbox(tenantId).catch((err) => {
        this.logger.error(
          `Tenant inbox işleme hatası: tenant=${tenantId} hata=${String(err)}`,
        );
      });
    }
  }

  private async processTenantInbox(tenantId: string): Promise<void> {
    const dataSource: DataSource = await this.tenantDataSourceManager.getDataSource(tenantId);

    // İşlenmemiş kayıtları al — FOR UPDATE SKIP LOCKED ile eş zamanlı cron çakışmasını önle
    const pending = await dataSource.query<Array<{
      id: string;
      gib_envelope_id: string;
      sender_alias: string;
      document_type: string;
      raw_payload: string;
    }>>(
      `SELECT id, gib_envelope_id, sender_alias, document_type, raw_payload
       FROM incoming_envelopes
       WHERE tenant_id = $1 AND processed = false
       ORDER BY received_at
       LIMIT 50
       FOR UPDATE SKIP LOCKED`,
      [tenantId],
    );

    if (!pending.length) return;

    this.logger.log(
      `İşlenecek zarf: tenant=${tenantId} adet=${pending.length}`,
    );

    for (const row of pending) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        // Satırı transaction içinde kilitle
        await queryRunner.query(
          `SELECT id FROM incoming_envelopes WHERE id = $1 FOR UPDATE`,
          [row.id],
        );

        await this.dispatchByType(tenantId, row, dataSource);

        await queryRunner.query(
          `UPDATE incoming_envelopes
           SET processed = true, processed_at = NOW()
           WHERE id = $1`,
          [row.id],
        );

        await queryRunner.commitTransaction();
      } catch (err) {
        await queryRunner.rollbackTransaction();
        this.logger.error(
          `Zarf işleme hatası: id=${row.id} hata=${String(err)}`,
        );
        await dataSource.query(
          `UPDATE incoming_envelopes
           SET processing_error = $1, last_attempt_at = NOW()
           WHERE id = $2`,
          [String(err), row.id],
        );
      } finally {
        await queryRunner.release();
      }
    }
  }

  private async dispatchByType(
    tenantId: string,
    row: { id: string; gib_envelope_id: string; sender_alias: string; document_type: string; raw_payload: string },
    dataSource: DataSource,
  ): Promise<void> {
    const docType = (row.document_type ?? '').toUpperCase();

    if (docType === 'APPLICATIONRESPONSE') {
      await this.handleApplicationResponse(tenantId, row, dataSource);
      return;
    }

    if (docType === 'RECEIPTADVICE') {
      await this.handleReceiptAdvice(tenantId, row, dataSource);
      return;
    }

    if (docType === 'INVOICE') {
      await this.handleIncomingInvoice(tenantId, row, dataSource);
      return;
    }

    this.logger.warn(
      `Bilinmeyen belge türü: ${row.document_type} envelope=${row.gib_envelope_id}`,
    );
  }

  // ─── INVOICE — Gelen e-Fatura oluşturma ──────────────────────────────────

  /**
   * Gelen e-Fatura XML'ini ayrıştırarak invoices tablosuna IN yönlü kayıt oluşturur.
   *
   * Akış:
   *  1. Base64 payload → XML çıkar
   *  2. UBL alanlarını regex ile parse et (UUID, numara, profil, tutarlar)
   *  3. Tedarikçiyi sender VKN ile crm_contacts'tan bul
   *  4. invoices + invoice_lines INSERT
   *  5. Gelen zarf kaydını gib_envelopes'a yaz
   */
  private async handleIncomingInvoice(
    tenantId: string,
    row: { id: string; gib_envelope_id: string; sender_alias: string; raw_payload: string },
    dataSource: DataSource,
  ): Promise<void> {
    const xml = this.extractXmlFromPayload(row.raw_payload);
    const parsed = this.parseUblInvoice(xml);

    // Aynı GİB UUID ile fatura zaten var mı? (idempotency)
    const existing = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM invoices WHERE gib_uuid = $1 AND tenant_id = $2 LIMIT 1`,
      [parsed.uuid, tenantId],
    );
    if (existing.length > 0) {
      this.logger.log(`Fatura zaten mevcut: gibUuid=${parsed.uuid} — atlandı`);
      return;
    }

    // Tedarikçiyi sender VKN/TCKN ile bul
    let vendorId: string | null = null;
    if (parsed.senderVkn) {
      const vendorRows = await dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM crm_contacts
         WHERE tenant_id = $1
           AND (vkn = $2 OR tckn = $2)
           AND type IN ('vendor', 'both')
         LIMIT 1`,
        [tenantId, parsed.senderVkn],
      );
      vendorId = vendorRows[0]?.id ?? null;
    }

    // Gelen zarf kaydını oluştur
    const envelopeId = randomUUID();
    await dataSource.query(
      `INSERT INTO gib_envelopes
         (id, tenant_id, type, direction, sender_alias, receiver_alias,
          document_ids, status, created_at, updated_at)
       VALUES ($1,$2,'SENDERENVELOPE','IN',$3,$4,$5,'SUCCESS',NOW(),NOW())
       ON CONFLICT DO NOTHING`,
      [envelopeId, tenantId, row.sender_alias, 'self', `{${parsed.uuid}}`],
    );

    // Fatura kaydını oluştur
    const invoiceId = randomUUID();
    const invoiceNumber = parsed.invoiceNumber || `GIB-${row.gib_envelope_id.slice(0, 8)}`;
    const commercialStatus = parsed.profileId === 'TICARIFATURA' ? 'BEKLIYOR' : null;

    await dataSource.query(
      `INSERT INTO invoices
         (id, tenant_id, gib_uuid, invoice_number, invoice_type, direction, status,
          counterparty_id, vendor_id, issue_date, due_date,
          subtotal, kdv_total, discount_total, total,
          currency, exchange_rate, envelope_uuid, profile_id, commercial_status,
          notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'E_FATURA','IN','DRAFT',
               $5,$5,$6,$7,
               $8,$9,0,$10,
               $11,$12,$13,$14,$15,
               $16,'system:gib-inbox',NOW(),NOW())`,
      [
        invoiceId, tenantId, parsed.uuid, invoiceNumber,
        vendorId,
        parsed.issueDate ?? new Date().toISOString().slice(0, 10),
        parsed.dueDate ?? null,
        parsed.subtotal ?? 0,
        parsed.kdvTotal ?? 0,
        parsed.total ?? 0,
        parsed.currency ?? 'TRY',
        parsed.exchangeRate ?? 1,
        envelopeId,
        parsed.profileId ?? 'TEMELFATURA',
        commercialStatus,
        `GİB'den otomatik alındı. Zarf: ${row.gib_envelope_id}`,
      ],
    );

    // Fatura satırlarını oluştur
    for (let i = 0; i < parsed.lines.length; i++) {
      const line = parsed.lines[i]!;
      await dataSource.query(
        `INSERT INTO invoice_lines
           (id, tenant_id, invoice_id, line_number, description,
            quantity, unit, unit_price, discount_pct, kdv_rate, kdv_amount, line_total)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10)`,
        [
          tenantId, invoiceId, i + 1, line.description,
          line.quantity, line.unit ?? 'C62', line.unitPrice,
          line.kdvRate, line.kdvAmount, line.lineTotal,
        ],
      );
    }

    // Audit log
    await this.auditService.log({
      tenantId,
      userId: 'system:gib-inbox',
      invoiceId,
      action: GibAuditAction.ENVELOPE_RECEIVED,
      details: {
        gibEnvelopeId: row.gib_envelope_id,
        senderAlias: row.sender_alias,
        invoiceNumber,
        gibUuid: parsed.uuid,
        profileId: parsed.profileId,
        total: parsed.total,
      },
    }).catch(() => undefined);

    // PO eşleştirme — gelen fatura için otomatik 3-way match
    const poMatch = await this.poMatchService.matchInvoiceToPo(invoiceId, tenantId)
      .catch((err) => {
        this.logger.warn(`PO eşleştirme hatası: fatura=${invoiceId} hata=${String(err)}`);
        return null;
      });

    this.logger.log(
      `Gelen fatura oluşturuldu: invoice=${invoiceId} no=${invoiceNumber} ` +
      `gibUuid=${parsed.uuid} profil=${parsed.profileId} toplam=${parsed.total}` +
      (poMatch ? ` poMatch=${poMatch.matchStatus} po=${poMatch.poNumber ?? '-'}` : ''),
    );
  }

  // ─── APPLICATIONRESPONSE — Kabul/Red işleme ──────────────────────────────

  /**
   * Gelen ApplicationResponse ile faturanın commercial_status'unu günceller.
   *
   * UBL ResponseCode: A=KABUL, RE=RED
   * Referans: ReferenceID = ilgili faturanın GİB UUID'si
   */
  private async handleApplicationResponse(
    tenantId: string,
    row: { id: string; gib_envelope_id: string; sender_alias: string; raw_payload: string },
    dataSource: DataSource,
  ): Promise<void> {
    const xml = this.extractXmlFromPayload(row.raw_payload);

    const responseCode = this.extractXmlTag(xml, 'ResponseCode');
    const referenceId = this.extractXmlTag(xml, 'ReferenceID');

    if (!referenceId) {
      this.logger.warn(`ApplicationResponse ReferenceID bulunamadı: envelope=${row.gib_envelope_id}`);
      return;
    }

    // A=KABUL, RE=RED
    const commercialStatus = responseCode === 'RE' ? 'RED' : 'KABUL';

    const result = await dataSource.query(
      `UPDATE invoices
       SET commercial_status = $1, updated_at = NOW()
       WHERE gib_uuid = $2 AND tenant_id = $3 AND direction = 'OUT'
       RETURNING id, invoice_number`,
      [commercialStatus, referenceId, tenantId],
    );

    if (!result.length) {
      this.logger.warn(
        `ApplicationResponse için fatura bulunamadı: referenceId=${referenceId} tenant=${tenantId}`,
      );
      return;
    }

    await this.auditService.log({
      tenantId,
      userId: 'system:gib-inbox',
      invoiceId: result[0].id,
      action: GibAuditAction.APPLICATION_RESPONSE,
      details: {
        gibEnvelopeId: row.gib_envelope_id,
        responseCode,
        commercialStatus,
        referenceId,
      },
    }).catch(() => undefined);

    this.logger.log(
      `ApplicationResponse işlendi: fatura=${result[0].invoice_number} ` +
      `yanıt=${commercialStatus} referans=${referenceId}`,
    );
  }

  // ─── RECEIPTADVICE — e-İrsaliye kabul/red ────────────────────────────────

  /**
   * Gelen ReceiptAdvice'ı waybills tablosunda ilgili irsaliyenin
   * durumunu günceller.
   *
   * NOT: waybill-service ayrı servis — burada sadece invoices ile ilişkili
   * waybill referansını güncelleriz, detaylı işlem waybill-service'e bırakılır.
   */
  private async handleReceiptAdvice(
    tenantId: string,
    row: { id: string; gib_envelope_id: string; sender_alias: string; raw_payload: string },
    dataSource: DataSource,
  ): Promise<void> {
    const xml = this.extractXmlFromPayload(row.raw_payload);

    const despatchRef = this.extractXmlTag(xml, 'DespatchDocumentReference');
    const responseCode = this.extractXmlTag(xml, 'ResponseCode') ?? 'KABUL';

    this.logger.log(
      `ReceiptAdvice işlendi: envelope=${row.gib_envelope_id} ` +
      `sender=${row.sender_alias} despatchRef=${despatchRef ?? '-'} yanıt=${responseCode}`,
    );

    // waybills tablosu bu serviste olmadığından (waybill-service'de),
    // gelen ReceiptAdvice bilgisini incoming_envelopes'ta processed=true olarak
    // işaretlemek yeterli. waybill-service ayrıca polling yapabilir.
    // İleride HTTP callback veya RabbitMQ event eklenebilir.
  }

  // ─── XML Yardımcı Metodlar ────────────────────────────────────────────────

  /**
   * Base64 ZIP payload'ından XML içeriğini çıkarır.
   * ZIP yoksa veya açılamazsa raw payload'ı XML olarak döner.
   */
  private extractXmlFromPayload(rawPayloadBase64: string): string {
    try {
      const zipBuffer = Buffer.from(rawPayloadBase64, 'base64');
      // Basit ZIP ayrıştırma — ZIP local file header: PK\x03\x04
      if (zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b) {
        const { inflateRawSync } = require('zlib') as typeof import('zlib');
        // ZIP local file header: 30 byte + filename length + extra length → compressed data
        const fnLen = zipBuffer.readUInt16LE(26);
        const exLen = zipBuffer.readUInt16LE(28);
        const dataOffset = 30 + fnLen + exLen;
        const compressedSize = zipBuffer.readUInt32LE(18);
        const compressed = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);
        const decompressed = inflateRawSync(compressed);
        return decompressed.toString('utf-8');
      }
      // ZIP değilse doğrudan base64-decoded string olarak dön
      return zipBuffer.toString('utf-8');
    } catch {
      // Çözümlenemezse raw string dön — parse hataları downstream'de yakalanır
      return Buffer.from(rawPayloadBase64, 'base64').toString('utf-8');
    }
  }

  /** UBL-TR Invoice XML'inden temel alanları çıkarır */
  private parseUblInvoice(xml: string): ParsedInvoice {
    const uuid = this.extractXmlTag(xml, 'UUID') ?? randomUUID();
    const invoiceNumber = this.extractXmlTag(xml, 'ID');
    const profileId = this.extractXmlTag(xml, 'ProfileID');
    const issueDate = this.extractXmlTag(xml, 'IssueDate');
    const dueDate = this.extractXmlTag(xml, 'DueDate') ?? this.extractXmlTag(xml, 'PaymentDueDate');
    const currency = this.extractXmlTag(xml, 'DocumentCurrencyCode') ?? 'TRY';
    const exchangeRateStr = this.extractXmlTag(xml, 'CalculationRate');
    const exchangeRate = exchangeRateStr ? parseFloat(exchangeRateStr) : 1;

    // Gönderen VKN/TCKN (AccountingSupplierParty)
    const supplierSection = xml.match(/<[^>]*AccountingSupplierParty[^>]*>([\s\S]*?)<\/[^>]*AccountingSupplierParty>/i);
    const senderVkn = supplierSection
      ? (this.extractXmlTag(supplierSection[1] ?? '', 'ID') ?? this.extractXmlTag(supplierSection[1] ?? '', 'CompanyID'))
      : undefined;

    // Tutarlar — LegalMonetaryTotal
    const monetarySection = xml.match(/<[^>]*LegalMonetaryTotal[^>]*>([\s\S]*?)<\/[^>]*LegalMonetaryTotal>/i);
    const subtotalStr = monetarySection ? this.extractXmlTag(monetarySection[1] ?? '', 'LineExtensionAmount') : undefined;
    const totalStr = monetarySection ? this.extractXmlTag(monetarySection[1] ?? '', 'PayableAmount') : undefined;

    // KDV toplamı — TaxTotal
    const taxSection = xml.match(/<[^>]*TaxTotal[^>]*>([\s\S]*?)<\/[^>]*TaxTotal>/i);
    const kdvTotalStr = taxSection ? this.extractXmlTag(taxSection[1] ?? '', 'TaxAmount') : undefined;

    // Satırları parse et
    const lines: ParsedInvoiceLine[] = [];
    const lineRegex = /<[^>]*InvoiceLine[^>]*>([\s\S]*?)<\/[^>]*InvoiceLine>/gi;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = lineRegex.exec(xml)) !== null) {
      const lineXml = lineMatch[1] ?? '';
      const desc = this.extractXmlTag(lineXml, 'Name') ?? this.extractXmlTag(lineXml, 'Description') ?? '';
      const qty = parseFloat(this.extractXmlTag(lineXml, 'InvoicedQuantity') ?? '1');
      const unit = lineXml.match(/unitCode="([^"]+)"/i)?.[1] ?? 'C62';
      const price = parseFloat(this.extractXmlTag(lineXml, 'PriceAmount') ?? '0');
      const lineTotal = parseFloat(this.extractXmlTag(lineXml, 'LineExtensionAmount') ?? '0');

      // Satır KDV
      const lineTaxSection = lineXml.match(/<[^>]*TaxTotal[^>]*>([\s\S]*?)<\/[^>]*TaxTotal>/i);
      const lineKdvAmount = parseFloat(
        lineTaxSection ? (this.extractXmlTag(lineTaxSection[1] ?? '', 'TaxAmount') ?? '0') : '0',
      );
      const lineKdvRate = parseFloat(
        lineTaxSection ? (this.extractXmlTag(lineTaxSection[1] ?? '', 'Percent') ?? '0') : '0',
      );

      lines.push({
        description: desc,
        quantity: qty,
        unit,
        unitPrice: price,
        kdvRate: lineKdvRate,
        kdvAmount: lineKdvAmount,
        lineTotal,
      });
    }

    return {
      uuid,
      invoiceNumber: invoiceNumber ?? undefined,
      profileId: profileId ?? undefined,
      issueDate: issueDate ?? undefined,
      dueDate: dueDate ?? undefined,
      currency,
      exchangeRate,
      senderVkn: senderVkn ?? undefined,
      subtotal: subtotalStr ? parseFloat(subtotalStr) : undefined,
      kdvTotal: kdvTotalStr ? parseFloat(kdvTotalStr) : undefined,
      total: totalStr ? parseFloat(totalStr) : undefined,
      lines,
    };
  }

  private extractXmlTag(xml: string, tagName: string): string | undefined {
    const match = new RegExp(`<[^:>]*:?${tagName}[^>]*>([^<]+)<`, 'i').exec(xml);
    return match?.[1]?.trim();
  }
}

// ─── Ayrıştırma tipleri ───────────────────────────────────────────────────

interface ParsedInvoice {
  uuid: string;
  invoiceNumber?: string;
  profileId?: string;
  issueDate?: string;
  dueDate?: string;
  currency: string;
  exchangeRate: number;
  senderVkn?: string;
  subtotal?: number;
  kdvTotal?: number;
  total?: number;
  lines: ParsedInvoiceLine[];
}

interface ParsedInvoiceLine {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  kdvRate: number;
  kdvAmount: number;
  lineTotal: number;
}

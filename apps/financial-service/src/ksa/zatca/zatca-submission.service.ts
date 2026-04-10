import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import type { ZatcaResponse } from './zatca-builder.service';

export { ZatcaResponse };

/**
 * ZATCA API Entegrasyon Servisi.
 *
 * ZATCA Phase 2 (Fazı 2) e-fatura API'si:
 *  - Reporting mode (B2C): faturayı ZATCA'ya bildir → REPORTED durumu
 *  - Clearance mode (B2B): ZATCA onayı + kriptografik damga → CLEARED durumu
 *
 * Ortam değişkenleri:
 *  ZATCA_API_URL  — ZATCA API taban URL'i (https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal)
 *  ZATCA_CSID     — Cryptographic Stamp ID (ZATCA onboarding'den alınır)
 *  ZATCA_SECRET   — CSID şifresi (Vault'tan inject)
 *
 * Env yoksa: stub mod — gerçek API çağrısı yapılmaz.
 *
 * Kimlik doğrulama: Basic Auth (CSID:Secret, Base64)
 */
@Injectable()
export class ZatcaSubmissionService {
  private readonly logger = new Logger(ZatcaSubmissionService.name);

  private readonly apiUrl = process.env.ZATCA_API_URL;
  private readonly csid   = process.env.ZATCA_CSID;
  private readonly secret = process.env.ZATCA_SECRET;

  /** true → stub mod */
  private get isStub(): boolean {
    return !this.apiUrl || !this.csid || !this.secret;
  }

  /**
   * B2C faturasını ZATCA'ya bildirir (Reporting Mode).
   *
   * Basit faturalar (B2C, ≤ 1000 SAR eşiği altındaki B2B'ler)
   * clearance gerekmez — sadece raporlanır.
   *
   * @param xml          ZATCA uyumlu UBL 2.1 XML
   * @param invoiceHash  SHA-256 hash (Base64) — ZatcaBuilderService.computeInvoiceHash()
   */
  async reportInvoice(xml: string, invoiceHash: string): Promise<ZatcaResponse> {
    if (this.isStub) {
      this.logger.warn(
        'ZATCA reporting servisi stub modda çalışıyor. ' +
        'ZATCA_API_URL, ZATCA_CSID, ZATCA_SECRET env değişkenlerini ayarlayın.',
      );

      return {
        status: 'REPORTED',
        warnings: ['Stub mod — gerçek ZATCA raporlaması yapılmadı'],
      };
    }

    try {
      const response = await fetch(`${this.apiUrl}/invoices/reporting/single`, {
        method: 'POST',
        headers: {
          ...this.buildAuthHeaders(),
          'Content-Type': 'application/json',
          'Clearance-Status': '0', // 0 = reporting
          'Accept-Version': 'V2',
        },
        body: JSON.stringify({
          invoice: Buffer.from(xml, 'utf8').toString('base64'),
          invoiceHash,
          uuid: this.extractUuid(xml),
        }),
        signal: AbortSignal.timeout(30_000),
      });

      return this.parseZatcaResponse(response);
    } catch (err) {
      this.logger.error(`ZATCA reporting hatası: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * B2B faturasını ZATCA'ya gönderir ve onay alır (Clearance Mode).
   *
   * ZATCA faturayı doğrular, kriptografik damga basar ve
   * clearedInvoice olarak geri döner. Bu XML müşteriye gönderilir.
   *
   * @param xml          ZATCA uyumlu UBL 2.1 XML
   * @param invoiceHash  SHA-256 hash (Base64)
   */
  async clearInvoice(xml: string, invoiceHash: string): Promise<ZatcaResponse> {
    if (this.isStub) {
      this.logger.warn(
        'ZATCA clearance servisi stub modda çalışıyor. ' +
        'ZATCA_API_URL, ZATCA_CSID, ZATCA_SECRET env değişkenlerini ayarlayın.',
      );

      return {
        status: 'CLEARED',
        clearedInvoice: xml, // Stub: orijinal XML döner
        warnings: ['Stub mod — gerçek ZATCA clearance yapılmadı'],
      };
    }

    try {
      const response = await fetch(`${this.apiUrl}/invoices/clearance/single`, {
        method: 'POST',
        headers: {
          ...this.buildAuthHeaders(),
          'Content-Type': 'application/json',
          'Clearance-Status': '1', // 1 = clearance
          'Accept-Version': 'V2',
        },
        body: JSON.stringify({
          invoice: Buffer.from(xml, 'utf8').toString('base64'),
          invoiceHash,
          uuid: this.extractUuid(xml),
        }),
        signal: AbortSignal.timeout(30_000),
      });

      return this.parseZatcaResponse(response);
    } catch (err) {
      this.logger.error(`ZATCA clearance hatası: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Fatura XML'inin SHA-256 hash'ini hesaplar (Base64 encoded).
   *
   * ZATCA zorunluluğu: her faturanın canonical XML hash'i hesaplanmalı.
   * Not: Production'da ZATCA'nın belirttiği XML canonicalization algoritması uygulanmalı.
   *
   * @param xml  Ham XML string
   */
  computeInvoiceHash(xml: string): string {
    return crypto
      .createHash('sha256')
      .update(xml, 'utf8')
      .digest('base64');
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  /** Basic Auth header'ı oluştur (CSID:Secret) */
  private buildAuthHeaders(): Record<string, string> {
    const credentials = Buffer.from(`${this.csid}:${this.secret}`).toString('base64');
    return { 'Authorization': `Basic ${credentials}` };
  }

  /** ZATCA API yanıtını parse eder */
  private async parseZatcaResponse(response: Response): Promise<ZatcaResponse> {
    const body = (await response.json()) as {
      reportingStatus?: string;
      clearanceStatus?: string;
      clearedInvoice?: string;
      validationResults?: {
        status?: string;
        warningMessages?: Array<{ message: string }>;
        errorMessages?: Array<{ message: string }>;
      };
    };

    const status = (body.reportingStatus ?? body.clearanceStatus ?? 'ERROR').toUpperCase();
    const isCleared   = status === 'CLEARED';
    const isReported  = status === 'REPORTED';

    if (!response.ok || (!isCleared && !isReported)) {
      const errors = body.validationResults?.errorMessages?.map((e) => e.message);
      this.logger.error(`ZATCA hata: ${JSON.stringify(errors ?? body)}`);

      return {
        status: 'ERROR',
        errors: errors ?? [`ZATCA API ${response.status}`],
      };
    }

    return {
      status: isCleared ? 'CLEARED' : 'REPORTED',
      clearedInvoice: body.clearedInvoice
        ? Buffer.from(body.clearedInvoice, 'base64').toString('utf8')
        : undefined,
      warnings: body.validationResults?.warningMessages?.map((w) => w.message),
    };
  }

  /** XML'den UUID alanını çıkarır */
  private extractUuid(xml: string): string {
    const match = xml.match(/<cbc:UUID>([^<]+)<\/cbc:UUID>/);
    return match?.[1] ?? '';
  }
}

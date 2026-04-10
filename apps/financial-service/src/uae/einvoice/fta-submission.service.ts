import { Injectable, Logger } from '@nestjs/common';

/** FTA gönderim yanıtı */
export interface FtaSubmissionResult {
  submissionId: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
}

/** FTA durum sorgulama yanıtı */
export interface FtaStatusResult {
  status: 'pending' | 'accepted' | 'rejected';
  errors?: string[];
}

/**
 * UAE FTA Portal Entegrasyon Servisi.
 *
 * UAE Federal Tax Authority e-fatura gönderim API'si.
 *
 * Ortam değişkenleri:
 *  UAE_FTA_API_URL       — FTA API taban URL'i
 *  UAE_FTA_CLIENT_ID     — OAuth2 istemci kimliği
 *  UAE_FTA_CLIENT_SECRET — OAuth2 istemci sırrı (Vault'tan inject)
 *
 * Env yoksa: stub mod — gerçek API çağrısı yapılmaz, sahte yanıt döner.
 *
 * Kimlik doğrulama: OAuth2 client_credentials akışı
 * Fatura formatı: Peppol BIS 3.0 UBL 2.1 XML
 */
@Injectable()
export class FtaSubmissionService {
  private readonly logger = new Logger(FtaSubmissionService.name);

  private readonly apiUrl    = process.env.UAE_FTA_API_URL;
  private readonly clientId  = process.env.UAE_FTA_CLIENT_ID;
  private readonly clientSecret = process.env.UAE_FTA_CLIENT_SECRET;

  /** true → stub mod (env yoksa) */
  private get isStub(): boolean {
    return !this.apiUrl || !this.clientId || !this.clientSecret;
  }

  /**
   * Faturayı FTA'ya gönderir.
   *
   * @param xml        Peppol BIS 3.0 UBL 2.1 XML
   * @param invoiceId  Yerel fatura kimliği (log için)
   */
  async submitInvoice(
    xml: string,
    invoiceId: string,
  ): Promise<FtaSubmissionResult> {
    if (this.isStub) {
      this.logger.warn(
        `FTA gönderim servisi stub modda çalışıyor (fatura=${invoiceId}). ` +
        'UAE_FTA_API_URL, UAE_FTA_CLIENT_ID, UAE_FTA_CLIENT_SECRET env değişkenlerini ayarlayın.',
      );

      return {
        submissionId: `STUB-${Date.now()}-${invoiceId.slice(0, 8)}`,
        status: 'pending',
        message: 'Stub mod — gerçek FTA gönderimi yapılmadı',
      };
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch(`${this.apiUrl}/einvoice/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Authorization': `Bearer ${token}`,
          'X-Invoice-ID': invoiceId,
        },
        body: xml,
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FTA API ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as {
        submissionId: string;
        status: string;
      };

      this.logger.log(
        `FTA gönderimi başarılı: fatura=${invoiceId} submissionId=${result.submissionId}`,
      );

      return {
        submissionId: result.submissionId,
        status: 'pending',
      };
    } catch (err) {
      this.logger.error(
        `FTA gönderim hatası (fatura=${invoiceId}): ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Gönderim durumunu sorgular.
   *
   * @param submissionId  FTA'dan alınan gönderim kimliği
   */
  async checkStatus(submissionId: string): Promise<FtaStatusResult> {
    if (this.isStub || submissionId.startsWith('STUB-')) {
      return {
        status: 'pending',
        errors: ['Stub mod — gerçek FTA durum sorgulaması yapılmadı'],
      };
    }

    try {
      const token = await this.getAccessToken();

      const response = await fetch(
        `${this.apiUrl}/einvoice/status/${submissionId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!response.ok) {
        throw new Error(`FTA durum API ${response.status}`);
      }

      const result = (await response.json()) as {
        status: 'pending' | 'accepted' | 'rejected';
        errors?: string[];
      };

      return {
        status: result.status,
        errors: result.errors,
      };
    } catch (err) {
      this.logger.error(
        `FTA durum sorgu hatası (submissionId=${submissionId}): ${(err as Error).message}`,
      );
      throw err;
    }
  }

  // ─── OAuth2 token yönetimi ─────────────────────────────────────────────────

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  /**
   * OAuth2 client_credentials akışı ile erişim token'ı alır.
   * Token önbelleğe alınır (süresi dolana kadar yeniden kullanılır).
   */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    const response = await fetch(`${this.apiUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     this.clientId!,
        client_secret: this.clientSecret!,
        scope:         'einvoice:submit einvoice:read',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`FTA OAuth2 hatası: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.cachedToken    = data.access_token;
    // Token süresi: expires_in saniye - 60 saniye güvenlik payı
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    return this.cachedToken;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

/**
 * GİB e-İrsaliye API İstemcisi (Mock)
 *
 * Production: GİB e-İrsaliye Web Servis adresi:
 *   https://earsivportal.efatura.gov.tr/earsiv-services/...
 *   (Test: https://earsivportaltest.efatura.gov.tr/...)
 *
 * Mock davranış:
 *   - %90 olasılıkla ONAYLANDI döner (5-20 ms gecikme)
 *   - %10 olasılıkla REDDEDILDI döner (validasyon hatası simülasyonu)
 *   - GIB_UUID her çağrıda yeni UUID
 *
 * Production geçişi için:
 *   1. GIB_API_URL env ayarla
 *   2. Java signing service entegre et
 *   3. sendToGib() → gerçek HTTP POST
 *   4. checkStatus() → GİB durum sorgulama endpoint'i
 */
@Injectable()
export class WaybillGibService {
  private readonly logger = new Logger(WaybillGibService.name);
  private readonly useMock: boolean;

  constructor() {
    this.useMock = !process.env['GIB_API_URL'];
    if (this.useMock) {
      this.logger.warn('GIB_API_URL tanımlı değil — mock GİB kullanılıyor');
    }
  }

  /**
   * İrsaliyeyi GİB'e gönder.
   * Returns: GİB tarafından atanan UUID.
   */
  async send(params: {
    waybillId:      string;
    waybillNumber:  string;
    signedXml:      string;
    tenantId:       string;
  }): Promise<{ gibUuid: string; envelopeId: string }> {
    if (this.useMock) {
      return this.mockSend(params);
    }

    // TODO: Gerçek GİB API çağrısı
    // const response = await this.httpService.post(GIB_API_URL, signedXml, {...});
    throw new Error('GİB production modu henüz aktif değil. GIB_API_URL env ile mock devre dışı bırakıldı.');
  }

  /**
   * GİB'ten belge durumunu sorgula.
   * Returns: 'ONAYLANDI' | 'REDDEDILDI' | 'BEKLEMEDE'
   */
  async checkStatus(gibUuid: string, tenantId: string): Promise<{
    status:   'ONAYLANDI' | 'REDDEDILDI' | 'BEKLEMEDE';
    code:     string;
    message:  string;
  }> {
    if (this.useMock) {
      return this.mockCheckStatus(gibUuid, tenantId);
    }

    // TODO: Gerçek GİB durum sorgusu
    throw new Error('GİB production modu henüz aktif değil.');
  }

  /**
   * GİB'te belge iptali.
   */
  async cancelOnGib(gibUuid: string, tenantId: string): Promise<void> {
    if (this.useMock) {
      this.logger.log(`[MOCK][${tenantId}] GİB iptal: ${gibUuid}`);
      return;
    }

    // TODO: Gerçek GİB iptal çağrısı
    throw new Error('GİB production modu henüz aktif değil.');
  }

  // ─── Mock implementasyonlar ──────────────────────────────────────────────────

  private async mockSend(params: {
    waybillId:     string;
    waybillNumber: string;
    tenantId:      string;
  }): Promise<{ gibUuid: string; envelopeId: string }> {
    // Gerçekçi gecikme simülasyonu
    await this.delay(50 + Math.random() * 150);

    const gibUuid    = randomUUID().toUpperCase();
    const envelopeId = randomUUID().toUpperCase();

    this.logger.log(
      `[MOCK][${params.tenantId}] GİB gönderim: ${params.waybillNumber} → UUID=${gibUuid}`,
    );

    return { gibUuid, envelopeId };
  }

  private async mockCheckStatus(
    gibUuid: string,
    tenantId: string,
  ): Promise<{ status: 'ONAYLANDI' | 'REDDEDILDI' | 'BEKLEMEDE'; code: string; message: string }> {
    await this.delay(20 + Math.random() * 80);

    // %85 onay, %10 ret, %5 beklemede
    const rand = Math.random();

    if (rand < 0.85) {
      this.logger.log(`[MOCK][${tenantId}] GİB onay: ${gibUuid}`);
      return { status: 'ONAYLANDI', code: '1220', message: 'e-İrsaliye Başarıyla İşlendi' };
    }

    if (rand < 0.95) {
      this.logger.warn(`[MOCK][${tenantId}] GİB ret: ${gibUuid}`);
      return {
        status:  'REDDEDILDI',
        code:    '1213',
        message: 'Alıcı VKN/TCKN bilgisi doğrulanamadı (simülasyon)',
      };
    }

    return { status: 'BEKLEMEDE', code: '1000', message: 'İşleme alındı, bekleniyor' };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

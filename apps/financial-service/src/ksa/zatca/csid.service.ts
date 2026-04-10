import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/** CSID onboarding için satıcı bilgileri */
export interface SellerInfo {
  /** Şirket ticaret unvanı */
  name: string;
  /** VAT Registration Number (15 hane) */
  vrn: string;
  /** Organizasyon birimi */
  orgUnit: string;
}

/**
 * ZATCA CSID (Cryptographic Stamp ID) Yönetimi.
 *
 * ZATCA Phase 2 onboarding akışı:
 *  1. CSR (Certificate Signing Request) üret — RSA-2048
 *  2. Compliance CSID: OTP ile ZATCA'ya CSR gönder → test CSID al
 *  3. Compliance test faturası gönder (10 senaryo)
 *  4. Production CSID: Compliance CSID ile production CSID al
 *
 * Ortam değişkeni:
 *  ZATCA_OTP — ZATCA portalından alınan tek kullanımlık onboarding kodu
 *
 * Not: Gerçek ZATCA onboarding ZATCA Developer Portal üzerinden yapılır.
 *  Bu servis local CSR üretimini sağlar; CSID işlemleri stub moddadır.
 */
@Injectable()
export class CsidService {
  private readonly logger = new Logger(CsidService.name);

  /**
   * RSA-2048 anahtar çifti ve CSR üretir.
   *
   * ZATCA CSR gereksinimleri:
   *  - RSA-2048 public key
   *  - Subject: CN=SellerName, OU=orgUnit, O=sellerName, C=SA
   *  - ZATCA'ya özel uzantılar (production'da OpenSSL config gerekli)
   *
   * @param sellerInfo  Satıcı bilgileri
   * @returns           PEM formatında CSR
   */
  generateCsr(sellerInfo: SellerInfo): string {
    this.logger.log(
      `ZATCA CSR üretiliyor: satıcı=${sellerInfo.name} VRN=${sellerInfo.vrn}`,
    );

    // RSA-2048 anahtar çifti üret
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    this.logger.log(
      `RSA-2048 anahtar çifti üretildi: satıcı=${sellerInfo.name}`,
    );

    // Gerçek CSR üretimi için openssl veya node-forge kütüphanesi gerekir.
    // Burada metadata içeren pseudo-CSR üretiyoruz.
    // TODO: Production'da ZATCA'nın belirlediği uzantılarla gerçek CSR üretimi yapılmalı.
    const csrPlaceholder = [
      '-----BEGIN CERTIFICATE REQUEST-----',
      '# ZATCA CSID Onboarding CSR',
      `# CN=${sellerInfo.name}`,
      `# OU=${sellerInfo.orgUnit}`,
      `# O=${sellerInfo.name}`,
      '# C=SA',
      `# SerialNumber=${sellerInfo.vrn}`,
      '# TODO: Gerçek CSR üretimi için node-forge veya openssl kullan',
      Buffer.from(publicKey).toString('base64').slice(0, 64),
      '-----END CERTIFICATE REQUEST-----',
    ].join('\n');

    void privateKey; // Private key güvenli depolamaya yazılmalı — burada stub

    return csrPlaceholder;
  }

  /**
   * ZATCA'dan Compliance CSID alır.
   *
   * Onboarding adım 1: OTP + CSR ile compliance test ortamında CSID alınır.
   * Bu CSID ile 10 adet compliance test faturası gönderilir.
   *
   * @param csr  PEM formatında CSR
   * @param otp  ZATCA portalından alınan OTP
   * @returns    Compliance CSID (Base64)
   *
   * TODO: ZATCA Compliance API entegrasyonu
   */
  async getComplianceCsid(csr: string, otp: string): Promise<string> {
    this.logger.warn(
      'ZATCA Compliance CSID stub modda. ' +
      'Gerçek onboarding için ZATCA Developer Portal kullanın.',
    );

    void csr;
    void otp;

    // Stub: simüle edilmiş CSID döner
    return Buffer.from(`COMPLIANCE_CSID_STUB_${Date.now()}`).toString('base64');
  }

  /**
   * Compliance CSID ile Production CSID alır.
   *
   * Onboarding adım 2: 10 compliance fatura testi başarılı olduktan sonra
   * production CSID alınır. Bu CSID ile gerçek faturalar imzalanır.
   *
   * @param complianceCsid  Compliance aşamasından alınan CSID
   * @returns               Production CSID (Base64)
   *
   * TODO: ZATCA Production CSID API entegrasyonu
   */
  async getProductionCsid(complianceCsid: string): Promise<string> {
    this.logger.warn(
      'ZATCA Production CSID stub modda. ' +
      'Compliance testleri tamamlandıktan sonra ZATCA Developer Portal üzerinden alın.',
    );

    void complianceCsid;

    // Stub: simüle edilmiş production CSID döner
    return Buffer.from(`PRODUCTION_CSID_STUB_${Date.now()}`).toString('base64');
  }
}

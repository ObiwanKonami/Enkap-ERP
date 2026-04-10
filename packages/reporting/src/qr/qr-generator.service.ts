import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';
import type { KdvBreakdown } from '../shared/types';

/**
 * GİB e-Fatura / e-Arşiv QR veri yapısı.
 * Karekod Standart Kılavuzu v1.2 (Kasım 2023) — Bölüm 3.1
 *
 * KDV satırları dinamiktir:
 *   kdvmatrah{oran}      → o orana ait matrah (örn. kdvmatrah20)
 *   hesaplanankdv{oran}  → hesaplanan KDV tutarı (örn. hesaplanankdv20)
 * Çoklu KDV oranı desteklenir (ör. hem %10 hem %20 aynı faturada).
 */
export interface GibInvoiceQrData {
  vkntckn: string;          // Satıcı VKN (10) veya TCKN (11)
  avkntckn: string;         // Alıcı VKN veya TCKN
  senaryo: string;          // ProfileID — EARSIVFATURA, TICARIFATURA, TEMELFATURA
  no: string;               // Belge numarası
  tarih: string;            // Kesim tarihi — yyyy-MM-dd
  ettn: string;             // Fatura GUID (UUID)
  tip: string;              // SATIS, IADE, TEVKIFAT vb.
  parabirimi: string;       // ISO 4217 — TRY, USD, EUR
  malhizmettoplam: string;  // KDV hariç toplam — "1000.00"
  vergidahil: string;       // KDV dahil toplam — "1200.00"
  odenecek: string;         // Ödenecek tutar — "1200.00"
  [key: string]: string;    // kdvmatrah{oran}, hesaplanankdv{oran} (dinamik)
}

/**
 * GİB e-SMM (Serbest Meslek Makbuzu) QR veri yapısı.
 * Karekod Standart Kılavuzu v1.2 — Bölüm 3.2
 */
export interface GibSmmQrData {
  vkntckn: string;         // Düzenleyici TCKN (11 hane)
  avkntckn: string;        // Alıcı VKN
  senaryo: 'ESMM';
  no: string;
  tarih: string;           // yyyy-MM-dd
  ettn: string;
  parabirimi: string;
  malhizmettoplam: string; // Brüt tutar (stopaj dahil)
  stopajoran: string;      // Stopaj oranı (%) — örn. "20"
  stopajtutar: string;     // Stopaj tutarı
  odenecek: string;        // Ödenecek = brüt - stopaj
}

/**
 * GİB e-Müstahsil Makbuzu QR veri yapısı.
 * Karekod Standart Kılavuzu v1.2 — Bölüm 3.3
 */
export interface GibMmQrData {
  vkntckn: string;         // Düzenleyici VKN
  avkntckn: string;        // Çiftçi TCKN
  senaryo: 'EMM';
  no: string;
  tarih: string;
  ettn: string;
  parabirimi: string;
  malhizmettoplam: string;
  stopajoran: string;
  stopajtutar: string;
  odenecek: string;
}

/**
 * GİB e-İrsaliye QR veri yapısı.
 * Karekod Standart Kılavuzu v1.2 — Bölüm 3.4
 * Tutar alanları bulunmaz — sadece kimlik + belge bilgileri.
 */
export interface GibIrsaliyeQrData {
  vkntckn: string;      // Gönderici VKN
  avkntckn: string;     // Alıcı VKN
  senaryo: 'EIRSALIYE';
  no: string;           // İrsaliye numarası
  tarih: string;        // Düzenleme tarihi — yyyy-MM-dd
  ettn: string;         // İrsaliye GUID
}

/**
 * GİB standartlarına uygun e-Belge QR kodu üreticisi.
 *
 * Desteklenen belge türleri:
 *  - e-Fatura (TICARIFATURA, TEMELFATURA, EARSIVFATURA)
 *  - e-SMM (ESMM)
 *  - e-Müstahsil Makbuzu (EMM)
 *  - e-İrsaliye (EIRSALIYE)
 *
 * Üretilen QR:
 *  - Format: PNG Buffer — PDFKit'e `doc.image(buffer, x, y, { width, height })` ile eklenir
 *  - Boyut: 120×120 piksel (üretim), PDF'de 90pt görüntüleme
 *  - Hata toleransı: M (orta)
 *  - İçerik: JSON.stringify(QrData)
 */
@Injectable()
export class QrGeneratorService {

  /**
   * GİB JSON formatında QR kod üretir (tüm belge türleri).
   * @returns PNG Buffer
   */
  async generateGibQr(
    data: GibInvoiceQrData | GibSmmQrData | GibMmQrData | GibIrsaliyeQrData,
  ): Promise<Buffer> {
    const json = JSON.stringify(data);
    return QRCode.toBuffer(json, {
      type: 'png',
      width: 120,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  /**
   * e-Fatura / e-Arşiv Fatura için QR veri nesnesi oluşturur.
   *
   * KDV matrahları kdvBreakdown dizisinden dinamik olarak hesaplanır:
   *   matrah = kdvTutar / (oran / 100)
   * Oran %0 ise dinamik alan eklenmez.
   */
  buildInvoiceQrData(params: {
    sellerVkn: string;
    buyerVknTckn: string;
    profileId: string;
    invoiceNumber: string;
    issueDate: string;         // yyyy-MM-dd
    ettn: string;
    invoiceTypeCode: string;   // SATIS, IADE, TEVKIFAT vb.
    currency: string;
    subtotalKurus: number;     // KDV hariç toplam (kuruş)
    kdvBreakdown: KdvBreakdown[];
    totalKurus: number;        // KDV dahil toplam (kuruş)
    payableKurus: number;      // Ödenecek tutar (kuruş)
  }): GibInvoiceQrData {
    const qr: GibInvoiceQrData = {
      vkntckn:         params.sellerVkn,
      avkntckn:        params.buyerVknTckn,
      senaryo:         params.profileId,
      no:              params.invoiceNumber,
      tarih:           params.issueDate,
      ettn:            params.ettn,
      tip:             params.invoiceTypeCode,
      parabirimi:      params.currency,
      malhizmettoplam: this.kurusToDecimalStr(params.subtotalKurus),
      vergidahil:      this.kurusToDecimalStr(params.totalKurus),
      odenecek:        this.kurusToDecimalStr(params.payableKurus),
    };

    // Her KDV oranı için dinamik alanlar (oran=0 atlanır — muafiyet satırlarında tutar yok)
    for (const kdv of params.kdvBreakdown) {
      if (kdv.rate === 0) continue;
      const matrahKurus = Math.round(kdv.amountKurus * 100 / kdv.rate);
      qr[`kdvmatrah${kdv.rate}`]     = this.kurusToDecimalStr(matrahKurus);
      qr[`hesaplanankdv${kdv.rate}`] = this.kurusToDecimalStr(kdv.amountKurus);
    }

    return qr;
  }

  /**
   * e-SMM (Serbest Meslek Makbuzu) için QR veri nesnesi oluşturur.
   */
  buildSmmQrData(params: {
    issuerTckn: string;
    buyerVkn: string;
    documentNumber: string;
    issueDate: string;               // yyyy-MM-dd
    ettn: string;
    currency: string;
    grossAmountKurus: number;        // Brüt tutar
    withholdingRatePct: number;      // Stopaj oranı (%)
    withholdingAmountKurus: number;  // Stopaj tutarı
    payableKurus: number;
  }): GibSmmQrData {
    return {
      vkntckn:         params.issuerTckn,
      avkntckn:        params.buyerVkn,
      senaryo:         'ESMM',
      no:              params.documentNumber,
      tarih:           params.issueDate,
      ettn:            params.ettn,
      parabirimi:      params.currency,
      malhizmettoplam: this.kurusToDecimalStr(params.grossAmountKurus),
      stopajoran:      String(params.withholdingRatePct),
      stopajtutar:     this.kurusToDecimalStr(params.withholdingAmountKurus),
      odenecek:        this.kurusToDecimalStr(params.payableKurus),
    };
  }

  /**
   * e-Müstahsil Makbuzu için QR veri nesnesi oluşturur.
   */
  buildMmQrData(params: {
    issuerVkn: string;
    farmerTckn: string;
    documentNumber: string;
    issueDate: string;               // yyyy-MM-dd
    ettn: string;
    currency: string;
    grossAmountKurus: number;
    withholdingRatePct: number;
    withholdingAmountKurus: number;
    payableKurus: number;
  }): GibMmQrData {
    return {
      vkntckn:         params.issuerVkn,
      avkntckn:        params.farmerTckn,
      senaryo:         'EMM',
      no:              params.documentNumber,
      tarih:           params.issueDate,
      ettn:            params.ettn,
      parabirimi:      params.currency,
      malhizmettoplam: this.kurusToDecimalStr(params.grossAmountKurus),
      stopajoran:      String(params.withholdingRatePct),
      stopajtutar:     this.kurusToDecimalStr(params.withholdingAmountKurus),
      odenecek:        this.kurusToDecimalStr(params.payableKurus),
    };
  }

  /**
   * e-İrsaliye için QR veri nesnesi oluşturur.
   * Tutar alanı bulunmaz — yalnızca kimlik ve belge bilgileri.
   */
  buildIrsaliyeQrData(params: {
    senderVkn: string;
    receiverVkn: string;
    waybillNumber: string;
    issueDate: string;  // yyyy-MM-dd
    ettn: string;
  }): GibIrsaliyeQrData {
    return {
      vkntckn:  params.senderVkn,
      avkntckn: params.receiverVkn,
      senaryo:  'EIRSALIYE',
      no:       params.waybillNumber,
      tarih:    params.issueDate,
      ettn:     params.ettn,
    };
  }

  private kurusToDecimalStr(kurus: number): string {
    return (kurus / 100).toFixed(2);
  }
}

import { Injectable } from '@nestjs/common';

/**
 * UAE FTA KDV oranları.
 *
 *  5       — Standart oran (%5) — çoğu mal ve hizmet
 *  0       — Sıfır oranlı — ihracat, belirli sağlık/eğitim hizmetleri
 *  exempt  — Muaf — konut kirasına yönelik mali hizmetler, lokal yolcu taşımacılığı
 */
export type UaeVatRate = 5 | 0 | 'exempt';

/** UAE VAT hesaplama sonucu */
export interface UaeVatResult {
  /** KDV hariç tutar (AED fils cinsinden) */
  netAmount: bigint;
  /** Hesaplanan VAT tutarı */
  vatAmount: bigint;
  /** KDV dahil toplam */
  grossAmount: bigint;
  /** Uygulanan VAT oranı */
  rate: UaeVatRate;
}

/** Dönem VAT işlem kaydı */
export interface UaeVatTransaction {
  netAmountAed: bigint;
  vatAmountAed: bigint;
  rate: UaeVatRate;
  /** true → çıktı KDV (satış), false → girdi KDV (alış) */
  isOutput: boolean;
}

/** UAE VAT dönem beyan özeti */
export interface UaeVatSummary {
  /** Çıktı VAT — satışlardan tahsil edilen */
  outputVat: bigint;
  /** Girdi VAT — alışlardan ödenen (iade hakkı) */
  inputVat: bigint;
  /** Net ödenecek VAT = outputVat - inputVat */
  netVatPayable: bigint;
  /** Standart oranlı (%5) net matrah */
  standardRatedNet: bigint;
  /** Sıfır oranlı matrah */
  zeroRatedNet: bigint;
  /** Muaf matrah */
  exemptNet: bigint;
}

/**
 * UAE Federal Tax Authority (FTA) KDV Hesaplama Motoru.
 *
 * VAT oranları (2018'den itibaren):
 *  - %5  standart oran (Türkiye'nin %20'sine karşılık)
 *  - %0  sıfır oranlı ihracat ve özel kategoriler
 *  - Muaf (VAT hesaplanmaz, girdi VAT iadesi yapılmaz)
 *
 * Para birimi: AED (Dirhem) — en küçük birim fils (1 AED = 100 fils)
 * Raporlama: AED cinsinden, iki ondalık basamak
 */
@Injectable()
export class UaeVatEngine {
  /**
   * Matrah + oran ile VAT hesaplar.
   *
   * @param netAmountAed  KDV hariç tutar (AED fils cinsinden)
   * @param rate          UAE VAT oranı
   */
  calculate(netAmountAed: bigint, rate: UaeVatRate): UaeVatResult {
    if (rate === 'exempt' || rate === 0) {
      return {
        netAmount:   netAmountAed,
        vatAmount:   0n,
        grossAmount: netAmountAed,
        rate,
      };
    }

    // %5 standart oran: vatAmount = netAmount * 5 / 100
    // Fils hassasiyeti: bigint tam sayı bölmesi — kuruşlama yapılmaz (FTA yuvarlama kuralı: her satır ayrı)
    const vatAmount   = (netAmountAed * BigInt(rate)) / 100n;
    const grossAmount = netAmountAed + vatAmount;

    return { netAmount: netAmountAed, vatAmount, grossAmount, rate };
  }

  /**
   * KDV dahil tutardan matrah ve KDV'yi geri hesaplar (iç yüzde).
   *
   * Formül: netAmount = grossAmount / (1 + rate/100)
   *
   * @param grossAmountAed  KDV dahil tutar (AED fils)
   * @param rate            UAE VAT oranı
   */
  calculateIncluded(grossAmountAed: bigint, rate: UaeVatRate): UaeVatResult {
    if (rate === 'exempt' || rate === 0) {
      return {
        netAmount:   grossAmountAed,
        vatAmount:   0n,
        grossAmount: grossAmountAed,
        rate,
      };
    }

    // netAmount = grossAmount * 100 / (100 + rate)
    const divisor   = 100n + BigInt(rate);
    const netAmount = (grossAmountAed * 100n) / divisor;
    const vatAmount = grossAmountAed - netAmount;

    return { netAmount, vatAmount, grossAmount: grossAmountAed, rate };
  }

  /**
   * Vergi dönemi VAT beyan özeti.
   *
   * FTA VAT Return'de yer alması gereken rakamlar:
   *  Box 1: Standart oranlı satışlar ve VAT'ı
   *  Box 3: Sıfır oranlı satışlar
   *  Box 4: Muaf satışlar
   *  Box 9: İndirilecek girdi VAT'ı
   *  Box 10: Net ödenecek VAT
   */
  calculatePeriodSummary(transactions: UaeVatTransaction[]): UaeVatSummary {
    let outputVat         = 0n;
    let inputVat          = 0n;
    let standardRatedNet  = 0n;
    let zeroRatedNet      = 0n;
    let exemptNet         = 0n;

    for (const tx of transactions) {
      if (tx.isOutput) {
        outputVat += tx.vatAmountAed;
      } else {
        inputVat += tx.vatAmountAed;
      }

      if (tx.rate === 5) {
        standardRatedNet += tx.netAmountAed;
      } else if (tx.rate === 0) {
        zeroRatedNet += tx.netAmountAed;
      } else {
        exemptNet += tx.netAmountAed;
      }
    }

    const netVatPayable = outputVat - inputVat;

    return {
      outputVat,
      inputVat,
      netVatPayable,
      standardRatedNet,
      zeroRatedNet,
      exemptNet,
    };
  }
}

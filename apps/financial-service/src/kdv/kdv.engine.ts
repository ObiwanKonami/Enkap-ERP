import { Injectable } from '@nestjs/common';
import type { KdvRate } from '@enkap/shared-types';
import { Money, sumMoney } from '../shared/money';
import type {
  KdvInput,
  KdvResult,
  KdvSummary,
  TevkifatKodu,
} from './kdv.types';
import { TEVKIFAT_ORANLARI } from './kdv.types';

/**
 * Türkiye KDV hesaplama motoru.
 *
 * Desteklenen senaryolar:
 *  - Standart KDV hesabı (%0, %1, %10, %20)
 *  - Tevkifatlı KDV (alıcı kesinti yapıyor)
 *  - İhracat istisnası (%0)
 *  - Çok oranlı fatura (her satır farklı oran)
 *
 * Yuvarlama kuralı:
 *  GİB: "Vergi tutarları, hesaplanan her oran için ayrı ayrı
 *  yukarıya yuvarlanır." → Math.round (bankacı yuvarlama değil)
 */
@Injectable()
export class KdvEngine {

  /**
   * Tek satır için KDV hesaplar.
   *
   * @param input Matrah + oran + tevkifat bilgisi
   */
  calculate(input: KdvInput): KdvResult {
    const { matrah, rate, tevkifat } = input;

    const kdvAmount = matrah.percentage(rate);

    let kdvPayable: Money;
    let kdvCollected: Money;

    if (tevkifat) {
      // Alıcı belirli oranı kendisi beyan eder, geri kalanını satıcıya öder
      const tevkifatAmount = kdvAmount.tevkifat(
        tevkifat.numerator,
        tevkifat.denominator,
      );
      kdvPayable = kdvAmount.subtract(tevkifatAmount); // Satıcıya ödenen
      kdvCollected = kdvPayable;
    } else {
      kdvPayable = kdvAmount;
      kdvCollected = kdvAmount;
    }

    return { matrah, rate, kdvAmount, kdvPayable, kdvCollected, tevkifat };
  }

  /**
   * Fatura için çok satırlı KDV özeti üretir.
   *
   * Her oran grubu ayrı hesaplanır (GİB fatura standardı).
   */
  summarize(inputs: KdvInput[]): KdvSummary {
    const lines = inputs.map((input) => this.calculate(input));
    const totalMatrah = sumMoney(lines.map((l) => l.matrah));
    const totalKdv = sumMoney(lines.map((l) => l.kdvAmount));
    const genelToplam = totalMatrah.add(totalKdv);

    return { lines, totalMatrah, totalKdv, genelToplam };
  }

  /**
   * Tevkifat kodundan KDV sonucu üretir.
   *
   * @param matrah KDV matrahı
   * @param kdvRate Uygulanacak KDV oranı
   * @param tevkifatKodu Hizmet kategorisi kodu
   */
  calculateWithTevkifat(
    matrah: Money,
    kdvRate: KdvRate,
    tevkifatKodu: TevkifatKodu,
  ): KdvResult {
    const tevkifat = TEVKIFAT_ORANLARI[tevkifatKodu];
    return this.calculate({ matrah, rate: kdvRate, tevkifat });
  }

  /**
   * İhracat faturası — KDV sıfır, istisna kodu ile.
   */
  calculateExport(matrah: Money): KdvResult {
    return this.calculate({ matrah, rate: 0 });
  }

  /**
   * KDV dahil tutardan matrah ve KDV'yi geri hesaplar.
   * (İçyüzde hesaplama — fiyata KDV dahilse kullanılır)
   *
   * Formül: Matrah = KDV Dahil Fiyat / (1 + KDV Oranı / 100)
   */
  extractKdvFromIncluded(kdvDahilTutar: Money, rate: KdvRate): KdvResult {
    if (rate === 0) {
      return this.calculate({ matrah: kdvDahilTutar, rate: 0 });
    }

    const divisor = 1 + rate / 100;
    const matrahDecimal = kdvDahilTutar.toDecimal() / divisor;
    const matrah = Money.of(matrahDecimal);

    return this.calculate({ matrah, rate });
  }

  /**
   * KDV Beyannamesi için dönem özetini döndürür.
   * Oran gruplarına göre matrah ve KDV toplamları.
   */
  generatePeriodSummary(
    allLines: KdvInput[],
  ): Map<KdvRate, { matrah: Money; kdv: Money }> {
    const grouped = new Map<KdvRate, KdvInput[]>();

    for (const line of allLines) {
      const existing = grouped.get(line.rate) ?? [];
      grouped.set(line.rate, [...existing, line]);
    }

    const result = new Map<KdvRate, { matrah: Money; kdv: Money }>();

    for (const [rate, lines] of grouped) {
      const summary = this.summarize(lines);
      result.set(rate, {
        matrah: summary.totalMatrah,
        kdv: summary.totalKdv,
      });
    }

    return result;
  }
}

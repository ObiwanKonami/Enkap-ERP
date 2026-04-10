import { Injectable } from '@nestjs/common';

/** Zakat hesaplama için finansal veriler */
export interface ZakatFinancialData {
  /** Öz kaynaklar (SAR halalah) */
  equity: bigint;
  /** Net kâr (SAR halalah) */
  netProfit: bigint;
  /** Uzun vadeli borçlar (SAR halalah) */
  longTermDebt: bigint;
  /** Duran varlıklar / sabit kıymetler (SAR halalah) */
  fixedAssets: bigint;
  /**
   * Nisap eşiği (SAR halalah).
   * 2025 değeri: ~23,000 SAR (85 gram altın × ~270 SAR/gram)
   * Yıllık güncellenir — ZATCA duyurularını takip edin.
   */
  nisapSar: bigint;
}

/** Zakat hesaplama sonucu */
export interface ZakatResult {
  /** Zakat matrahı (SAR halalah) */
  base: bigint;
  /** Ödenecek zakat miktarı (SAR halalah) */
  due: bigint;
  /** Nisap eşiği aşıldı mı */
  nisapMet: boolean;
  /** Uygulanan oran: %2.5 */
  rate: number;
  /** Açıklama */
  description: string;
}

/**
 * Zakat Hesaplama Motoru.
 *
 * Zakat: İslami vergi hukuku — yıllık servet üzerinden %2.5 oranında ödenir.
 * Suudi Arabistan'da şirketlere zorunlu uygulanır.
 *
 * Hesaplama yöntemi (ZATCA standardı):
 *  Matrah = Öz kaynaklar + Net kâr + Uzun vadeli borçlar - Duran varlıklar
 *
 * Nisap (muafiyet eşiği):
 *  85 gram altın değeri (SAR cinsinden yıllık belirlenir)
 *  2025 yaklaşık: 23,000 SAR
 *
 * Oran: %2.5 (sabit — İslami hukuk standardı)
 *
 * Para birimi: SAR (halalah cinsinden) — 1 SAR = 100 halalah
 */
@Injectable()
export class ZakatCalculator {
  /** Zakat oranı: %2.5 = 25/1000 */
  private readonly ZAKAT_RATE_NUMERATOR   = 25n;
  private readonly ZAKAT_RATE_DENOMINATOR = 1000n;

  /**
   * Zakat matrahını hesaplar.
   *
   * Formül: Matrah = Öz kaynaklar + Net kâr + Uzun vadeli borçlar - Duran varlıklar
   *
   * Negatif matrah → 0 (zarar durumunda zakat ödenmez)
   *
   * @param data  Finansal veriler
   */
  calculateBase(data: ZakatFinancialData): bigint {
    const gross = data.equity + data.netProfit + data.longTermDebt;
    const net   = gross - data.fixedAssets;

    // Negatif matrah sıfır sayılır
    return net > 0n ? net : 0n;
  }

  /**
   * Ödenecek zakat miktarını hesaplar.
   *
   * Kural: matrah > nisap ise matrah × %2.5, aksi halde 0
   *
   * @param base      Zakat matrahı (SAR halalah)
   * @param nisapSar  Nisap eşiği (SAR halalah) — ZakatFinancialData.nisapSar
   */
  calculateDue(base: bigint, nisapSar?: bigint): bigint {
    // Nisap kontrolü: 2025 varsayılan = 23,000 SAR = 2,300,000 halalah
    const nisap = nisapSar ?? 2_300_000n;

    if (!this.isNisapMet(base, nisap)) {
      return 0n;
    }

    // Zakat = matrah × 25/1000 (= %2.5)
    return (base * this.ZAKAT_RATE_NUMERATOR) / this.ZAKAT_RATE_DENOMINATOR;
  }

  /**
   * Nisap eşiğinin aşılıp aşılmadığını kontrol eder.
   *
   * @param base      Zakat matrahı (SAR halalah)
   * @param nisapSar  Nisap eşiği (SAR halalah)
   */
  isNisapMet(base: bigint, nisapSar: bigint): boolean {
    return base >= nisapSar;
  }

  /**
   * Tam zakat hesaplama — matrah + nisap kontrolü + tutar.
   *
   * @param data  Finansal veriler (nisapSar dahil)
   */
  calculate(data: ZakatFinancialData): ZakatResult {
    const base     = this.calculateBase(data);
    const nisapMet = this.isNisapMet(base, data.nisapSar);
    const due      = nisapMet ? this.calculateDue(base, data.nisapSar) : 0n;

    // Açıklama (Türkçe — iş mantığı)
    let description: string;
    if (!nisapMet) {
      description =
        `Zakat matrahı (${this.sarFormat(base)}) nisap eşiğinin ` +
        `(${this.sarFormat(data.nisapSar)}) altında — zakat ödenmez.`;
    } else {
      description =
        `Zakat matrahı: ${this.sarFormat(base)} — ` +
        `Oran: %2.5 — Ödenecek zakat: ${this.sarFormat(due)}`;
    }

    return {
      base,
      due,
      nisapMet,
      rate: 2.5,
      description,
    };
  }

  // ─── Özel yardımcı metodlar ───────────────────────────────────────────────

  /** Halalah → SAR ondalık string (görüntüleme) */
  private sarFormat(halalah: bigint): string {
    const whole = halalah / 100n;
    const frac  = halalah % 100n;
    return `${whole.toLocaleString('ar-SA')}.${String(frac).padStart(2, '0')} SAR`;
  }
}

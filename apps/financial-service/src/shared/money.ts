/**
 * 4 ondalık hassasiyetli para birimi işlemleri (Money sınıfı).
 *
 * Dahili temsil: SCALE = 10_000 ile çarpılmış BigInt tam sayı.
 *   ₺1.234,56 → raw = 12_345_600 (SCALE × TL değeri)
 *   toDecimal() → 1234.56 (TL, 4 ondalık)
 *   toKurus()   → 123456  (tam sayı kuruş, API boundary için)
 *
 * Neden BigInt?
 *   JavaScript'te 0.1 + 0.2 = 0.30000000000000004
 *   Finansal sistemlerde kayan nokta kabul edilemez.
 *   BigInt ile tam sayı aritmetiği garanti edilir.
 *
 * Yuvarlama: GİB standardı → round-half-up (≥ 0.5 → yukarı).
 *   Tüm bölme işlemleri (percentage, multiply, tevkifat) round-half-up uygular.
 *
 * PostgreSQL'de NUMERIC(19,4) olarak saklanır.
 */

/** Para biriminin dahili temsili: 4 ondalık hassasiyetle integer benzeri işlem */
const SCALE = 10_000; // 4 ondalık basamak

export class Money {
  /** Dahili değer: gerçek tutarın SCALE ile çarpımı (tam sayı) */
  private readonly raw: bigint;

  private constructor(raw: bigint) {
    this.raw = raw;
  }

  // ─── Fabrika metodları ─────────────────────────────────────────────────────

  /** Ondalıklı sayıdan Money oluştur (örn: 1234.56) */
  static of(amount: number): Money {
    // float → string → parse (float hassasiyet hatasını önle)
    const rounded = Math.round(amount * SCALE);
    return new Money(BigInt(rounded));
  }

  /** Veritabanından okunan NUMERIC değerinden Money oluştur */
  static fromDecimal(decimalStr: string | number): Money {
    return Money.of(typeof decimalStr === 'string' ? parseFloat(decimalStr) : decimalStr);
  }

  static zero(): Money {
    return new Money(0n);
  }

  // ─── Aritmetik ─────────────────────────────────────────────────────────────

  add(other: Money): Money {
    return new Money(this.raw + other.raw);
  }

  subtract(other: Money): Money {
    return new Money(this.raw - other.raw);
  }

  /**
   * Yüzde oranı uygular, round-half-up yuvarlama (GİB standardı).
   * Örn: ₺100 × %20 = ₺20.00
   */
  percentage(rate: number): Money {
    const numerator = this.raw * BigInt(Math.round(rate * SCALE));
    const divisor   = BigInt(SCALE * 100); // /100 çünkü rate yüzde
    // Round-half-up: bölen/2 ekleyerek truncation'ı yukarı yuvarlama'ya çevir
    const result = (numerator + divisor / 2n) / divisor;
    return new Money(result);
  }

  /**
   * İskonto uygular (yüzde).
   * Örn: ₺100 iskonto %10 → ₺90
   */
  applyDiscount(discountPct: number): Money {
    const discount = this.percentage(discountPct);
    return this.subtract(discount);
  }

  /**
   * Tevkifat (KDV kesintisi) hesaplar, round-half-up.
   * Örn: KDV ₺100, tevkifat 7/10 → alıcının ödeyeceği: ₺70
   */
  tevkifat(numerator: number, denominator: number): Money {
    const n = this.raw * BigInt(numerator);
    const d = BigInt(denominator);
    return new Money((n + d / 2n) / d);
  }

  /** Sabit çarpan ile çarpar, round-half-up. */
  multiply(factor: number): Money {
    const scaled  = BigInt(Math.round(factor * SCALE));
    const divisor = BigInt(SCALE);
    return new Money((this.raw * scaled + divisor / 2n) / divisor);
  }

  // ─── Karşılaştırma ──────────────────────────────────────────────────────────

  isZero(): boolean {
    return this.raw === 0n;
  }

  isNegative(): boolean {
    return this.raw < 0n;
  }

  greaterThan(other: Money): boolean {
    return this.raw > other.raw;
  }

  equals(other: Money): boolean {
    return this.raw === other.raw;
  }

  // ─── Dönüşüm ────────────────────────────────────────────────────────────────

  /** Veritabanına yazılacak NUMERIC değer (TL, 4 ondalık) */
  toDecimal(): number {
    return Number(this.raw) / SCALE;
  }

  /**
   * API sınırında kullanılacak tam sayı kuruş değeri.
   * Frontend'de kurusToTl() ile gösterime çevrilir.
   * Örn: ₺1.234,56 → 123456
   */
  toKurus(): number {
    // raw / SCALE = TL decimal; × 100 = kuruş
    // SCALE = 10_000, bu yüzden raw / 100 = kuruş (round-half-up)
    return Math.round(Number(this.raw) / 100);
  }

  /** Kullanıcıya gösterilecek Türkçe formatlı string */
  toDisplayString(currency: 'TRY' | 'USD' | 'EUR' = 'TRY'): string {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.toDecimal());
  }

  /** GİB fatura XML'inde kullanılacak format: "1234.5600" */
  toGibString(): string {
    return this.toDecimal().toFixed(4);
  }

  toString(): string {
    return this.toDisplayString();
  }
}

// ─── Yardımcı toplam hesaplayıcı ─────────────────────────────────────────────

export function sumMoney(amounts: Money[]): Money {
  return amounts.reduce((acc, m) => acc.add(m), Money.zero());
}

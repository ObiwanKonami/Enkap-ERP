import { Injectable } from '@nestjs/common';

/**
 * UAE Tax Registration Number (TRN) doğrulama.
 *
 * TRN: UAE Federal Tax Authority tarafından verilen vergi kimlik numarası.
 *
 * Format: 15 haneli sayısal değer
 * Doğrulama: Luhn variant algoritması
 *
 * Görüntüleme formatı: 100-123-456-789012 (3-3-3-6 gruplar)
 * Örnek geçerli TRN: 100123456789012
 */
@Injectable()
export class TrnValidator {
  private readonly TRN_LENGTH = 15;

  /**
   * TRN doğrular.
   *
   * Kural 1: 15 haneli sayısal değer
   * Kural 2: Luhn variant — kontrol basamağı doğrulaması
   *
   * @param trn  Doğrulanacak TRN (boşluksuz, sadece rakam)
   */
  validate(trn: string): boolean {
    const cleaned = trn.replace(/[\s\-]/g, '');

    if (!/^\d{15}$/.test(cleaned)) {
      return false;
    }

    return this.verifyLuhnVariant(cleaned);
  }

  /**
   * TRN'yi UAE FTA görüntüleme formatına dönüştürür.
   * Örnek: 100123456789012 → 100-123-456-789012
   *
   * @param trn  15 haneli TRN (ham)
   */
  format(trn: string): string {
    const cleaned = trn.replace(/[\s\-]/g, '');

    if (cleaned.length !== this.TRN_LENGTH) {
      return trn;
    }

    // 3-3-3-6 gruplar
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
  }

  /**
   * UAE FTA TRN Luhn variant doğrulaması.
   *
   * Standart Luhn algoritması ile benzer, ancak UAE TRN'de
   * 15. basamak kontrol basamağı olarak kullanılır.
   *
   * Algoritma:
   *  1. İlk 14 basamak üzerinde Luhn toplamını hesapla
   *  2. (10 - (toplam mod 10)) mod 10 = beklenen kontrol basamağı
   *  3. 15. basamak ile karşılaştır
   */
  private verifyLuhnVariant(trn: string): boolean {
    const digits = trn.split('').map(Number);
    const checkDigit = digits[14]!;

    let sum = 0;

    // İlk 14 basamak üzerinde ağırlıklı toplam
    for (let i = 0; i < 14; i++) {
      let d = digits[i]!;
      // Çift pozisyon (0, 2, 4...) → 2 ile çarp
      if (i % 2 === 0) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
    }

    const expected = (10 - (sum % 10)) % 10;
    return expected === checkDigit;
  }
}

/**
 * Standalone fonksiyonlar (injectable dışı kullanım için)
 */
export function validateTrn(trn: string): boolean {
  const validator = new TrnValidator();
  return validator.validate(trn);
}

export function formatTrn(trn: string): string {
  const validator = new TrnValidator();
  return validator.format(trn);
}

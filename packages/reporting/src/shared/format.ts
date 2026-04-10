/**
 * Türkçe formatlama yardımcıları — raporlama paketi içinde kullanılır.
 * (apps/web/src/lib/format.ts'ın server-side eşdeğeri)
 */

/**
 * Kuruşu TL formatında string'e çevirir: 12345 → "123,45 TL"
 * Not: ₺ (U+20BA) DejaVu fontunda bulunmadığından "TL" suffix kullanılır.
 */
export function formatKurus(kurus: number): string {
  const tl = kurus / 100;
  return (
    new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(tl) + ' TL'
  );
}

/** Tarihi Türkçe GİB formatında string'e çevirir: "30.03.2026" */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day:   '2-digit',
    month: '2-digit',
    year:  'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(date);
}

/** Sayıyı Türkçe formatlar: 1234.56 → "1.234,56" */
export function formatNumber(
  value: number,
  fractionDigits = 2,
): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Kuruşu TL olarak sayı string'i verir: 12345 → "123,45" */
export function formatKurusAmount(kurus: number): string {
  return formatNumber(kurus / 100, 2);
}

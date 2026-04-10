/**
 * Türkiye formatlarına uygun yardımcı fonksiyonlar.
 *
 * Para: ₺1.234,56  (Intl.NumberFormat 'tr-TR')
 * Tarih: 15.06.2024  (GİB fatura standardı — dd.MM.yyyy)
 * Saat dilimi: Europe/Istanbul (UTC+3, DST yok)
 */

const CURRENCY_FORMATTER = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER_FORMATTER = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const QTY_FORMATTER = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Istanbul',
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
});

/** ₺1.234,56 */
export function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(amount);
}

/** 1.234 */
export function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

/** 15.06.2024 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return DATE_FORMATTER.format(d);
}

/** 15.06.2024 14:30 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return DATETIME_FORMATTER.format(d);
}

/**
 * Miktar formatlayıcı — Türkçe locale (binlik nokta, ondalık virgül).
 * Trailing zero'ları atar: "5.000" → "5", "2.500" → "2,5", "1234.5" → "1.234,5"
 */
export function fmtQty(value: number | string): string {
  return QTY_FORMATTER.format(Number(value));
}

/** Kuruş → TL (bigint kuruş hesaplamaları için) */
export function kurusToTl(kurus: number | bigint): number {
  return Number(kurus) / 100;
}

/** Kısa sayı: 1.250.000 → 1,25M */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2).replace('.', ',')}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace('.', ',')}B`;
  }
  return NUMBER_FORMATTER.format(value);
}

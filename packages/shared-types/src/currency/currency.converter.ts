import type { SupportedCurrency, MoneyAmount, ExchangeRate } from './multi-currency.types';
import { CURRENCY_SYMBOLS } from './multi-currency.types';

/**
 * Para birimi formatlama yardımcıları.
 *
 * Kullanım:
 *  formatMoney(1234567, 'TRY')  → '₺12.345,67'
 *  formatMoney(100, 'USD')      → '$1,00'
 */

/**
 * Kuruş/cent cinsinden tutarı insan okunabilir formata çevirir.
 * Türkçe locale kullanır: nokta binlik ayırıcı, virgül ondalık.
 */
export function formatMoney(
  amountInSmallestUnit: number,
  currency: SupportedCurrency,
  locale = 'tr-TR',
): string {
  const major = amountInSmallestUnit / 100;
  const symbol = CURRENCY_SYMBOLS[currency];

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);

  // TRY: ₺1.234,56 — diğerleri: $1.234,56
  return `${symbol}${formatted}`;
}

/**
 * MoneyAmount nesnesini TRY formatında gösterir.
 */
export function formatMoneyAmount(money: MoneyAmount): string {
  return formatMoney(money.amountTry, 'TRY');
}

/**
 * MoneyAmount'un orijinal para birimindeki tutarını formatlar.
 */
export function formatOriginalAmount(money: MoneyAmount): string {
  return formatMoney(money.amount, money.currency);
}

/**
 * Kur bilgisini olmayan bir ExchangeRate nesnesi oluşturur (1:1).
 * TRY işlemleri için kullanılır.
 */
export function tryIdentityRate(): ExchangeRate {
  return {
    currency: 'TRY',
    rateToTry: 1,
    source:    'MANUAL',
    date:      new Date().toISOString().slice(0, 10),
    fetchedAt: new Date(),
  };
}

/**
 * İki MoneyAmount'u TRY bazında toplar.
 */
export function addMoneyAmounts(a: MoneyAmount, b: MoneyAmount): number {
  return a.amountTry + b.amountTry;
}

/**
 * Kuruş cinsinden tutarı büyük birime çevirir (görüntüleme amaçlı).
 */
export function toMajorUnit(amountInSmallestUnit: number): number {
  return amountInSmallestUnit / 100;
}

/**
 * Büyük birimden kuruşa çevirir (depolama amaçlı).
 */
export function toSmallestUnit(majorAmount: number): number {
  return Math.round(majorAmount * 100);
}

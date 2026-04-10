import type { SupportedCurrency, MoneyAmount, ExchangeRate } from './multi-currency.types';
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
export declare function formatMoney(amountInSmallestUnit: number, currency: SupportedCurrency, locale?: string): string;
/**
 * MoneyAmount nesnesini TRY formatında gösterir.
 */
export declare function formatMoneyAmount(money: MoneyAmount): string;
/**
 * MoneyAmount'un orijinal para birimindeki tutarını formatlar.
 */
export declare function formatOriginalAmount(money: MoneyAmount): string;
/**
 * Kur bilgisini olmayan bir ExchangeRate nesnesi oluşturur (1:1).
 * TRY işlemleri için kullanılır.
 */
export declare function tryIdentityRate(): ExchangeRate;
/**
 * İki MoneyAmount'u TRY bazında toplar.
 */
export declare function addMoneyAmounts(a: MoneyAmount, b: MoneyAmount): number;
/**
 * Kuruş cinsinden tutarı büyük birime çevirir (görüntüleme amaçlı).
 */
export declare function toMajorUnit(amountInSmallestUnit: number): number;
/**
 * Büyük birimden kuruşa çevirir (depolama amaçlı).
 */
export declare function toSmallestUnit(majorAmount: number): number;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMoney = formatMoney;
exports.formatMoneyAmount = formatMoneyAmount;
exports.formatOriginalAmount = formatOriginalAmount;
exports.tryIdentityRate = tryIdentityRate;
exports.addMoneyAmounts = addMoneyAmounts;
exports.toMajorUnit = toMajorUnit;
exports.toSmallestUnit = toSmallestUnit;
const multi_currency_types_1 = require("./multi-currency.types");
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
function formatMoney(amountInSmallestUnit, currency, locale = 'tr-TR') {
    const major = amountInSmallestUnit / 100;
    const symbol = multi_currency_types_1.CURRENCY_SYMBOLS[currency];
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
function formatMoneyAmount(money) {
    return formatMoney(money.amountTry, 'TRY');
}
/**
 * MoneyAmount'un orijinal para birimindeki tutarını formatlar.
 */
function formatOriginalAmount(money) {
    return formatMoney(money.amount, money.currency);
}
/**
 * Kur bilgisini olmayan bir ExchangeRate nesnesi oluşturur (1:1).
 * TRY işlemleri için kullanılır.
 */
function tryIdentityRate() {
    return {
        currency: 'TRY',
        rateToTry: 1,
        source: 'MANUAL',
        date: new Date().toISOString().slice(0, 10),
        fetchedAt: new Date(),
    };
}
/**
 * İki MoneyAmount'u TRY bazında toplar.
 */
function addMoneyAmounts(a, b) {
    return a.amountTry + b.amountTry;
}
/**
 * Kuruş cinsinden tutarı büyük birime çevirir (görüntüleme amaçlı).
 */
function toMajorUnit(amountInSmallestUnit) {
    return amountInSmallestUnit / 100;
}
/**
 * Büyük birimden kuruşa çevirir (depolama amaçlı).
 */
function toSmallestUnit(majorAmount) {
    return Math.round(majorAmount * 100);
}

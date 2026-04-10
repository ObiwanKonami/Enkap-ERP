"use strict";
/**
 * Çoklu Para Birimi Tipleri.
 *
 * Desteklenen para birimleri:
 *  TRY — Türk Lirası (ana para birimi — tüm tutarlar TRY bazında saklanır)
 *  USD — Amerikan Doları
 *  EUR — Euro
 *  GBP — İngiliz Sterlini
 *  SAR — Suudi Arabistan Riyali (MENA genişlemesi)
 *  AED — Birleşik Arap Emirlikleri Dirhemi
 *
 * Saklama prensibi:
 *  Tüm tutarlar veritabanında TRY olarak saklanır (kuruş cinsinden bigint).
 *  Kur bilgisi fatura satırında ayrıca tutulur (exchange_rate sütunu).
 *  Raporlama: TRY bazında yapılır.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TCMB_CURRENCY_CODES = exports.CURRENCY_SYMBOLS = void 0;
/** Para birimi sembolleri */
exports.CURRENCY_SYMBOLS = {
    TRY: '₺',
    USD: '$',
    EUR: '€',
    GBP: '£',
    SAR: '﷼',
    AED: 'د.إ',
};
/** TCMB kur API anahtarı */
exports.TCMB_CURRENCY_CODES = {
    USD: 'USD',
    EUR: 'EUR',
    GBP: 'GBP',
    SAR: 'SAR',
    AED: 'AED',
};

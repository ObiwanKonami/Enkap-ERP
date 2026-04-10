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
export type SupportedCurrency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'SAR' | 'AED';
export interface ExchangeRate {
    /** Para birimi kodu */
    currency: SupportedCurrency;
    /** TRY karşılığı (1 birim yabancı para = N TRY) */
    rateToTry: number;
    /** Kaynak: TCMB günlük kur */
    source: 'TCMB' | 'MANUAL';
    /** Kur tarihi */
    date: string;
    fetchedAt: Date;
}
export interface MoneyAmount {
    /** Orijinal para birimindeki tutar (kuruş / cent cinsinden — en küçük birim) */
    amount: number;
    currency: SupportedCurrency;
    /** TRY karşılığı (kuruş cinsinden) — her zaman hesaplanmış olmalı */
    amountTry: number;
    /** Kullanılan kur */
    rate: number;
}
/** Para birimi sembolleri */
export declare const CURRENCY_SYMBOLS: Record<SupportedCurrency, string>;
/** TCMB kur API anahtarı */
export declare const TCMB_CURRENCY_CODES: Record<Exclude<SupportedCurrency, 'TRY'>, string>;

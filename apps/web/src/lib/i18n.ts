/**
 * Enkap çoklu dil (i18n) motoru.
 *
 * Desteklenen locale'ler: Türkçe (tr), İngilizce (en), Arapça (ar)
 * RTL: Sadece Arapça
 * Varsayılan: Türkçe
 *
 * Bağımlılık yok — JSON dosyaları doğrudan import edilir.
 */

import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import ar from '@/i18n/ar.json';

// Desteklenen locale'ler
export const SUPPORTED_LOCALES = ['tr', 'en', 'ar'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: SupportedLocale = 'tr';

// RTL kullanan locale'ler
export const RTL_LOCALES: SupportedLocale[] = ['ar'];

// localStorage anahtarı
export const LOCALE_STORAGE_KEY = 'enkap-locale';

// Çeviri haritası
const TRANSLATIONS: Record<SupportedLocale, typeof tr> = { tr, en, ar };

// Locale'nin RTL olup olmadığı
export function isRtl(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

// Locale geçerli mi?
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

/**
 * Dot-notation ile çeviri anahtarı çözümleme.
 * Örnek: t('common.save') → 'Kaydet'
 */
export function resolveTranslation(
  translations: typeof tr,
  key: string,
): string {
  const parts = key.split('.');
  let current: unknown = translations;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return key; // Anahtar bulunamadı — key'i döndür (görsel debug)
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'string' ? current : key;
}

/**
 * Belirtilen locale için çeviri fonksiyonu üretir.
 *
 * @example
 * const t = createTranslator('en');
 * t('common.save') // → 'Save'
 * t('invoice.status.paid') // → 'Paid'
 */
export function createTranslator(locale: SupportedLocale) {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  return (key: string): string => resolveTranslation(dict, key);
}

// ─── Para formatı ─────────────────────────────────────────────────────────────

/**
 * Kuruş cinsinden tutarı locale'e uygun para birimiyle formatlar.
 *
 * - tr → ₺1.234,56 (TRY, tr-TR locale)
 * - en → ₺1,234.56 (TRY, en-US locale — tenant TRY kullanıyor)
 * - ar → ١٬٢٣٤٫٥٦ ﷼ (AED gösterimi, ar-AE — isteğe bağlı)
 *
 * Not: Sistem TRY üzerinden çalışır. Kur dönüşümü ayrı modülde (Sprint 7A).
 */
export function formatCurrencyLocale(
  /** Kuruş cinsinden değer */
  amountInKurus: number,
  locale: SupportedLocale,
  currency = 'TRY',
): string {
  const amount = amountInKurus / 100;

  const localeMap: Record<SupportedLocale, string> = {
    tr: 'tr-TR',
    en: 'en-US',
    ar: 'ar-AE',
  };

  return new Intl.NumberFormat(localeMap[locale], {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Tarih formatı ─────────────────────────────────────────────────────────────

/**
 * Tarihi locale'e uygun formatta gösterir.
 *
 * - tr → 15.06.2024 (GİB standardı, dd.MM.yyyy, Istanbul TZ)
 * - en → 15/06/2024 (DD/MM/YYYY, Istanbul TZ)
 * - ar → ١٥/٠٦/٢٠٢٤ (ar-AE, İstanbul TZ)
 */
export function formatDateLocale(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const localeMap: Record<SupportedLocale, string> = {
    tr: 'tr-TR',
    en: 'en-GB',
    ar: 'ar-AE',
  };

  return new Intl.DateTimeFormat(localeMap[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

/**
 * Tarih + saat formatı, locale bazlı.
 */
export function formatDateTimeLocale(
  date: Date | string,
  locale: SupportedLocale,
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const localeMap: Record<SupportedLocale, string> = {
    tr: 'tr-TR',
    en: 'en-GB',
    ar: 'ar-AE',
  };

  return new Intl.DateTimeFormat(localeMap[locale], {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

// ─── Accept-Language parsing ────────────────────────────────────────────────

/**
 * Accept-Language header'ından desteklenen locale'i çözümler.
 * Örnek: "tr-TR,tr;q=0.9,en;q=0.8" → 'tr'
 */
export function parseAcceptLanguage(header: string | null): SupportedLocale {
  if (!header) return DEFAULT_LOCALE;

  const parts = header
    .split(',')
    .map((part) => {
      const [lang, q] = part.trim().split(';q=');
      return { lang: lang.trim().slice(0, 2).toLowerCase(), q: parseFloat(q ?? '1') };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of parts) {
    if (isSupportedLocale(lang)) return lang;
  }

  return DEFAULT_LOCALE;
}

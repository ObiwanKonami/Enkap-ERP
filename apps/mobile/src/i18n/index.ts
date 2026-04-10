import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import tr from './tr.json';

const resources = { tr: { translation: tr } };

// Cihaz dilini algıla, Türkçe yoksa varsayılan Türkçe kullan
const deviceLang = getLocales()[0]?.languageCode ?? 'tr';
const lng = deviceLang.startsWith('tr') ? 'tr' : 'tr'; // Şimdilik sadece Türkçe

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng,
    fallbackLng: 'tr',
    interpolation: {
      escapeValue: false, // React Native XSS riski taşımaz
    },
    compatibilityJSON: 'v4',
  });

export default i18n;

/** Para birimi formatı — Türk Lirası: ₺1.234,56 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Tarih formatı — Türkiye standardı: dd.MM.yyyy */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

/** Kısa tarih: 15 Mar */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

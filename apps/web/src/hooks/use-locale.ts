'use client';

/**
 * Locale hook — dil seçimi ve değiştirme.
 *
 * Öncelik sırası:
 * 1. localStorage'dan oku (kullanıcı tercihi)
 * 2. document.cookie'den oku (SSR uyumlu fallback)
 * 3. navigator.language'dan tespit et
 * 4. Varsayılan: 'tr'
 *
 * Değiştirildiğinde hem localStorage hem cookie güncellenir.
 * Root layout'taki html lang/dir nitelikleri useEffect ile senkronize edilir.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  SupportedLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  isRtl,
  createTranslator,
} from '@/lib/i18n';

// Cookie adı (middleware ile uyumlu)
const LOCALE_COOKIE = 'ENKAP_LOCALE';

function getStoredLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  // 1. localStorage
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return stored;
  } catch {
    // localStorage erişim hatası — sessizce devam et
  }

  // 2. Cookie
  try {
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
    if (match) {
      const value = match.split('=')[1];
      if (value && isSupportedLocale(value)) return value;
    }
  } catch {
    // Cookie erişim hatası — sessizce devam et
  }

  // 3. Tarayıcı dili
  try {
    const browserLang = navigator.language.slice(0, 2).toLowerCase();
    if (isSupportedLocale(browserLang)) return browserLang;
  } catch {
    // navigator erişim hatası — sessizce devam et
  }

  return DEFAULT_LOCALE;
}

function persistLocale(locale: SupportedLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Sessizce devam et
  }

  // Cookie: 1 yıl, SameSite=Lax
  try {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${locale}; max-age=${maxAge}; path=/; SameSite=Lax`;
  } catch {
    // Sessizce devam et
  }
}

function applyLocaleToDocument(locale: SupportedLocale): void {
  const html = document.documentElement;
  const dir = isRtl(locale) ? 'rtl' : 'ltr';

  html.setAttribute('lang', locale);
  html.setAttribute('dir', dir);

  // Tailwind dark class ile çakışmaması için dir'i body'e de ekle
  document.body.setAttribute('dir', dir);
}

export interface UseLocaleReturn {
  /** Aktif locale kodu: 'tr' | 'en' | 'ar' */
  locale: SupportedLocale;
  /** Aktif locale RTL mi? */
  dir: 'ltr' | 'rtl';
  /** Locale'i değiştir ve sayfayı yenile */
  setLocale: (locale: SupportedLocale) => void;
  /** Çeviri fonksiyonu — t('common.save') */
  t: (key: string) => string;
  /** Desteklenen tüm locale'ler */
  supported: typeof SUPPORTED_LOCALES;
}

export function useLocale(): UseLocaleReturn {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  // İlk mount: localStorage/cookie/browser'dan oku ve DOM'a uygula
  useEffect(() => {
    const stored = getStoredLocale();
    setLocaleState(stored);
    applyLocaleToDocument(stored);
  }, []);

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    if (!isSupportedLocale(newLocale)) return;

    setLocaleState(newLocale);
    persistLocale(newLocale);
    applyLocaleToDocument(newLocale);

    // Sayfa yenilemesi — Next.js SSR için gerçek route değişimi yapmıyoruz,
    // sadece state güncelleniyor. SSR uyumluluğu için middleware cookie okur.
  }, []);

  const dir = isRtl(locale) ? 'rtl' : 'ltr';
  const t = createTranslator(locale);

  return {
    locale,
    dir,
    setLocale,
    t,
    supported: SUPPORTED_LOCALES,
  };
}

'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, createContext, useContext, useCallback, useEffect } from 'react';
import {
  SupportedLocale,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  isSupportedLocale,
  isRtl,
  createTranslator,
} from '@/lib/i18n';
import { ThemeProvider } from '../components/theme-provider';
import { Toaster } from 'sonner';


// ─── I18n Context ────────────────────────────────────────────────────────────

interface I18nContextValue {
  locale: SupportedLocale;
  dir: 'ltr' | 'rtl';
  t: (key: string) => string;
  setLocale: (locale: SupportedLocale) => void;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  dir: 'ltr',
  t: (key) => key,
  setLocale: () => undefined,
});

/** Uygulama genelinde dil ve çeviri erişimi için hook. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

const LOCALE_COOKIE = 'ENKAP_LOCALE';

function getInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  // 1. localStorage
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return stored;
  } catch { /* noop */ }

  // 2. Cookie
  try {
    const match = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
    if (match) {
      const val = match.split('=')[1];
      if (val && isSupportedLocale(val)) return val;
    }
  } catch { /* noop */ }

  // 3. Tarayıcı dili
  try {
    const lang = navigator.language.slice(0, 2).toLowerCase();
    if (isSupportedLocale(lang)) return lang;
  } catch { /* noop */ }

  return DEFAULT_LOCALE;
}

function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  // İlk mount: depolanan locale'i oku ve DOM'a uygula
  useEffect(() => {
    const initial = getInitialLocale();
    setLocaleState(initial);
    applyToDocument(initial);
  }, []);

  function applyToDocument(loc: SupportedLocale) {
    const html = document.documentElement;
    html.setAttribute('lang', loc);
    html.setAttribute('dir', isRtl(loc) ? 'rtl' : 'ltr');
    document.body.setAttribute('dir', isRtl(loc) ? 'rtl' : 'ltr');
  }

  const setLocale = useCallback((newLocale: SupportedLocale) => {
    if (!isSupportedLocale(newLocale)) return;
    setLocaleState(newLocale);

    // Kalıcı hale getir
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch { /* noop */ }
    try {
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie = `${LOCALE_COOKIE}=${newLocale}; max-age=${maxAge}; path=/; SameSite=Lax`;
    } catch { /* noop */ }

    applyToDocument(newLocale);
  }, []);

  const t = createTranslator(locale);
  const dir: 'ltr' | 'rtl' = isRtl(locale) ? 'rtl' : 'ltr';

  return (
    <I18nContext.Provider value={{ locale, dir, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Root Providers ──────────────────────────────────────────────────────────

import { TooltipProvider } from '@/components/ui/tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // ─── Cache Duration ──────────────────────────────────────────────
            // Data is fresh for 5 minutes — no automatic refetch during this window
            staleTime: 5 * 60 * 1000,

            // Keep unused data in memory for 10 minutes before garbage collection
            // This prevents duplicate requests when navigating back to same page
            gcTime: 10 * 60 * 1000, // Replaces deprecated cacheTime

            // ─── Refetch Strategy ────────────────────────────────────────────
            // Do NOT refetch when app regains focus (prevents GIB/DB overload)
            refetchOnWindowFocus: false,

            // Retry failed requests once
            retry: 1,

            // ─── Memory Management ───────────────────────────────────────────
            // Automatically refetch if data becomes stale
            refetchOnReconnect: true,
            refetchOnMount: true,
          },

          // Mutations: immediate feedback, no caching
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <TooltipProvider delayDuration={0}>
              {children}
              <Toaster />
            </TooltipProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

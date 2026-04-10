'use client';

/**
 * RTL Sağlayıcısı — Arapça dil seçildiğinde dir="rtl" uygular.
 *
 * Tailwind v3.3+ dahili RTL utility'leri destekler:
 *   - rtl:text-right  → RTL'de sağa hizala
 *   - rtl:flex-row-reverse → RTL'de ters sıra
 *   - rtl:mr-0 rtl:ml-2  → RTL'de margin yönünü tersine çevir
 *   - ltr:pl-4 rtl:pr-4  → Yön bazlı padding
 *
 * Arapça font: sistem Arabic fontu kullanılır (Noto Sans Arabic, Cairo vb.)
 * Tailwind config'de font-arabic tanımlanmışsa oradan gelir.
 *
 * Kullanım:
 *   <RtlProvider locale={locale}>{children}</RtlProvider>
 */

import React from 'react';
import { isRtl, SupportedLocale } from '@/lib/i18n';

interface RtlProviderProps {
  locale: SupportedLocale;
  children: React.ReactNode;
  /** Ek CSS class'ları */
  className?: string;
}

export function RtlProvider({ locale, children, className = '' }: RtlProviderProps) {
  const dir = isRtl(locale) ? 'rtl' : 'ltr';
  const isArabic = locale === 'ar';

  return (
    <div
      dir={dir}
      lang={locale}
      className={[
        // Arapça için sistem Arapça fontunu kullan
        isArabic ? 'font-arabic' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        isArabic
          ? {
              // Sistem Arabic font ailesi — Tailwind fontFamily'e dahil edilmemişse fallback
              fontFamily:
                '"Noto Sans Arabic", "Cairo", "Amiri", "Arabic Typesetting", system-ui, sans-serif',
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

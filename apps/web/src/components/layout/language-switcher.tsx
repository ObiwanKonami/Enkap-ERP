'use client';

/**
 * Dil Seçici — Header'a eklenen Türkçe / English / العربية geçiş bileşeni.
 *
 * Dil değişince:
 * - localStorage + cookie güncellenir (ENKAP_LOCALE)
 * - html[lang] ve html[dir] nitelikleri güncellenir (RTL/LTR)
 * - Bileşen locale state'ini günceller — sayfa yenilenmez
 *
 * Yerleştirme: Topbar'ın sağ bölümüne ekle.
 *   <LanguageSwitcher />
 */

import { Check } from 'lucide-react';
import { useLocale } from '@/hooks/use-locale';
import type { SupportedLocale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Language {
  code: SupportedLocale;
  /** Yerel dilde gösterim */
  label: string;
  /** Unicode bayrak emoji */
  flag: string;
  /** Metin yönü */
  dir: 'ltr' | 'rtl';
}

const LANGUAGES: Language[] = [
  { code: 'tr', label: 'Türkçe',   flag: '🇹🇷', dir: 'ltr' },
  { code: 'en', label: 'English',  flag: '🇬🇧', dir: 'ltr' },
  { code: 'ar', label: 'العربية',  flag: '🇸🇦', dir: 'rtl' },
];

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const current = LANGUAGES.find((l) => l.code === locale) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 px-2 gap-1.5 bg-transparent border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          title="Dil seç / Select language / اختر اللغة"
        >
          <span
            className="text-xs"
            dir={current.dir}
            style={{
              fontFamily:
                current.dir === 'rtl'
                  ? '"Noto Sans Arabic", "Cairo", system-ui, sans-serif'
                  : 'inherit',
            }}
          >
            {current.flag} {current.code.toUpperCase()}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[140px] rounded-xl overflow-hidden shadow-xl" sideOffset={8}>
        {LANGUAGES.map((lang) => {
          const isActive = lang.code === locale;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              className={cn(
                "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                isActive ? "bg-accent/50 text-accent-foreground" : "text-muted-foreground"
              )}
            >
              <div 
                className="flex items-center gap-2"
                dir={lang.dir}
                style={{
                  fontFamily:
                    lang.dir === 'rtl'
                      ? '"Noto Sans Arabic", "Cairo", system-ui, sans-serif'
                      : 'inherit',
                }}
              >
                <span className="text-base">{lang.flag}</span>
                <span className="text-xs font-medium">{lang.label}</span>
              </div>
              {isActive && <Check size={14} className="text-sky-500" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

/**
 * useI18n hook — Uygulama genelinde dil ve çeviri erişimi.
 *
 * Providers.tsx içindeki I18nContext'ten beslenilir.
 * Tüm client bileşenlerinde doğrudan kullanılabilir.
 *
 * @example
 * const { t, locale, dir, setLocale } = useI18n();
 * t('common.save')           // → 'Kaydet' | 'Save' | 'حفظ'
 * t('invoice.status.paid')   // → 'Ödendi' | 'Paid' | 'مدفوع'
 * dir                        // → 'ltr' | 'rtl'
 * setLocale('ar')            // → Arapça'ya geç, RTL uygula
 */

// I18nContext providers.tsx'te tanımlı, oradan re-export edilir
export { useI18n } from '@/app/providers';

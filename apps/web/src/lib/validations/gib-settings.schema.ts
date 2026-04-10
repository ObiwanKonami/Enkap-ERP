/**
 * Tenant GİB Ayarları Zod Şeması
 *
 * Alanlar:
 * - gib_gb_alias: Gönderici Birim Etiketi (urn:mail: ile başlamalı)
 * - gib_pk_alias: Posta Kutusu Etiketi (urn:mail: ile başlamalı)
 */

import { z } from 'zod';

export const gibSettingsSchema = z.object({
  /**
   * Gönderici Birim Etiketi
   * GİB'de fatura gönderenin kimliği — urn:mail: ile başlar
   * Örn: urn:mail:gb@company.com.tr
   */
  gib_gb_alias: z
    .string()
    .min(1, { message: 'Gönderici Birim Etiketi boş olamaz' })
    .startsWith('urn:mail:', { message: 'urn:mail: ile başlamalıdır' })
    .max(255, { message: 'Çok uzun' })
    .email({
      message: 'Geçersiz e-posta formatı (urn:mail: sonrasında)',
    })
    .refine(
      (val) => {
        // urn:mail: sonrasında geçerli e-posta var mı kontrol et
        const email = val.replace('urn:mail:', '');
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      { message: 'E-posta adresi geçersiz' }
    ),

  /**
   * Posta Kutusu Etiketi
   * GİB'de fatura alıcısının posta kutusu — urn:mail: ile başlar
   * Örn: urn:mail:pk@company.com.tr
   */
  gib_pk_alias: z
    .string()
    .min(1, { message: 'Posta Kutusu Etiketi boş olamaz' })
    .startsWith('urn:mail:', { message: 'urn:mail: ile başlamalıdır' })
    .max(255, { message: 'Çok uzun' })
    .email({
      message: 'Geçersiz e-posta formatı (urn:mail: sonrasında)',
    })
    .refine(
      (val) => {
        const email = val.replace('urn:mail:', '');
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      { message: 'E-posta adresi geçersiz' }
    ),
});

export type GibSettingsFormData = z.infer<typeof gibSettingsSchema>;

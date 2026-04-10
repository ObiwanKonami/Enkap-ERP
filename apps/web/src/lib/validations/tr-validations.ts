/**
 * Türkiye mevzuatına özgü Zod şemaları (GİB Roadmap Bölüm 5)
 *
 * Kullanım: React Hook Form + zodResolver ile kullanılır.
 * import { tcknSchema, vknSchema, chargingInvoiceSchema } from '@/lib/validations/tr-validations';
 */

import { z } from 'zod';

// ─── Kimlik Numaraları ─────────────────────────────────────────────────────

/**
 * TCKN Validasyonu: 11 hane, sadece rakam.
 * Modulo-10 algoritması (isteğe bağlı derin doğrulama için yorum satırında).
 */
export const tcknSchema = z
  .string()
  .length(11, 'TCKN tam olarak 11 haneli olmalıdır')
  .regex(/^\d+$/, 'TCKN sadece rakamlardan oluşmalıdır')
  .refine((v) => v[0] !== '0', 'TCKN sıfır ile başlayamaz');

/**
 * VKN Validasyonu: 10 hane, sadece rakam.
 */
export const vknSchema = z
  .string()
  .length(10, 'VKN tam olarak 10 haneli olmalıdır')
  .regex(/^\d+$/, 'VKN sadece rakamlardan oluşmalıdır');

/**
 * VKN veya TCKN — B2B/B2C ayrımı olmaksızın alıcı kimlik numarası.
 */
export const vknOrTcknSchema = z.union([
  vknSchema,
  tcknSchema,
]);

// ─── İletişim ─────────────────────────────────────────────────────────────

/**
 * Türkiye telefon numarası: +90 ile başlayan 13 karakter veya 10 haneli ulusal format.
 */
export const trPhoneSchema = z
  .string()
  .regex(/^(\+90\s?)?\d{10}$/, 'Geçerli bir Türkiye telefon numarası giriniz');

/**
 * IBAN (TR formatı): TR + 24 rakam = 26 karakter.
 */
export const trIbanSchema = z
  .string()
  .regex(/^TR\d{24}$/, 'IBAN formatı geçersiz (TR ile başlayan 26 karakter)');

// ─── Plaka ────────────────────────────────────────────────────────────────

/**
 * Türkiye araç plakası: 34ABC123 veya 34 ABC 123 formatı (gevşek).
 */
export const trPlateSchema = z
  .string()
  .min(5, 'Plaka en az 5 karakter olmalıdır')
  .max(10, 'Plaka en fazla 10 karakter olmalıdır')
  .regex(/^\d{2}\s?[A-ZÇŞĞÜÖİ]{1,3}\s?\d{2,4}$/, 'Plaka formatı geçersiz');

// ─── Sektörel Fatura Şemaları ─────────────────────────────────────────────

/**
 * Elektrik Şarj Faturası (SARJ) — ENERJI profili.
 * Plaka veya Şasi Numarası (VIN) zorunludur.
 */
export const chargingInvoiceSchema = z
  .object({
    invoiceTypeCode: z.literal('SARJ'),
    plateNumber: z
      .string()
      .min(5, 'Plaka formatı geçersiz')
      .optional(),
    vinNumber: z
      .string()
      .length(17, 'Şasi numarası (VIN) tam olarak 17 karakter olmalıdır')
      .optional(),
  })
  .refine((data) => data.plateNumber || data.vinNumber, {
    message: 'Elektrik şarj faturasında Plaka veya Şasi Numarası zorunludur',
    path: ['plateNumber'],
  });

/**
 * SGK Hizmet Faturası — IBAN zorunludur.
 */
export const sgkInvoiceSchema = z.object({
  profileId: z.literal('SGK'),
  iban: trIbanSchema,
});

/**
 * İlaç / Tıbbi Cihaz Faturası — GTIN barkod zorunludur.
 */
export const ilacTibbiCihazSchema = z.object({
  profileId: z.literal('ILAC_TIBBICIHAZ'),
  gtinBarcode: z
    .string()
    .regex(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/, 'GTIN barkod 8, 12, 13 veya 14 haneli olmalıdır'),
});

/**
 * İDİS (İthal Distribütör İzleme Sistemi) Faturası.
 * Sevkiyat numarası (SE-XXXXXXX) ve etiket numarası (CVXXXXXXX) zorunludur.
 */
export const idisInvoiceSchema = z.object({
  profileId: z.literal('IDIS'),
  shipmentNumber: z
    .string()
    .regex(/^SE-\d{7}$/, 'Sevkiyat numarası SE-XXXXXXX formatında olmalıdır'),
  labelNumber: z
    .string()
    .regex(/^CV\d{7}$/, 'Etiket numarası CVXXXXXXX formatında olmalıdır'),
});

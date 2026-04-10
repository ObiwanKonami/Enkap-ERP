/**
 * Fatura Zod Şeması — Sektörel GİB Kuralları
 *
 * Sektörel fatura profilleri ve zorunlu alanları:
 * - SGK: IBAN (26 hane)
 * - ENERJI: Araç Kimliği (Plaka veya Şasi)
 * - IDIS: Sevkiyat Numarası (SE- ile başlamalı)
 */

import { z } from 'zod';

// ─── Base Enum'lar ─────────────────────────────────────────────────────────

export const KDV_RATES = [0, 1, 10, 20] as const;

export const INVOICE_PROFILE_ID = {
  SGK: 'SGK',
  ENERJI: 'ENERJI',
  IDIS: 'IDIS',
  STANDART: 'STANDART',
} as const;

// ─── Line Item Şeması ─────────────────────────────────────────────────────

export const invoiceLineSchema = z.object({
  id: z.string().uuid().optional(),
  description: z
    .string()
    .trim()
    .min(1, { message: 'Açıklama boş olamaz' })
    .max(255, { message: 'Açıklama 255 karakteri geçemez' }),
  quantity: z
    .number()
    .positive({ message: 'Miktar sıfırdan büyük olmalı' })
    .int({ message: 'Miktar tam sayı olmalı' }),
  unit: z.string().min(1).max(10).optional(),
  /** @type {kuruş} — DB'de kuruş, UI'da TL olarak gösterilir */
  unitPrice: z
    .number()
    .int({ message: 'Birim fiyat (kuruş) tam sayı olmalı' })
    .nonnegative({ message: 'Birim fiyat negatif olamaz' }),
  vatRate: z.enum(['0', '1', '10', '20'], { message: 'Geçersiz KDV oranı' }).pipe(z.coerce.number()),
  discountPct: z.number().min(0).max(100).default(0),
  productId: z.string().uuid().optional(),
});

export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

// ─── Sektörel Alanlar Şeması ──────────────────────────────────────────────

const sectorialFieldsSgk = z.object({
  iban: z
    .string()
    .regex(/^TR\d{24}$/, { message: 'IBAN geçersiz (TR ile başlayıp 26 hane olmalı)' }),
});

const sectorialFieldsEnerji = z.object({
  vehicleId: z
    .string()
    .min(1, { message: 'Araç Kimliği boş olamaz' })
    .max(50, { message: 'Araç Kimliği çok uzun' }),
});

const sectorialFieldsIdis = z.object({
  shipmentNumber: z
    .string()
    .regex(/^SE-/, { message: 'Sevkiyat Numarası SE- ile başlamalı' })
    .max(50),
});

const sectorialFieldsDefault = z.object({}).passthrough();

// ─── Ana Fatura Şeması ────────────────────────────────────────────────────

export const invoiceFormSchema = z
  .object({
    /** Fatura tipi */
    invoiceType: z.enum(['E_FATURA', 'E_ARSIV', 'PROFORMA', 'PURCHASE'], {
      message: 'Geçersiz fatura tipi',
    }),

    /** Sektörel GİB profili */
    profileId: z.enum(
      [INVOICE_PROFILE_ID.SGK, INVOICE_PROFILE_ID.ENERJI, INVOICE_PROFILE_ID.IDIS, INVOICE_PROFILE_ID.STANDART],
      { message: 'Geçersiz sektörel profil' }
    ),

    /** Müşteri / Tedarikçi */
    contactId: z.string().uuid({ message: 'Geçersiz müşteri' }),
    customerName: z.string().min(1).max(255),

    /** Tarihler */
    issueDate: z.string().date({ message: 'Geçersiz tarih' }),
    dueDate: z.string().date({ message: 'Geçersiz tarih' }).optional(),

    /** Para birimi */
    currency: z.enum(['TRY', 'USD', 'EUR', 'GBP']).default('TRY'),

    /** Kalemler */
    lines: z
      .array(invoiceLineSchema)
      .min(1, { message: 'En az bir kalem eklenmelidir' })
      .max(500, { message: 'En fazla 500 kalem eklenebilir' }),

    /** Tutarlar — @type {kuruş} */
    subtotal: z.number().int().nonnegative(),
    vatTotal: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),

    /** Notlar */
    notes: z.string().max(1000).optional(),

    /** Sektörel alanlar — dinamik */
    sectoral: z.union([sectorialFieldsSgk, sectorialFieldsEnerji, sectorialFieldsIdis, sectorialFieldsDefault]),
  })
  .superRefine((data, ctx) => {
    // ─── SGK Profili — IBAN zorunlu ───
    if (data.profileId === INVOICE_PROFILE_ID.SGK) {
      if (!data.sectoral || typeof data.sectoral !== 'object' || !('iban' in data.sectoral)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sectoral', 'iban'],
          message: 'SGK profili için IBAN zorunludur',
        });
      } else if (!(/^TR\d{24}$/.test(data.sectoral.iban as string))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sectoral', 'iban'],
          message: 'IBAN geçersiz (TR ile başlayıp 26 hane olmalı)',
        });
      }
    }

    // ─── ENERJI Profili — Araç Kimliği zorunlu ───
    if (data.profileId === INVOICE_PROFILE_ID.ENERJI) {
      if (!data.sectoral || typeof data.sectoral !== 'object' || !('vehicleId' in data.sectoral) || !data.sectoral.vehicleId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sectoral', 'vehicleId'],
          message: 'ENERJI profili için Araç Kimliği zorunludur',
        });
      }
    }

    // ─── IDIS Profili — Sevkiyat Numarası zorunlu ───
    if (data.profileId === INVOICE_PROFILE_ID.IDIS) {
      if (!data.sectoral || typeof data.sectoral !== 'object' || !('shipmentNumber' in data.sectoral) || !data.sectoral.shipmentNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sectoral', 'shipmentNumber'],
          message: 'IDIS profili için Sevkiyat Numarası zorunludur',
        });
      } else if (!(/^SE-/.test(data.sectoral.shipmentNumber as string))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sectoral', 'shipmentNumber'],
          message: 'Sevkiyat Numarası SE- ile başlamalı',
        });
      }
    }

    // ─── Tarih Doğrulaması ───
    if (data.dueDate && new Date(data.dueDate) < new Date(data.issueDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Vade tarihi fatura tarihinden önce olamaz',
      });
    }
  });

export type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

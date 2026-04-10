import { z } from 'zod';

/**
 * Satın Alma Siparişi (Purchase Order) — Zod Şeması
 *
 * Validasyonlar:
 * - Tedarikçi (UUID)
 * - Beklenen Teslim Tarihi (opsiyonel)
 * - Para Birimi (TRY, USD, EUR)
 * - Sipariş Satırları (dinamik, useFieldArray ile)
 *   - Ürün (UUID)
 *   - Miktar (pozitif tam sayı)
 *   - Birim Fiyat (TL cinsinden, kuruşa çevrilir)
 *   - KDV Oranı (%0, %1, %10, %20)
 *   - Depo (UUID)
 */

export const purchaseOrderLineSchema = z.object({
  productId: z
    .string()
    .uuid({ message: 'Ürün seçimi zorunludur' })
    .describe('Ürün UUID'),

  productName: z
    .string()
    .min(1, 'Ürün adı boş olamaz')
    .describe('Ürün adı (read-only, picker tarafından ayarlanır)'),

  sku: z
    .string()
    .optional()
    .nullable()
    .describe('Ürün SKU kodu'),

  unitCode: z
    .string()
    .default('C62')
    .describe('Birim kodu (varsayılan: C62 - Adet)'),

  quantity: z
    .number({ message: 'Miktar zorunludur' })
    .positive({ message: 'Miktar sıfırdan büyük olmalı' })
    .int({ message: 'Miktar tam sayı olmalı' })
    .describe('Sipariş miktarı (adet)'),

  unitPriceTl: z
    .number({ message: 'Birim fiyat zorunludur' })
    .nonnegative({ message: 'Birim fiyat negatif olamaz' })
    .describe('Birim fiyat (TL cinsinden, DB: kuruş)'),

  kdvRate: z
    .enum(['0', '1', '10', '20'], { message: 'KDV oranı geçersiz (%0, %1, %10, %20)' })
    .pipe(z.coerce.number())
    .describe('KDV oranı (%)'),

  warehouseId: z
    .string()
    .uuid({ message: 'Depo seçimi zorunludur' })
    .describe('Depo UUID'),

  warehouseName: z
    .string()
    .optional()
    .describe('Depo adı (read-only, picker tarafından ayarlanır)'),
});

export type PurchaseOrderLineFormValues = z.infer<
  typeof purchaseOrderLineSchema
>;

export const purchaseOrderSchema = z.object({
  vendorId: z
    .string()
    .uuid({ message: 'Tedarikçi seçimi zorunludur' })
    .describe('Tedarikçi UUID'),

  vendorName: z
    .string()
    .min(1, 'Tedarikçi adı boş olamaz')
    .describe('Tedarikçi adı (read-only, combobox tarafından ayarlanır)'),

  expectedDeliveryDate: z
    .string()
    .optional()
    .nullable()
    .describe('Beklenen teslim tarihi (ISO 8601)'),

  currency: z
    .enum(['TRY', 'USD', 'EUR'], { message: 'Para birimi geçersiz' })
    .default('TRY')
    .describe('Para birimi'),

  notes: z
    .string()
    .optional()
    .nullable()
    .describe('Ek notlar'),

  lines: z
    .array(purchaseOrderLineSchema)
    .min(1, { message: 'En az bir ürün satırı gereklidir' })
    .describe('Sipariş satırları'),
});

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

/**
 * Toplam Hesaplama Türleri
 */
export interface PurchaseOrderTotals {
  subtotalKurus: number; // Matrah (KDV öncesi)
  kdvTotalKurus: number; // Toplam KDV
  grandTotalKurus: number; // Genel Toplam
}

/**
 * Satır Toplamını Hesapla
 * @param line Sipariş satırı
 * @returns { subtotal, kdv, total } (kuruş cinsinden)
 */
export function calculateLineTotal(
  line: PurchaseOrderLineFormValues
): { subtotalKurus: number; kdvKurus: number; totalKurus: number } {
  const subtotalKurus = Math.round(line.quantity * line.unitPriceTl * 100);
  const kdvKurus = Math.round(subtotalKurus * (line.kdvRate / 100));
  const totalKurus = subtotalKurus + kdvKurus;

  return {
    subtotalKurus,
    kdvKurus,
    totalKurus,
  };
}

/**
 * Tüm Satırların Toplamını Hesapla
 * @param lines Tüm sipariş satırları
 * @returns PurchaseOrderTotals
 */
export function calculatePurchaseOrderTotals(
  lines: PurchaseOrderLineFormValues[]
): PurchaseOrderTotals {
  let subtotalKurus = 0;
  let kdvTotalKurus = 0;

  for (const line of lines) {
    const { subtotalKurus: lineSub, kdvKurus } = calculateLineTotal(line);
    subtotalKurus += lineSub;
    kdvTotalKurus += kdvKurus;
  }

  return {
    subtotalKurus,
    kdvTotalKurus,
    grandTotalKurus: subtotalKurus + kdvTotalKurus,
  };
}

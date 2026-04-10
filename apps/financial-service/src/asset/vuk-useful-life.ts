import type { AssetCategory } from './entities/fixed-asset.entity';

/**
 * VUK Faydalı Ömür Tablosu
 *
 * Kaynak: Vergi Usul Kanunu 333 Sıra No'lu Genel Tebliği (ve ek tebliğler)
 * Son güncelleme: 2024
 *
 * Not: Arsa ve arazi amortismana tabi değildir (VUK Madde 314).
 * Not: Azalan bakiye yöntemi için oran = normal oranın 2 katı (VUK Madde 315).
 */
export const VUK_USEFUL_LIFE: Record<AssetCategory, { years: number; description: string }> = {
  ARSA_ARAZI:      { years: 0,  description: 'Arsa & Arazi — amortismana tabi değil (VUK Mad. 314)' },
  BINA:            { years: 50, description: "Binalar — oran %2 (VUK 333 sıra no'lu tebliğ, liste 1)" },
  MAKINE_TECHIZAT: { years: 10, description: 'Makine & Teçhizat — oran %10 (genel imalat)' },
  TASIT:           { years: 5,  description: 'Taşıt Araçları — oran %20 (binek/hafif ticari)' },
  DEMIRBASLAR:     { years: 5,  description: 'Demirbaşlar & Döşeme — oran %20' },
  BILGISAYAR:      { years: 4,  description: 'Bilgisayar & Çevre Birimleri — oran %25' },
  DIGER:           { years: 10, description: 'Diğer Duran Varlıklar — genel oran %10' },
};

/**
 * Kategori için yıllık amortisman oranını hesaplar.
 * Azalan bakiye yönteminde oran 2x uygulanır (VUK Mad. 315),
 * ancak maksimum oran %50 ile sınırlıdır.
 */
export function getDepreciationRate(
  category: AssetCategory,
  method: 'NORMAL' | 'AZALAN_BAKIYE',
): number {
  const life = VUK_USEFUL_LIFE[category];
  if (!life || life.years === 0) return 0; // Arsa/Arazi

  const normalRate = 1 / life.years;
  if (method === 'NORMAL') return normalRate;

  // Azalan bakiye: normal oranın 2 katı, max %50
  return Math.min(normalRate * 2, 0.5);
}

/**
 * Kategori için varsayılan faydalı ömrü döndürür.
 */
export function getUsefulLifeYears(category: AssetCategory): number {
  return VUK_USEFUL_LIFE[category]?.years ?? 10;
}

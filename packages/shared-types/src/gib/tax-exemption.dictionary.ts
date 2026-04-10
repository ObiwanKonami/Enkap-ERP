/**
 * KDV Muafiyet / İstisna Kodu Sözlüğü (Roadmap Bölüm 3)
 *
 * UblBuilderService'in KDV oranı %0 olan satırlarda TaxCategory bloğuna
 * TaxExemptionReasonCode ve TaxExemptionReason alanlarını basması için kullanılır.
 *
 * GİB UBL-TR 2.1 KDV muafiyet kodları (KDVK ve KDV Genel Tebliğ'e göre).
 */

export interface KdvExemptionEntry {
  /** GİB muafiyet kodu */
  code: string;
  /** UBL'e yazılacak tam açıklama metni */
  name: string;
  /** 'E' = Exempt (muaf), 'Z' = Zero-rated (sıfır oranlı) */
  category: 'E' | 'Z';
}

export const KDV_EXEMPTION_CODES: Record<string, KdvExemptionEntry> = {
  // ─── İhracat ──────────────────────────────────────────────────────────────
  ISTISNA_301: { code: '301', name: '11/1-a Mal İhracatı',                     category: 'E' },
  ISTISNA_302: { code: '302', name: '11/1-b Hizmet İhracatı',                  category: 'E' },
  ISTISNA_303: { code: '303', name: '11/1-c Yolcu Beraberi Eşya',              category: 'E' },

  // ─── Araç / Gemi / Uçak ───────────────────────────────────────────────────
  ISTISNA_311: { code: '311', name: '13/a Deniz/Hava Taşıtları',               category: 'E' },
  ISTISNA_312: { code: '312', name: '13/b Taşıt Bakım/Onarım',                 category: 'E' },

  // ─── Diplomatik / Uluslararası ────────────────────────────────────────────
  ISTISNA_320: { code: '320', name: '15 Diplomatik İstisnalar',                category: 'E' },

  // ─── Serbest Bölge ────────────────────────────────────────────────────────
  ISTISNA_330: { code: '330', name: '16 Serbest Bölge Teslimleri',             category: 'E' },

  // ─── Diğer ────────────────────────────────────────────────────────────────
  ISTISNA_350: { code: '350', name: 'Diğerleri',                               category: 'E' },

  // ─── Sıfır Oranlı (Özel Oranlar Tebliği) ─────────────────────────────────
  SIFIR_351:   { code: '351', name: 'Gıda — %0 KDV (II/A)',                   category: 'Z' },
  SIFIR_352:   { code: '352', name: 'Tarımsal Ürün — %0 KDV',                  category: 'Z' },
};

/**
 * Muafiyet/istisna koduna göre entry döner.
 * Bilinmeyen kod için ISTISNA_350 (Diğerleri) fallback'i kullanılır.
 */
export function getKdvExemption(code: string): KdvExemptionEntry {
  const found = Object.values(KDV_EXEMPTION_CODES).find((e) => e.code === code);
  return found ?? KDV_EXEMPTION_CODES['ISTISNA_350'];
}

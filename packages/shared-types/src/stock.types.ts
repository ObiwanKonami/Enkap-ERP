/**
 * Stok modülüne ait paylaşılan tip tanımları.
 * Backend ve frontend aynı tipleri bu dosyadan kullanır.
 */

/** Stok hareketi tipi — backend Türkçe değerleri */
export type StockMovementType =
  | 'GIRIS'       // Giriş (satın alma, iade kabul vb.)
  | 'CIKIS'       // Çıkış (satış, fire vb.)
  | 'TRANSFER'    // Depo transferi
  | 'SAYIM'       // Stok sayım düzeltmesi
  | 'IADE_GIRIS'  // İade girişi (müşteriden geri dönen)
  | 'IADE_CIKIS'  // İade çıkışı (tedarikçiye iade)
  | 'FIRE';       // Fire / kayıp

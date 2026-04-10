import { EcommercePlatform } from '../entities/ecommerce-integration.entity';

/**
 * Tek bir e-ticaret entegrasyon senkronizasyonunun sonucu.
 *
 * products_synced: ERP'den platforma güncellenen ürün sayısı
 * stock_updated:   ERP'den platforma güncellenen stok kalemi sayısı
 * orders_imported: Platformdan ERP'ye aktarılan yeni sipariş sayısı
 * errors:          Kısmi hatalar (fatal olmayan — tenant senkronu durdurulmaz)
 */
export interface SyncResult {
  platform: EcommercePlatform;
  products_synced: number;
  stock_updated: number;
  orders_imported: number;
  errors: string[];
  synced_at: Date;
}

/** Boş/başlangıç SyncResult oluşturur */
export function emptySyncResult(platform: EcommercePlatform): SyncResult {
  return {
    platform,
    products_synced: 0,
    stock_updated:   0,
    orders_imported: 0,
    errors:          [],
    synced_at:       new Date(),
  };
}

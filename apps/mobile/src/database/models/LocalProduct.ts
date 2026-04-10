import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * Offline ürün WatermelonDB modeli.
 *
 * Barkod tarama ve fatura oluşturmada hızlı ürün arama için offline saklanır.
 * Günde bir kez (veya kullanıcı manuel tetikleyince) pull sync yapılır.
 */
export class LocalProduct extends Model {
  static table = 'products';

  @field('server_id') serverId!: string | null;
  @field('sku') sku!: string;
  @field('name') name!: string;
  @field('barcode') barcode!: string | null;
  @field('unit_code') unitCode!: string;
  @field('kdv_rate') kdvRate!: number;
  @field('list_price_kurus') listPriceKurus!: number;
  @field('total_stock_qty') totalStockQty!: number;
  @field('reorder_point') reorderPoint!: number;
  @field('is_active') isActive!: boolean;
  @field('category_name') categoryName!: string | null;
  @readonly @date('updated_at') updatedAt!: Date;

  /** Liste satış fiyatı TL olarak */
  get listPriceTl(): number {
    return this.listPriceKurus / 100;
  }

  get isLowStock(): boolean {
    return this.totalStockQty <= this.reorderPoint && this.reorderPoint > 0;
  }

  get isOutOfStock(): boolean {
    return this.totalStockQty <= 0;
  }

  get stockStatusLabel(): string {
    if (this.isOutOfStock) return 'Stok Yok';
    if (this.isLowStock) return 'Düşük Stok';
    return 'Yeterli';
  }
}

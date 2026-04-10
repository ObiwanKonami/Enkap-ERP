import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';

/**
 * Türkiye'de yaygın birimler (GİB UBL-TR birim kodları).
 * UN/CEFACT birim kodlarına karşılık gelir.
 */
export type UnitCode =
  | 'C62' // adet
  | 'KGM' // kilogram
  | 'GRM' // gram
  | 'LTR' // litre
  | 'MTR' // metre
  | 'MTK' // metrekare
  | 'MTQ' // metreküp
  | 'BX'  // kutu
  | 'SET' // set
  | 'PR'  // çift
  | 'HUR' // saat (hizmet)
  | 'DAY' // gün (hizmet)
  | 'MON'; // ay (hizmet)

export type CostMethod = 'FIFO' | 'AVG';

/**
 * Ürün / Hizmet Entity.
 *
 * - Hem fiziksel ürünler (stok takipli) hem hizmetler (stoksuz) tutulur.
 * - isStockTracked=false → stok hareketleri oluşturulmaz, maliyet takibi yok.
 * - avgUnitCostKurus ve fifoLayers: maliyet motoru tarafından güncellenir.
 * - Barkod benzersiz kısıtı tenant_id + barcode üzerindedir (migration'da partial index).
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** Stok Tutma Birimi — sistem genelinde benzersiz (tenant bazında) */
  @Column({ length: 50 })
  sku!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category!: ProductCategory | null;

  /** GİB UBL-TR birim kodu (örn: C62=adet, KGM=kg) */
  @Column({ name: 'unit_code', length: 10, default: 'C62' })
  unitCode!: UnitCode;

  /** Barkod (EAN-13, QR, Data Matrix vb.) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  barcode!: string | null;

  /** KDV oranı (%0, %1, %10, %20) */
  @Column({ name: 'kdv_rate', type: 'numeric', precision: 5, scale: 2, default: 20 })
  kdvRate!: number;

  /** Fiziksel stok takibi var mı? Hizmetler için false. */
  @Column({ name: 'is_stock_tracked', default: true })
  isStockTracked!: boolean;

  /** Maliyet yöntemi: FIFO veya AVG */
  @Column({ name: 'cost_method', length: 10, default: 'AVG' })
  costMethod!: CostMethod;

  /**
   * AVG yöntemi için mevcut ağırlıklı ortalama birim maliyet (kuruş).
   * FIFO kullanan ürünler için geçersizdir; fifoLayers kullanılır.
   */
  @Column({ name: 'avg_unit_cost_kurus', type: 'bigint', default: 0 })
  avgUnitCostKurus!: number;

  /**
   * FIFO yöntemi için maliyet katmanları (JSON dizi).
   * Format: [{ receivedAt, quantity, unitCostKurus }]
   * Her giriş/çıkış hareketinde bu alan güncellenir.
   */
  @Column({ name: 'fifo_layers', type: 'jsonb', default: '[]' })
  fifoLayers!: object[];

  /** Mevcut stok miktarı (tüm depolar toplamı) */
  @Column({ name: 'total_stock_qty', type: 'numeric', precision: 15, scale: 4, default: 0 })
  totalStockQty!: number;

  /** Yeniden sipariş noktası (bu seviyenin altına düşünce uyarı) */
  @Column({ name: 'reorder_point', type: 'numeric', precision: 15, scale: 4, default: 0 })
  reorderPoint!: number;

  /** Minimum stok seviyesi */
  @Column({ name: 'min_stock_qty', type: 'numeric', precision: 15, scale: 4, default: 0 })
  minStockQty!: number;

  /** Liste satış fiyatı (kuruş) — fatura oluşturmada varsayılan */
  @Column({ name: 'list_price_kurus', type: 'bigint', default: 0 })
  listPriceKurus!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

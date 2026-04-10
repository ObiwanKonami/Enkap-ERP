import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

export type MarketplaceName = 'trendyol' | 'hepsiburada';

/**
 * Marketplace — Internal Ürün Eşleme Tablosu.
 *
 * Neden gerekli:
 *  Trendyol/Hepsiburada siparişleri dış `external_product_id` kullanır.
 *  Stok hareketi ve maliyet hesabı için internal `product_id` gerekir.
 *
 * Tasarım kararları:
 *  - PRIMARY KEY: (tenant_id, marketplace, external_product_id) — composite
 *    dış tarafın aynı ID'yi tekrar gönderdiğinde güvenli upsert yapar.
 *  - `external_barcode`: Ek arama için (barkod bazlı eşleme).
 *  - `is_active`: Pasif hale getirme (silme yerine) — denetim izi.
 *  - Tek ürün birden fazla marketplace'te farklı ID'lerle listelenebilir.
 */
@Entity('marketplace_product_mappings')
@Unique(['tenantId', 'marketplace', 'externalProductId'])
@Index(['tenantId', 'internalProductId'])
export class MarketplaceProductMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Internal ürün ID (products tablosuna FK) */
  @Column({ name: 'internal_product_id', type: 'uuid' })
  internalProductId!: string;

  /** Platform adı */
  @Column({ type: 'varchar', length: 30 })
  marketplace!: MarketplaceName;

  /** Platform tarafındaki ürün ID (string — Trendyol numeric string, Hepsiburada UUID) */
  @Column({ name: 'external_product_id', type: 'varchar', length: 255 })
  externalProductId!: string;

  /** Platform içindeki SKU/barkod — opsiyonel, alternatif arama */
  @Column({ name: 'external_barcode', type: 'varchar', length: 100, nullable: true })
  externalBarcode!: string | null;

  /** Platform'daki ürün başlığı — son güncelleme (referans amaçlı) */
  @Column({ name: 'external_title', type: 'text', nullable: true })
  externalTitle!: string | null;

  /** Fiyat senkronizasyonu aktif mi */
  @Column({ name: 'sync_price', type: 'boolean', default: true })
  syncPrice!: boolean;

  /** Stok senkronizasyonu aktif mi */
  @Column({ name: 'sync_stock', type: 'boolean', default: true })
  syncStock!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

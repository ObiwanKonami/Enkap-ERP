import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Desteklenen e-ticaret platform türleri.
 * Marketplace modülünden ayrı tutulur — farklı API yapıları ve iş mantığı.
 */
export enum EcommercePlatform {
  WOOCOMMERCE = 'woocommerce',
  SHOPIFY     = 'shopify',
  TICIMAX     = 'ticimax',
  IDEASOFT    = 'ideasoft',
}

/**
 * E-ticaret platform entegrasyon yapılandırması.
 *
 * Her tenant birden fazla mağaza bağlayabilir (örn. iki farklı WooCommerce sitesi).
 * Kimlik bilgileri (API key, token vb.) AES-256-GCM ile şifreli JSONB alanında saklanır.
 * Şifreleme anahtarı: MARKETPLACE_ENCRYPTION_KEY env var'ından türetilir (Vault inject).
 *
 * Şifrelenmiş format:
 *   { iv: "<hex>", authTag: "<hex>", encrypted: "<hex>" }
 */
@Entity('ecommerce_integrations')
@Index('idx_ecommerce_integrations_tenant_id', ['tenantId'])
export class EcommerceIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu — TenantAwareSubscriber bu alan üzerinden doğrular */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 20 })
  platform!: EcommercePlatform;

  /** Kullanıcı tanımlı entegrasyon adı — örn. "Ana Mağazam", "B2B Mağaza" */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** Mağaza kök URL'i — örn. "https://magaza.com" */
  @Column({ name: 'store_url', type: 'varchar', length: 500 })
  storeUrl!: string;

  /**
   * AES-256-GCM şifreli kimlik bilgileri.
   * WooCommerce: { consumer_key, consumer_secret }
   * Shopify:     { access_token, shop_domain }
   * Ticimax:     { api_key, site_id }
   * İdeaSoft:    { api_key, store_hash }
   */
  @Column({ type: 'jsonb' })
  credentials!: Record<string, string>;

  /** Entegrasyon aktif mi — false ise scheduler'da atlanır */
  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  /** Ürün bilgilerini (isim, fiyat) ERP'den platforma senkronize et */
  @Column({ name: 'sync_products', default: true })
  syncProducts!: boolean;

  /** Stok miktarını ERP'den platforma senkronize et */
  @Column({ name: 'sync_stock', default: true })
  syncStock!: boolean;

  /** Siparişleri platformdan ERP'ye aktar */
  @Column({ name: 'sync_orders', default: true })
  syncOrders!: boolean;

  /** Son başarılı senkronizasyon zamanı */
  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt!: Date | null;

  /** Son senkronizasyon hata mesajı — null ise hata yok */
  @Column({ name: 'last_sync_error', type: 'text', nullable: true })
  lastSyncError!: string | null;

  /**
   * Bu tarihten sonraki siparişleri çek.
   * İlk senkronizasyonda 30 gün önceye ayarlanır.
   * Her başarılı sipariş senkronundan sonra güncellenir.
   */
  @Column({ name: 'sync_since', type: 'timestamptz', nullable: true })
  syncSince!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

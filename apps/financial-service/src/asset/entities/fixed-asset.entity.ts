import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Duran Varlık Tipi — VUK 339 ve 333 sıra numaralı tebliğ esaslarına göre
 * Amortisman hesaplamasında kullanılır.
 */
export type AssetCategory =
  | 'ARSA_ARAZI'       // Arazi & Arsa (amortismana tabi değil)
  | 'BINA'             // Binalar — Hesap 252 (VUK normal: %2 → 50 yıl)
  | 'MAKINE_TECHIZAT'  // Makine & Teçhizat — Hesap 253
  | 'TASIT'            // Taşıt Araçları — Hesap 254
  | 'DEMIRBASLAR'      // Demirbaşlar & Döşeme — Hesap 255
  | 'BILGISAYAR'       // Bilgisayar & Yazılım — Hesap 255 (kısa ömür)
  | 'DIGER';           // Diğer Maddi Duran Varlıklar — Hesap 258/259

export type DepreciationMethod = 'NORMAL' | 'AZALAN_BAKIYE';
export type AssetStatus = 'AKTIF' | 'TAMAMEN_AMORTIZE' | 'ELDEN_CIKARILDI';

/**
 * Maddi Duran Varlık Kaydı
 *
 * VUK Madde 313-321 esaslarına göre amortismana tabi tutulur.
 * Normal (doğrusal) veya Azalan Bakiye yöntemi seçilebilir.
 *
 * Muhasebe hesapları:
 *  - Aktivasyon  : Borç 25x / Alacak 320/102
 *  - Amortisman  : Borç 770 (veya 730/740) / Alacak 257/258
 *  - Elden çıkar : Borç 257 + Borç/Alacak fark / Alacak 25x
 */
@Entity('fixed_assets')
export class FixedAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Sabit kıymet adı (örn: "Dell PowerEdge R750 Sunucu") */
  @Column({ length: 200 })
  name!: string;

  /** İç takip kodu (örn: "DV-2026-001") */
  @Column({ name: 'asset_code', length: 50, unique: false })
  assetCode!: string;

  @Column({
    name: 'category',
    type: 'varchar',
    length: 30,
  })
  category!: AssetCategory;

  /** Amortisman yöntemi: NORMAL (doğrusal) veya AZALAN_BAKIYE */
  @Column({
    name: 'depreciation_method',
    type: 'varchar',
    length: 20,
    default: 'NORMAL',
  })
  depreciationMethod!: DepreciationMethod;

  /** Kullanışlı ömür (yıl) — VUK tebliğinden otomatik atanır, kullanıcı override edebilir */
  @Column({ name: 'useful_life_years', type: 'smallint' })
  usefulLifeYears!: number;

  /** Yıllık amortisman oranı — oran = 1 / usefulLifeYears */
  @Column({ name: 'depreciation_rate', type: 'numeric', precision: 8, scale: 6 })
  depreciationRate!: number;

  /** Edinim tarihi */
  @Column({ name: 'acquisition_date', type: 'date' })
  acquisitionDate!: Date;

  /** Edinim maliyeti — kuruş */
  @Column({ name: 'acquisition_cost_kurus', type: 'bigint' })
  acquisitionCostKurus!: number;

  /** Birikmiş amortisman — kuruş (yıl sonu cron günceller) */
  @Column({ name: 'accumulated_depreciation_kurus', type: 'bigint', default: 0 })
  accumulatedDepreciationKurus!: number;

  /**
   * Net defter değeri — kuruş
   * = acquisitionCostKurus - accumulatedDepreciationKurus
   */
  @Column({ name: 'book_value_kurus', type: 'bigint' })
  bookValueKurus!: number;

  /** Hurdaya ayrılacak kalıntı değer — kuruş (genellikle 0) */
  @Column({ name: 'salvage_value_kurus', type: 'bigint', default: 0 })
  salvageValueKurus!: number;

  /** Varsa bağlı fatura/belge ID'si */
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId?: string;

  /** Bulunduğu departman/lokasyon */
  @Column({ name: 'location', length: 100, nullable: true })
  location?: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 25,
    default: 'AKTIF',
  })
  status!: AssetStatus;

  /** Elden çıkarılma tarihi */
  @Column({ name: 'disposal_date', type: 'date', nullable: true })
  disposalDate?: Date;

  /** Elden çıkarılma gerekçesi */
  @Column({ name: 'disposal_notes', type: 'text', nullable: true })
  disposalNotes?: string;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { FixedAsset } from './fixed-asset.entity';

/**
 * Yıllık Amortisman Kaydı
 *
 * Her varlık için yılda bir satır oluşturulur.
 * Yıl sonu cron job'ı (31 Aralık 23:30) çalıştırır.
 * Idempotency: (assetId, year) UNIQUE → tekrar çalıştırılabilir.
 *
 * Muhasebe kaydı otomatik oluşturulur:
 *   Borç  770 Genel Yönetim Giderleri (veya 730/740) — amortismanKurus
 *   Alacak 257 Birikmiş Amortismanlar              — amortismanKurus
 */
@Entity('asset_depreciations')
@Index(['assetId', 'year'], { unique: true })
export class AssetDepreciation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'asset_id', type: 'uuid' })
  assetId!: string;

  @ManyToOne(() => FixedAsset, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'asset_id' })
  asset!: FixedAsset;

  /** Amortisman yılı (örn: 2026) */
  @Column({ type: 'smallint' })
  year!: number;

  /** Bu yıl hesaplanan amortisman tutarı — kuruş */
  @Column({ name: 'depreciation_kurus', type: 'bigint' })
  depreciationKurus!: number;

  /** Dönem başı defter değeri — kuruş */
  @Column({ name: 'opening_book_value_kurus', type: 'bigint' })
  openingBookValueKurus!: number;

  /** Dönem sonu defter değeri — kuruş */
  @Column({ name: 'closing_book_value_kurus', type: 'bigint' })
  closingBookValueKurus!: number;

  /** Kullanılan yöntem (muhasebe kaydı ile eşleşmesi için saklanır) */
  @Column({ name: 'method', type: 'varchar', length: 20 })
  method!: string;

  /** Otomatik oluşturulan muhasebe yevmiye kaydı UUID'si */
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

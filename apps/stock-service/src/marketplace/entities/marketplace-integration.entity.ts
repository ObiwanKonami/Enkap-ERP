import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MarketplacePlatform =
  | 'TRENDYOL'
  | 'HEPSIBURADA'
  | 'N11'
  | 'AMAZON_TR'
  | 'CICEKSEPETI';

/**
 * Marketplace platform entegrasyon yapılandırması.
 * Kimlik bilgileri şifreli JSONB içinde saklanır (AES-256, Vault anahtarı).
 */
@Entity('marketplace_integrations')
export class MarketplaceIntegration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 30 })
  platform!: MarketplacePlatform;

  /** AES-256 şifreli kimlik bilgileri: { apiKey, apiSecret, supplierId vs. } */
  @Column({ name: 'credentials_enc', type: 'jsonb' })
  credentialsEnc!: Record<string, string>;

  /** Platform'a özgü sabit yapılandırma */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  config!: Record<string, unknown>;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt!: Date | null;

  @Column({ name: 'last_sync_error', type: 'text', nullable: true })
  lastSyncError!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

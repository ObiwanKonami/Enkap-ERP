import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AccountType = 'KASA' | 'BANKA';

/**
 * Kasa veya Banka Hesabı
 *
 * KASA  → Hesap 100 (Kasa)
 * BANKA → Hesap 102 (Bankalar)
 *
 * Her hesabın güncel bakiyesi running_balance ile takip edilir.
 * Tüm harekette PESSIMISTIC_WRITE lock kullanılır (yarış koşulu yok).
 */
@Entity('treasury_accounts')
export class TreasuryAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Hesap adı: "Ana Kasa", "İş Bankası TL", "Garanti USD" */
  @Column({ length: 100 })
  name!: string;

  /** KASA | BANKA */
  @Column({ name: 'account_type', type: 'varchar', length: 10 })
  accountType!: AccountType;

  /** Para birimi — varsayılan TRY */
  @Column({ length: 3, default: 'TRY' })
  currency!: string;

  /** Güncel bakiye — kuruş (negatif olabilir: kredili hesap) */
  @Column({ name: 'balance_kurus', type: 'bigint', default: 0 })
  balanceKurus!: number;

  /** Banka hesap numarası (BANKA tipi için) */
  @Column({ name: 'bank_account_no', length: 50, nullable: true })
  bankAccountNo?: string;

  /** IBAN */
  @Column({ length: 34, nullable: true })
  iban?: string;

  /** Şube / Banka adı */
  @Column({ name: 'bank_name', length: 100, nullable: true })
  bankName?: string;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

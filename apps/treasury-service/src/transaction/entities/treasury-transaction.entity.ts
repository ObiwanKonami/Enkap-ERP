import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { TreasuryAccount } from '../../account/entities/treasury-account.entity';

/**
 * Kasa/Banka Hareketi Tipi
 *
 * TAHSILAT    → Müşteriden tahsilat (Borç 100/102 / Alacak 120)
 * ODEME       → Tedarikçiye ödeme (Borç 320 / Alacak 100/102)
 * TRANSFER    → Hesaplar arası transfer (Borç 102 / Alacak 102)
 * FAIZ_GELIRI → Faiz geliri (Borç 102 / Alacak 642)
 * BANKA_MASRAFI → Banka komisyonu (Borç 780 / Alacak 102)
 * DIGER_GELIR → Diğer gelir
 * DIGER_GIDER → Diğer gider
 */
export type TransactionType =
  | 'TAHSILAT'
  | 'ODEME'
  | 'TRANSFER'
  | 'FAIZ_GELIRI'
  | 'BANKA_MASRAFI'
  | 'DIGER_GELIR'
  | 'DIGER_GIDER';

export type ReconciliationStatus = 'BEKLIYOR' | 'ESLESTI' | 'ESLESMEDI';

/**
 * Kasa / Banka Hareketi
 *
 * running_balance: Her hareketten sonra güncel bakiye (PESSIMISTIC_WRITE ile race-free)
 */
@Entity('treasury_transactions')
@Index(['accountId', 'transactionDate'])
export class TreasuryTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => TreasuryAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account!: TreasuryAccount;

  @Column({
    name: 'transaction_type',
    type: 'varchar',
    length: 20,
  })
  transactionType!: TransactionType;

  /** Hareket tutarı — kuruş, daima pozitif */
  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: number;

  /**
   * Yön: 'IN' (kasa/bankaya giriş) veya 'OUT' (çıkış)
   * running_balance hesabında +/- belirlenir
   */
  @Column({ name: 'direction', type: 'varchar', length: 3 })
  direction!: 'IN' | 'OUT';

  /** Hareketten sonra güncel hesap bakiyesi — kuruş */
  @Column({ name: 'running_balance', type: 'bigint', default: 0 })
  runningBalance!: number;

  /** İşlem tarihi */
  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate!: Date;

  /** Açıklama */
  @Column({ length: 500, nullable: true })
  description?: string;

  /** Referans belge tipi: 'invoice', 'purchase_order', vb. */
  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  /** Referans belge ID/numarası */
  @Column({ name: 'reference_id', length: 100, nullable: true })
  referenceId?: string;

  /** Transfer işleminde karşı hesap */
  @Column({ name: 'target_account_id', type: 'uuid', nullable: true })
  targetAccountId?: string;

  /**
   * Mutabakat durumu:
   * BEKLIYOR → banka ekstresiyle henüz eşleştirilmedi
   * ESLESTI  → ekstre ile eşleşti
   * ESLESMEDI → ekstre ile çelişiyor
   */
  @Column({
    name: 'reconciliation_status',
    type: 'varchar',
    length: 15,
    default: 'BEKLIYOR',
  })
  reconciliationStatus!: ReconciliationStatus;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

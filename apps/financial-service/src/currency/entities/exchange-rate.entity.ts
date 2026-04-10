import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import type { SupportedCurrency } from '@enkap/shared-types';

/** Döviz kuru kaydı — V034 şeması */
@Entity('exchange_rates')
@Unique(['tenantId', 'fromCurrency', 'toCurrency', 'rateDate'])
export class ExchangeRateRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Kaynak para birimi (örn: USD) */
  @Column({ name: 'from_currency', type: 'varchar', length: 3 })
  fromCurrency!: Exclude<SupportedCurrency, 'TRY'>;

  /** Hedef para birimi (her zaman TRY) */
  @Column({ name: 'to_currency', type: 'varchar', length: 3 })
  toCurrency!: string;

  /**
   * 1 birim kaynak para = N hedef para.
   * TCMB efektif banknot satış kuru (VUK Md.280)
   */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  rate!: number;

  /** Kur kaynağı: TCMB günlük otomatik / MANUAL kullanıcı girişi */
  @Column({ type: 'varchar', length: 50 })
  source!: string;

  /**
   * Kur tarihi (yyyy-MM-dd).
   * TCMB hafta içi günlük yayımlar; hafta sonu/tatil → son geçerli kur.
   */
  @Column({ name: 'rate_date', type: 'date' })
  rateDate!: string;

  @Column({ name: 'created_by', type: 'varchar', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

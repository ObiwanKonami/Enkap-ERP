import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Budget } from './budget.entity';

/**
 * Bütçe Kalemi
 *
 * Hesap bazında aylık planlanan tutarları saklar.
 * accountCode → TDHP muhasebe hesap kodu (ör: 600, 620, 730…).
 * Aylık tutarlar kuruş cinsinden saklanır (bigint).
 */
@Entity('budget_lines')
export class BudgetLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'budget_id', type: 'uuid' })
  budgetId!: string;

  @ManyToOne(() => Budget, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'budget_id' })
  budget!: Budget;

  /** TDHP muhasebe hesap kodu */
  @Column({ name: 'account_code', length: 20 })
  accountCode!: string;

  /** Hesap adı */
  @Column({ name: 'account_name', length: 200 })
  accountName!: string;

  /** Aylık planlanan tutarlar — kuruş */
  @Column({ type: 'bigint', default: 0 }) jan!: number;
  @Column({ type: 'bigint', default: 0 }) feb!: number;
  @Column({ type: 'bigint', default: 0 }) mar!: number;
  @Column({ type: 'bigint', default: 0 }) apr!: number;
  @Column({ type: 'bigint', default: 0 }) may!: number;
  @Column({ type: 'bigint', default: 0 }) jun!: number;
  @Column({ type: 'bigint', default: 0 }) jul!: number;
  @Column({ type: 'bigint', default: 0 }) aug!: number;
  @Column({ type: 'bigint', default: 0 }) sep!: number;
  @Column({ type: 'bigint', default: 0 }) oct!: number;
  @Column({ type: 'bigint', default: 0 }) nov!: number;
  @Column({ type: 'bigint', default: 0 }) dec!: number;

  /** Yıllık toplam — kayıt sırasında güncellenir */
  @Column({ name: 'annual_total_kurus', type: 'bigint', default: 0 })
  annualTotalKurus!: number;
}

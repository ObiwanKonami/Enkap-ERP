import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID';

/**
 * Aylık Bordro Kaydı.
 *
 * Her (employee_id, period_year, period_month) için tek kayıt.
 * Tüm tutarlar kuruş cinsinden (bigint — float kayması olmaz).
 *
 * Hesaplama yöntemi: Turkey 2025
 *   SGK: İşçi %15 (emeklilik %9 + sağlık %5 + işsizlik %1)
 *   SGK: İşveren %20.5 (emeklilik %11 + sağlık %7.5 + işsizlik %2)
 *   GV: kümülatif dilim sistemi (%15/%20/%27/%35/%40)
 *   DV: %0.759
 *   Asgari ücret muafiyeti: asgari ücretin GV tutarı kadar indirim
 */
@Entity('payrolls')
export class Payroll {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @Column({ name: 'period_year', type: 'smallint' })
  periodYear!: number;

  @Column({ name: 'period_month', type: 'smallint' })
  periodMonth!: number;

  /** Çalışılan gün sayısı (devamsızlık/izin düşüldükten sonra) */
  @Column({ name: 'working_days', type: 'smallint', default: 30 })
  workingDays!: number;

  /** O aydaki toplam iş günü (ücreti orantılamak için) */
  @Column({ name: 'total_days', type: 'smallint', default: 30 })
  totalDays!: number;

  // ─── Brüt ────────────────────────────────────────────────────────────────
  @Column({ name: 'gross_kurus', type: 'bigint' })
  grossKurus!: number;

  // ─── İşçi Kesintileri ────────────────────────────────────────────────────
  /** SGK işçi primi (emeklilik + sağlık) */
  @Column({ name: 'sgk_worker_kurus', type: 'bigint' })
  sgkWorkerKurus!: number;

  /** İşsizlik sigortası işçi payı */
  @Column({ name: 'unemployment_worker_kurus', type: 'bigint' })
  unemploymentWorkerKurus!: number;

  /** Gelir vergisi (muafiyet sonrası) */
  @Column({ name: 'income_tax_kurus', type: 'bigint' })
  incomeTaxKurus!: number;

  /** Damga vergisi */
  @Column({ name: 'stamp_tax_kurus', type: 'bigint' })
  stampTaxKurus!: number;

  // ─── Net ──────────────────────────────────────────────────────────────────
  @Column({ name: 'net_kurus', type: 'bigint' })
  netKurus!: number;

  // ─── İşveren Maliyeti ────────────────────────────────────────────────────
  @Column({ name: 'sgk_employer_kurus', type: 'bigint' })
  sgkEmployerKurus!: number;

  @Column({ name: 'unemployment_employer_kurus', type: 'bigint' })
  unemploymentEmployerKurus!: number;

  /** Toplam işveren maliyeti = brüt + SGK işveren + işsizlik işveren */
  @Column({ name: 'total_employer_cost_kurus', type: 'bigint' })
  totalEmployerCostKurus!: number;

  // ─── Vergi Matrahları ────────────────────────────────────────────────────
  /** Bu aya ait GV matrahı */
  @Column({ name: 'income_tax_base_kurus', type: 'bigint' })
  incomeTaxBaseKurus!: number;

  /**
   * Yıl başından bu aya kadar kümülatif GV matrahı.
   * Bir sonraki ay hesaplamasında kullanılır.
   */
  @Column({ name: 'cumulative_income_base_kurus', type: 'bigint' })
  cumulativeIncomeBaseKurus!: number;

  /** Uygulanan asgari ücret GV muafiyeti */
  @Column({ name: 'min_wage_exemption_kurus', type: 'bigint', default: 0 })
  minWageExemptionKurus!: number;

  // ─── V059: BES, İcra, Avans, Fazla Mesai ──────────────────────────────────
  /** BES işçi katkı payı (%3 brüt) */
  @Column({ name: 'bes_kurus', type: 'bigint', default: 0 })
  besKurus!: number;

  /** İcra (maaş haczi) kesintisi */
  @Column({ name: 'icra_kurus', type: 'bigint', default: 0 })
  icraKurus!: number;

  /** Bu ay bordrodan düşülen avans tutarı */
  @Column({ name: 'advance_deduction_kurus', type: 'bigint', default: 0 })
  advanceDeductionKurus!: number;

  /** Bu ay hesaplanan fazla mesai ücreti */
  @Column({ name: 'overtime_kurus', type: 'bigint', default: 0 })
  overtimeKurus!: number;

  // ─── Durum ───────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 10, default: 'DRAFT' })
  status!: PayrollStatus;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

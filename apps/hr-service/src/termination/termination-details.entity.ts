import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('termination_details')
export class TerminationDetails {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  @Column({ name: 'termination_date', type: 'date' })
  terminationDate!: string;

  @Column({ name: 'sgk_termination_code', type: 'varchar', length: 2 })
  sgkTerminationCode!: string;

  @Column({ name: 'tenure_years', type: 'numeric', precision: 6, scale: 2, nullable: true })
  tenureYears!: number | null;

  @Column({ name: 'tenure_months', type: 'int', nullable: true })
  tenureMonths!: number | null;

  // Kıdem tazminatı
  @Column({ name: 'severance_eligible', type: 'boolean', default: false })
  severanceEligible!: boolean;

  @Column({ name: 'severance_kurus', type: 'bigint', default: 0 })
  severanceKurus!: number;

  @Column({ name: 'severance_days', type: 'int', default: 0 })
  severanceDays!: number;

  // İhbar tazminatı
  @Column({ name: 'notice_eligible', type: 'boolean', default: false })
  noticeEligible!: boolean;

  @Column({ name: 'notice_kurus', type: 'bigint', default: 0 })
  noticeKurus!: number;

  @Column({ name: 'notice_weeks', type: 'int', default: 0 })
  noticeWeeks!: number;

  // Kullanılmayan yıllık izin
  @Column({ name: 'unused_leave_days', type: 'numeric', precision: 5, scale: 2, default: 0 })
  unusedLeaveDays!: number;

  @Column({ name: 'unused_leave_kurus', type: 'bigint', default: 0 })
  unusedLeaveKurus!: number;

  @Column({ name: 'total_payout_kurus', type: 'bigint', default: 0 })
  totalPayoutKurus!: number;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt!: Date;

  @Column({ name: 'calculated_by', type: 'uuid', nullable: true })
  calculatedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

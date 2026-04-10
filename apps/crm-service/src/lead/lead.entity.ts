import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeadStage =
  | 'new'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost';

/**
 * CRM fırsat / satış hattı kaydı.
 *
 * Pipeline görünümü: Kanban — her stage bir sütun.
 * Kapatma tahmini: probability × value_kurus → ağırlıklı pipeline değeri.
 *
 * Kazanıldığında: financial-service'e teklif → fatura dönüşümü (TODO: Faz 4)
 */
@Entity('crm_leads')
export class Lead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** Fırsat değeri kuruş cinsinden */
  @Column({ name: 'value_kurus', type: 'bigint', default: 0 })
  valueKurus!: number;

  @Column({ type: 'varchar', length: 30, default: 'new' })
  stage!: LeadStage;

  /** Kazanma olasılığı %0-100 */
  @Column({ type: 'smallint', default: 20 })
  probability!: number;

  @Column({ name: 'expected_close_date', type: 'date', nullable: true })
  expectedCloseDate!: Date | null;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  @Column({ name: 'lost_reason', type: 'varchar', length: 200, nullable: true })
  lostReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Ağırlıklı değer: olasılık × tutar */
  get weightedValueKurus(): number {
    return Math.round((this.valueKurus * this.probability) / 100);
  }

  get isClosed(): boolean {
    return this.stage === 'won' || this.stage === 'lost';
  }
}

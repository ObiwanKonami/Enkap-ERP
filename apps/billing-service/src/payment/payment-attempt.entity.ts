import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type PaymentStatus = 'success' | 'failed' | 'pending' | 'refunded';

@Entity('payment_attempts')
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: number;

  @Column({ type: 'char', length: 3, default: 'TRY' })
  currency!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: PaymentStatus;

  @Column({ name: 'iyzico_payment_id', type: 'varchar', length: 100, nullable: true })
  iyzicoPaymentId!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'attempt_number', type: 'smallint', default: 1 })
  attemptNumber!: number;

  /** Dunning: bir sonraki otomatik deneme zamanı */
  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

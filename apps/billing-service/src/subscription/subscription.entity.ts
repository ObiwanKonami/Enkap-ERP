import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'expired';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;

  @Column({ name: 'plan_id', type: 'varchar', length: 20 })
  planId!: string;

  @Column({ type: 'varchar', length: 20, default: 'trialing' })
  status!: SubscriptionStatus;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart!: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null;

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd!: boolean;

  @Column({ name: 'iyzico_subscription_ref', type: 'varchar', length: 100, nullable: true })
  iyzicoSubscriptionRef!: string | null;

  @Column({ name: 'iyzico_customer_ref', type: 'varchar', length: 100, nullable: true })
  iyzicoCustomerRef!: string | null;

  /** Kayıtlı kart tokeni — PCI DSS: Enkap saklamaz, iyzico verir */
  @Column({ name: 'iyzico_card_token', type: 'varchar', length: 200, nullable: true })
  iyzicoCardToken!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  get isTrialing(): boolean  { return this.status === 'trialing'; }
  get isActive(): boolean    { return this.status === 'active' || this.isTrialing; }
  get isPastDue(): boolean   { return this.status === 'past_due'; }
}

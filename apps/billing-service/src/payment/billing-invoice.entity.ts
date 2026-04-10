import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type BillingInvoiceStatus = 'pending' | 'paid' | 'void';

@Entity('billing_invoices')
export class BillingInvoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50, unique: true })
  invoiceNumber!: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd!: Date;

  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: number;

  /** KDV %20 dahil */
  @Column({ name: 'kdv_kurus', type: 'bigint', default: 0 })
  kdvKurus!: number;

  @Column({ name: 'total_kurus', type: 'bigint' })
  totalKurus!: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: BillingInvoiceStatus;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'pdf_path', type: 'text', nullable: true })
  pdfPath!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { PaymentInstallment } from './payment-installment.entity';

/**
 * Fatura ödeme planı.
 *
 * Her faturaya en fazla bir plan atanabilir (UNIQUE invoice_id).
 * Tek seferlik ödeme → 1 taksitli plan.
 * Taksitli satış → N taksitli plan.
 */
@Entity('payment_plans')
export class PaymentPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'invoice_id', type: 'uuid', unique: true })
  invoiceId!: string;

  @Column({ name: 'installment_cnt', type: 'smallint', default: 1 })
  installmentCnt!: number;

  /** money.ts ölçeği ile uyumlu (NUMERIC 19,4) */
  @Column({ name: 'total_amount', type: 'numeric', precision: 19, scale: 4 })
  totalAmount!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => PaymentInstallment, (inst) => inst.planId, { eager: false })
  installments!: PaymentInstallment[];
}

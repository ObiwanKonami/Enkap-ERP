import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Ödeme planı taksit satırı.
 *
 * Durum:
 *  - paid_at = NULL  → bekliyor
 *  - paid_at = DATE  → ödendi
 *
 * Vade geçikme hesabı: NOW() - due_date (gün cinsinden)
 */
@Entity('payment_installments')
export class PaymentInstallment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @Column({ name: 'installment_no', type: 'smallint' })
  installmentNo!: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;  // 'YYYY-MM-DD'

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  amount!: number;

  /** null → bekliyor */
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'payment_ref', type: 'varchar', length: 100, nullable: true })
  paymentRef!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  get isPending(): boolean {
    return this.paidAt === null;
  }

  /** Gecikme günü (negatif → henüz vadesi gelmemiş) */
  get overdueDays(): number {
    const due  = new Date(this.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  }
}

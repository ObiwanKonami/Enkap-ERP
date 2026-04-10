import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ExpenseLine } from './expense-line.entity';

/** Masraf raporunun mevcut durumu */
export type ExpenseStatus =
  | 'TASLAK'          // Henüz gönderilmemiş, düzenlenebilir
  | 'ONAY_BEKLIYOR'   // Çalışan tarafından gönderildi, yönetici onayı bekliyor
  | 'ONAYLANDI'       // Yönetici onayladı, ödeme bekliyor
  | 'REDDEDILDI'      // Yönetici reddetti, revizyon gerekebilir
  | 'ODENDI';         // Muhasebe tarafından ödeme yapıldı

/**
 * Masraf Raporu.
 *
 * Bir masraf raporu, belirli bir dönem (ay) için çalışanın
 * harcamalarını gruplar. Bir çalışan aynı döneme ait birden
 * fazla taslak raporu olabilir; ancak onay sürecinde tek rapor
 * olması önerilir.
 *
 * Tutar her zaman kuruş cinsinden saklanır (1 TL = 100 kuruş).
 * totalKurus, masraf kalemleri üzerinden hesaplanarak güncellenir.
 */
@Entity('expense_reports')
export class ExpenseReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu — TenantAwareSubscriber tarafından doğrulanır */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Masraf raporunu oluşturan çalışanın hr-service içindeki UUID'si */
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  /**
   * Çalışan adı anlık görüntüsü.
   * Çalışan bilgileri sonradan değişse dahi rapor doğru görüntülenir.
   */
  @Column({ name: 'employee_name', type: 'varchar', length: 200 })
  employeeName!: string;

  /** Masraf dönemi (örn. "2026-03") */
  @Column({ name: 'period', type: 'varchar', length: 7 })
  period!: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'TASLAK',
  })
  status!: ExpenseStatus;

  /**
   * Tüm kalemlerin KDV dahil toplam tutarı — kuruş.
   * Kalem eklendiğinde / silindiğinde servis tarafından güncellenir.
   */
  @Column({
    name: 'total_kurus',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  totalKurus!: number;

  /** Para birimi kodu (ISO 4217). Varsayılan: TRY */
  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'TRY' })
  currency!: string;

  /** Rapor düzeyinde genel notlar */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Çalışanın raporu onaya gönderdiği zaman */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  /** Onaylayan yöneticinin user ID'si */
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  /** Red gerekçesi (yönetici tarafından girilir) */
  @Column({ name: 'rejected_reason', type: 'text', nullable: true })
  rejectedReason!: string | null;

  /** Muhasebenin ödeme yaptığı tarih */
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  /** Raporu sisteme kaydeden kullanıcı UUID'si */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Masraf kalemleri — yükleme ve kaydetme otomatik yapılır */
  @OneToMany(() => ExpenseLine, (line) => line.report, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  lines!: ExpenseLine[];
}

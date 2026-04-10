import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Yıllık İzin Bakiyesi.
 *
 * Her çalışan × yıl için tek kayıt (UNIQUE kısıtı).
 *
 * Hak hesabı (İş Kanunu Md. 54-55):
 *  Hizmet yılı hesabında işe giriş tarihi esas alınır.
 *  Yıl başında `earned_days` güncellenir (cron job ile).
 *
 * Taşıma (devir):
 *  Kullanılmayan izin günleri bir sonraki yıla taşınabilir
 *  (max 30 iş günü — şirket politikasına göre ayarlanabilir).
 */
@Entity('leave_balances')
@Unique(['tenantId', 'employeeId', 'year'])
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId!: string;

  /** Takvim yılı (örn: 2025) */
  @Column({ type: 'smallint' })
  year!: number;

  /** Bu yıl kazanılan izin hakkı (iş günü) — hizmet süresine göre */
  @Column({ name: 'earned_days', type: 'int', default: 0 })
  earnedDays!: number;

  /** Önceki yıldan devreden gün */
  @Column({ name: 'carried_over_days', type: 'int', default: 0 })
  carriedOverDays!: number;

  /** Onaylanmış ve kullanılan gün sayısı */
  @Column({ name: 'used_days', type: 'int', default: 0 })
  usedDays!: number;

  /** Bekleyen (onay bekleyen) gün sayısı */
  @Column({ name: 'pending_days', type: 'int', default: 0 })
  pendingDays!: number;

  /** Kalan kullanılabilir gün: earned + carried - used - pending */
  get remainingDays(): number {
    return this.earnedDays + this.carriedOverDays - this.usedDays - this.pendingDays;
  }

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

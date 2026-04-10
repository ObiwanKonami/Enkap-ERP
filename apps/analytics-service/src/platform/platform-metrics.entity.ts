import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Günlük platform metrik snapshot'ı.
 *
 * Her gece 01:00 UTC'de UsageCollectorService tarafından üretilir.
 * Tarihsel trend (MRR büyümesi, churn oranı, plan dağılımı) için kullanılır.
 */
@Entity('platform_metrics_snapshots')
export class PlatformMetricsSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'snapshot_date', type: 'date', unique: true })
  snapshotDate!: string;

  @Column({ name: 'total_tenants', type: 'int', default: 0 })
  totalTenants!: number;

  @Column({ name: 'trialing_tenants', type: 'int', default: 0 })
  trialingTenants!: number;

  @Column({ name: 'active_tenants', type: 'int', default: 0 })
  activeTenants!: number;

  @Column({ name: 'past_due_tenants', type: 'int', default: 0 })
  pastDueTenants!: number;

  @Column({ name: 'churned_tenants', type: 'int', default: 0 })
  churnedTenants!: number;

  @Column({ name: 'new_tenants', type: 'int', default: 0 })
  newTenants!: number;

  @Column({ name: 'churned_today', type: 'int', default: 0 })
  churnedToday!: number;

  /** Aylık yinelenen gelir (kuruş) */
  @Column({ name: 'mrr_kurus', type: 'bigint', default: 0 })
  mrrKurus!: number;

  /** Yıllık yinelenen gelir tahmini = MRR × 12 (kuruş) */
  @Column({ name: 'arr_kurus', type: 'bigint', default: 0 })
  arrKurus!: number;

  @Column({ name: 'starter_count', type: 'int', default: 0 })
  starterCount!: number;

  @Column({ name: 'business_count', type: 'int', default: 0 })
  businessCount!: number;

  @Column({ name: 'enterprise_count', type: 'int', default: 0 })
  enterpriseCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  /** Churn oranı: bugün iptal / dünkü aktif */
  churnRate(previousActive: number): number {
    if (previousActive === 0) return 0;
    return parseFloat((this.churnedToday / previousActive * 100).toFixed(2));
  }
}

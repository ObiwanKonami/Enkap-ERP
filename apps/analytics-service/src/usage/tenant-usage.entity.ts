import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Tenant bazında günlük kullanım metrikleri.
 *
 * Her tenant şemasından COUNT sorgusu atılarak doldurulur.
 * Özellik benimseme oranı (feature adoption) için kullanılır.
 */
@Entity('tenant_usage_metrics')
export class TenantUsageMetric {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'metric_date', type: 'date' })
  metricDate!: string;

  @Column({ name: 'user_count', type: 'int', default: 0 })
  userCount!: number;

  @Column({ name: 'invoice_count', type: 'int', default: 0 })
  invoiceCount!: number;

  @Column({ name: 'product_count', type: 'int', default: 0 })
  productCount!: number;

  @Column({ name: 'stock_movements', type: 'int', default: 0 })
  stockMovements!: number;

  @Column({ name: 'lead_count', type: 'int', default: 0 })
  leadCount!: number;

  @Column({ name: 'employee_count', type: 'int', default: 0 })
  employeeCount!: number;

  @Column({ name: 'used_marketplace', type: 'boolean', default: false })
  usedMarketplace!: boolean;

  @Column({ name: 'used_ml', type: 'boolean', default: false })
  usedMl!: boolean;

  @Column({ name: 'used_hr', type: 'boolean', default: false })
  usedHr!: boolean;

  @Column({ name: 'used_crm', type: 'boolean', default: false })
  usedCrm!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

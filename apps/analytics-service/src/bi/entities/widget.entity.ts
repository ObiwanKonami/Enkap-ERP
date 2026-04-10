import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Dashboard } from './dashboard.entity';
import { ReportDefinition, ChartType } from './report-definition.entity';

/**
 * Dashboard üzerindeki tek bir görselleştirme birimi.
 *
 * Her widget opsiyonel olarak bir ReportDefinition'a bağlanır.
 * chart_type ve default_parameters, bağlı rapor tanımının
 * değerlerini widget bazında override edebilir.
 *
 * Tablo: control_plane.widgets
 */
@Entity('widgets')
@Index('idx_widgets_dashboard', ['dashboardId'])
@Index('idx_widgets_tenant', ['tenantId'])
export class Widget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Bağlı olduğu dashboard ID'si */
  @Column({ name: 'dashboard_id', type: 'uuid' })
  dashboardId!: string;

  /** Tenant izolasyonu — dashboard silmeden doğrudan tenant filtresi için */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Widget başlığı */
  @Column({ name: 'title', type: 'varchar', length: 150 })
  title!: string;

  /**
   * Bağlı rapor tanımı ID'si (opsiyonel).
   * null ise widget statik veya dış kaynaklı veri gösterir.
   */
  @Column({ name: 'report_definition_id', type: 'uuid', nullable: true })
  reportDefinitionId?: string;

  /**
   * Grafik türü override.
   * Tanımlanırsa ReportDefinition.chartType değerini geçersiz kılar.
   */
  @Column({
    name: 'chart_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  chartType?: ChartType;

  /**
   * Widget için varsayılan parametre değerleri — JSON formatında.
   * Rapor çalıştırılırken bu değerler kullanılır (kullanıcı override edebilir).
   */
  @Column({ name: 'default_parameters', type: 'jsonb', default: '{}' })
  defaultParameters!: Record<string, unknown>;

  /**
   * Otomatik yenileme aralığı (saniye).
   * Minimum 30 saniye (istemci tarafı da zorunlu kılmalı).
   * null ise manuel yenileme.
   */
  @Column({ name: 'refresh_interval_seconds', type: 'int', nullable: true })
  refreshIntervalSeconds?: number;

  /**
   * Dashboard içindeki sıralama pozisyonu.
   * Küçük değer önce gösterilir.
   */
  @Column({ name: 'position', type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Dashboard ilişkisi — cascade delete (dashboard silinince widget da silinir) */
  @ManyToOne(() => Dashboard, (dashboard) => dashboard.widgets, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'dashboard_id' })
  dashboard!: Dashboard;

  /** Rapor tanımı ilişkisi — SET NULL (rapor silinince widget bağlantısı kaldırılır) */
  @ManyToOne(() => ReportDefinition, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'report_definition_id' })
  reportDefinition?: ReportDefinition;
}

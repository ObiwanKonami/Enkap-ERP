import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Widget } from './widget.entity';

/**
 * Responsive grid layout öğesi.
 * react-grid-layout veya benzeri bileşen için koordinat ve boyut bilgisi.
 */
export interface GridItem {
  /** Widget kimliği */
  i: string;
  /** Sol kolon pozisyonu */
  x: number;
  /** Üst satır pozisyonu */
  y: number;
  /** Genişlik (kolon sayısı) */
  w: number;
  /** Yükseklik (satır sayısı) */
  h: number;
}

/**
 * Responsive breakpoint bazlı layout tanımı.
 * lg: masaüstü (12 kolon), md: tablet (10 kolon)
 */
export interface DashboardLayout {
  lg: GridItem[];
  md: GridItem[];
}

/**
 * Tenant'a özel BI dashboard tanımı.
 *
 * Bir tenant birden fazla dashboard oluşturabilir.
 * Yalnızca bir dashboard is_default = true olabilir.
 *
 * Tablo: control_plane.dashboards
 */
@Entity('dashboards')
@Index('idx_dashboards_tenant', ['tenantId'])
export class Dashboard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Kullanıcı tanımlı dashboard adı */
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /** Opsiyonel açıklama */
  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  /**
   * Responsive grid layout tanımı — JSON formatında.
   * { lg: GridItem[], md: GridItem[] } şeklinde saklanır.
   * Her GridItem bir widget'ın konumunu ve boyutunu tanımlar.
   */
  @Column({ name: 'layout', type: 'jsonb', default: '{"lg":[],"md":[]}' })
  layout!: DashboardLayout;

  /**
   * Varsayılan dashboard mı?
   * Bir tenant'ta en fazla bir dashboard true olabilir.
   * BIService.createDashboard() bu kısıtı uygular.
   */
  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  /** Dashboard'u oluşturan kullanıcı ID'si */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Dashboard üzerindeki widgetlar (cascade ile silinir) */
  @OneToMany(() => Widget, (widget) => widget.dashboard, { cascade: true, eager: false })
  widgets?: Widget[];
}

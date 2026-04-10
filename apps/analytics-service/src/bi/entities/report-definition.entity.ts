import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Rapor parametresi tanımı.
 * query_template içindeki :param_name ifadelerine karşılık gelir.
 */
export interface ReportParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'date' | 'uuid';
  required: boolean;
  default?: unknown;
}

/** Grafik türü — kullanıcı arayüzünde hangi bileşenle render edileceği */
export enum ChartType {
  TABLE  = 'table',
  BAR    = 'bar',
  LINE   = 'line',
  PIE    = 'pie',
  AREA   = 'area',
  METRIC = 'metric',
}

/**
 * Raporun hangi servis veritabanını sorgulayacağı.
 * BIService içinde bu değere göre doğru tenant DataSource seçilir.
 */
export enum ReportDataSource {
  FINANCIAL = 'financial',
  STOCK     = 'stock',
  HR        = 'hr',
  CRM       = 'crm',
  PURCHASE  = 'purchase',
  ORDER     = 'order',
}

/** Zamanlanmış rapor çıktı formatı */
export enum ScheduleFormat {
  PDF   = 'pdf',
  EXCEL = 'excel',
}

/**
 * Kullanıcı tanımlı özel rapor şablonu.
 *
 * Her tenant kendi SELECT sorgularını parameterized SQL şablonu olarak
 * kaydeder. Çalıştırma anında güvenlik doğrulaması yapılır:
 *  1. Yalnızca SELECT ifadesine izin verilir (DML/DDL engellenir)
 *  2. Parametreler $N placeholderlarına dönüştürülür (SQL injection önlemi)
 *  3. search_path tenant şemasına kilitli (cross-tenant erişim imkansız)
 *
 * Tablo: control_plane.report_definitions
 */
@Entity('report_definitions')
@Index('idx_report_definitions_tenant', ['tenantId'])
export class ReportDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu — tüm sorgu ve erişim kontrollerinde zorunlu */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Kullanıcı tanımlı rapor adı (gösterme amaçlı) */
  @Column({ name: 'name', type: 'varchar', length: 100 })
  name!: string;

  /** Opsiyonel açıklama */
  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  /**
   * Parameterized SQL şablonu.
   * Örnek: SELECT * FROM invoices WHERE issued_at >= :start_date AND issued_at <= :end_date
   * :param_name formatı — çalıştırma anında $N'e dönüştürülür.
   */
  @Column({ name: 'query_template', type: 'text' })
  queryTemplate!: string;

  /**
   * Parametre tanımları — JSON formatında.
   * ReportParameterDefinition dizisi olarak saklanır.
   */
  @Column({ name: 'parameters', type: 'jsonb', default: '[]' })
  parameters!: ReportParameterDefinition[];

  /** Varsayılan grafik türü — widget override edebilir */
  @Column({
    name: 'chart_type',
    type: 'varchar',
    length: 20,
    default: ChartType.TABLE,
  })
  chartType!: ChartType;

  /** Sorgunun çalışacağı servis veritabanı */
  @Column({
    name: 'data_source',
    type: 'varchar',
    length: 20,
    default: ReportDataSource.FINANCIAL,
  })
  dataSource!: ReportDataSource;

  /**
   * Paylaşım linki ile herkese açık mı?
   * false iken share_token bile geçerli değil.
   */
  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  /** Paylaşım token'ı — /bi/shared/:token endpoint'i için */
  @Column({ name: 'share_token', type: 'uuid', nullable: true, unique: true })
  shareToken?: string;

  /**
   * Cron ifadesi — zamanlanmış otomatik çalıştırma.
   * Örnek: "0 9 * * 1" = Her Pazartesi 09:00 (Europe/Istanbul)
   */
  @Column({ name: 'schedule_cron', type: 'varchar', length: 100, nullable: true })
  scheduleCron?: string;

  /** Zamanlanmış raporu gönderilecek e-posta adresi */
  @Column({ name: 'schedule_email', type: 'varchar', length: 255, nullable: true })
  scheduleEmail?: string;

  /** Zamanlanmış rapor çıktı formatı */
  @Column({
    name: 'schedule_format',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  scheduleFormat?: ScheduleFormat;

  /** Son çalıştırma zamanı */
  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt?: Date;

  /** Raporu oluşturan kullanıcı ID'si */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

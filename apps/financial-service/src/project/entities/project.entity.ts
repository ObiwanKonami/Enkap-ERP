import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Proje durumu — iş akışı: AKTIF → TAMAMLANDI veya IPTAL
 */
export type ProjectStatus = 'AKTIF' | 'BEKLEMEDE' | 'TAMAMLANDI' | 'IPTAL';

/**
 * Proje Kaydı
 *
 * Her proje için bütçe, gerçekleşen maliyet ve fatura gelirleri izlenir.
 * Proje karlılık analizi (P&L) bu entity üzerinden hesaplanır.
 *
 * Muhasebe entegrasyonu:
 *  - Proje maliyetleri → project_costs tablosuna kaydedilir
 *  - Fatura gelirleri → invoices üzerinden linkRevenue() ile eklenir
 *  - Kar/zarar = revenueKurus - actualCostKurus
 */
@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Proje kodu — otomatik üretilir: PRJ-{YIL}-{SIRA} */
  @Column({ name: 'project_code', length: 30, unique: true })
  projectCode!: string;

  /** Proje adı */
  @Column({ length: 200 })
  name!: string;

  /** Proje açıklaması */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** CRM'den müşteri UUID'si (opsiyonel) */
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  /** Müşteri adı (CRM'den kopyalanır, sorgu hızı için) */
  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName?: string;

  /** Proje durumu */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'AKTIF',
  })
  status!: ProjectStatus;

  /** Başlangıç tarihi */
  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  /** Bitiş tarihi (opsiyonel) */
  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: Date;

  /**
   * Planlanan bütçe — kuruş
   * Proje onayında belirlenen toplam bütçe tutarı
   */
  @Column({ name: 'budget_kurus', type: 'bigint', default: 0 })
  budgetKurus!: bigint;

  /**
   * Gerçekleşen maliyet — kuruş
   * project_costs tablosundan güncellenir (addCost çağrısında)
   */
  @Column({ name: 'actual_cost_kurus', type: 'bigint', default: 0 })
  actualCostKurus!: bigint;

  /**
   * Fatura gelirleri — kuruş
   * Proje bazlı fatura kesildiğinde linkRevenue() ile artırılır
   */
  @Column({ name: 'revenue_kurus', type: 'bigint', default: 0 })
  revenueKurus!: bigint;

  /** Para birimi (varsayılan: TRY) */
  @Column({ length: 3, default: 'TRY' })
  currency!: string;

  /** Proje notları */
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

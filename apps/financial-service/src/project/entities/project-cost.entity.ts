import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * Proje maliyet tipi — muhasebe hesabı eşlemesi için kullanılır
 *
 * ISGUCU      → Hesap 770/740 (İşçilik gideri)
 * MALZEME     → Hesap 730/150 (Malzeme gideri)
 * GENEL_GIDER → Hesap 760 (Genel üretim giderleri)
 * SEYAHAT     → Hesap 770 (Seyahat giderleri)
 * DIGER       → Hesap 770 (Diğer giderler)
 */
export type CostType = 'ISGUCU' | 'MALZEME' | 'GENEL_GIDER' | 'SEYAHAT' | 'DIGER';

/**
 * Proje Maliyet Kalemi
 *
 * Her maliyet kaydı bir projeye (opsiyonel olarak bir göreve) bağlıdır.
 * Dış sistemlerden referans alınabilir (satın alma siparişi, masraf raporu vb).
 *
 * Kayıt eklendiğinde ProjectService.addCost() → project.actualCostKurus güncellenir.
 */
@Entity('project_costs')
export class ProjectCost {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /** Üst proje — silinirse maliyetler de silinir (CASCADE) */
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  /**
   * Bağlı görev UUID'si — maliyet belirli bir WBS kalemine atanabilir.
   * Null ise direkt proje maliyeti.
   */
  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId?: string;

  /** Maliyet tipi */
  @Column({
    name: 'cost_type',
    type: 'varchar',
    length: 20,
  })
  costType!: CostType;

  /** Maliyet açıklaması */
  @Column({ length: 300 })
  description!: string;

  /** Maliyet tarihi */
  @Column({ name: 'cost_date', type: 'date' })
  costDate!: Date;

  /** Tutar — kuruş */
  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: bigint;

  /**
   * Referans kaynak tipi — dış sistem entegrasyonu için.
   * Örn: 'purchase_order', 'expense_report', 'payroll'
   */
  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  /**
   * Referans kaynak ID'si — dış sistem birincil anahtarı.
   * referenceType ile birlikte kullanılır.
   */
  @Column({ name: 'reference_id', length: 100, nullable: true })
  referenceId?: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

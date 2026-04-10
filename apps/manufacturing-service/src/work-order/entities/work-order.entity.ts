import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkOrderOperation } from './work-order-operation.entity';

/** İş emri durumu */
export type WorkOrderStatus = 'TASLAK' | 'PLANLI' | 'URETIMDE' | 'TAMAMLANDI' | 'IPTAL';

/** İş Emri — Bill of Materials'a dayalı üretim talimatı */
@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu için zorunlu alan */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** İş emri numarası — format: WO-{YYYY}-{NNNN} */
  @Column({ name: 'wo_number', length: 20, unique: true })
  woNumber!: string;

  /** Kullanılan reçete UUID */
  @Column({ name: 'bom_id', type: 'uuid' })
  bomId!: string;

  /** Mamul ürün UUID (stock-service) */
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  /** Mamul ürün adı snapshot */
  @Column({ name: 'product_name', length: 200 })
  productName!: string;

  /** Hedef üretim miktarı */
  @Column({ name: 'target_quantity', type: 'numeric', precision: 12, scale: 3 })
  targetQuantity!: number;

  /** Gerçekleşen üretim miktarı */
  @Column({ name: 'produced_quantity', type: 'numeric', precision: 12, scale: 3, default: 0 })
  producedQuantity!: number;

  /** İş emri durumu */
  @Column({
    type: 'varchar',
    length: 20,
    default: 'TASLAK',
  })
  status!: WorkOrderStatus;

  /** Planlanan başlangıç tarihi */
  @Column({ name: 'planned_start_date', type: 'date' })
  plannedStartDate!: Date;

  /** Planlanan bitiş tarihi */
  @Column({ name: 'planned_end_date', type: 'date' })
  plannedEndDate!: Date;

  /** Fiili başlangıç tarihi — üretim başladığında set edilir */
  @Column({ name: 'actual_start_date', type: 'date', nullable: true })
  actualStartDate?: Date;

  /** Fiili bitiş tarihi — üretim tamamlandığında set edilir */
  @Column({ name: 'actual_end_date', type: 'date', nullable: true })
  actualEndDate?: Date;

  /** Mamulün girileceği depo UUID */
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId?: string;

  /** Notlar */
  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** İş emrini oluşturan kullanıcı UUID */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Operasyon adımları */
  @OneToMany(() => WorkOrderOperation, (op) => op.workOrder, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  operations!: WorkOrderOperation[];
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkOrder } from './work-order.entity';

/** Operasyon adımı durumu */
export type OperationStatus = 'BEKLIYOR' | 'DEVAM' | 'TAMAMLANDI';

/** İş Emri Operasyonu — üretim sürecindeki adımlar (talaşlama, montaj, boya vb.) */
@Entity('work_order_operations')
export class WorkOrderOperation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'work_order_id', type: 'uuid' })
  workOrderId!: string;

  @ManyToOne(() => WorkOrder, (wo) => wo.operations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: WorkOrder;

  /** Operasyon sırası — küçük değer önce yapılır */
  @Column({ type: 'int' })
  sequence!: number;

  /** Operasyon adı (ör: Talaşlama, Montaj, Boya) */
  @Column({ name: 'operation_name', length: 200 })
  operationName!: string;

  /** İş merkezi (ör: Torna Tezgahı 1, Montaj Hattı A) */
  @Column({ name: 'work_center', length: 100, nullable: true })
  workCenter?: string;

  /** Planlanan süre — dakika cinsinden */
  @Column({ name: 'planned_duration_minutes', type: 'int' })
  plannedDurationMinutes!: number;

  /** Fiili süre — tamamlandığında doldurulur */
  @Column({ name: 'actual_duration_minutes', type: 'int', nullable: true })
  actualDurationMinutes?: number;

  /** Operasyon durumu */
  @Column({
    type: 'varchar',
    length: 20,
    default: 'BEKLIYOR',
  })
  status!: OperationStatus;

  /** Tamamlanma tarihi */
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;
}

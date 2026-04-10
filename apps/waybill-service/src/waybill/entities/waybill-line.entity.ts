import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Waybill } from './waybill.entity';

@Entity('waybill_lines')
export class WaybillLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => Waybill, (w) => w.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waybill_id' })
  waybill!: Waybill;

  @Column({ name: 'waybill_id', type: 'uuid' })
  waybillId!: string;

  /** Ürün UUID (stock-service) */
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string;

  @Column({ name: 'product_name', length: 250 })
  productName!: string;

  @Column({ length: 50, nullable: true, type: 'varchar' })
  sku?: string;

  @Column({ name: 'unit_code', length: 10, default: 'ADET' })
  unitCode!: string;

  @Column({ type: 'numeric', precision: 12, scale: 4 })
  quantity!: number;

  /** Kaynak depo UUID */
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId?: string;

  /** Hedef depo UUID (TRANSFER irsaliyesi için) */
  @Column({ name: 'target_warehouse_id', type: 'uuid', nullable: true })
  targetWarehouseId?: string;

  /** Lot / seri no (opsiyonel) */
  @Column({ name: 'lot_number', length: 50, nullable: true, type: 'varchar' })
  lotNumber?: string;

  @Column({ name: 'serial_number', length: 100, nullable: true, type: 'varchar' })
  serialNumber?: string;

  /** stock-service movement ID (bağlantı için) */
  @Column({ name: 'movement_id', type: 'uuid', nullable: true })
  movementId?: string;
}

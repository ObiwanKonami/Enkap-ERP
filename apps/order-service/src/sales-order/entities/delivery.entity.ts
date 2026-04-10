import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Sevkiyat Kaydı
 *
 * Aynı sipariş için birden fazla Delivery oluşturulabilir (kısmi sevkiyat).
 * Her Delivery → stock-service'e CIKIS hareketi tetikler.
 */
@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'sales_order_id', type: 'uuid' })
  salesOrderId!: string;

  /** İrsaliye numarası — format: IRS-{YYYY}-{NNNN} */
  @Column({ name: 'delivery_number', length: 50 })
  deliveryNumber!: string;

  @Column({ name: 'status', length: 20, default: 'pending' })
  status!: string;

  /** Sevk tarihi — DB sütunu: delivery_date */
  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate?: Date;

  /** Teslim edilen kalemler (JSONB) — V040 migration ile eklendi */
  @Column({ type: 'jsonb', default: [] })
  items!: Array<{
    productId:     string;
    productName:   string;
    warehouseId:   string;
    quantity:      number;
    movementId?:   string;
  }>;

  /** Kargo firması */
  @Column({ name: 'carrier', length: 100, nullable: true })
  carrier?: string;

  /** Kargo takip numarası */
  @Column({ name: 'tracking_number', length: 100, nullable: true })
  trackingNumber?: string;

  /** Filo aracı UUID — V040 migration ile eklendi */
  @Column({ name: 'vehicle_id', type: 'uuid', nullable: true })
  vehicleId?: string;

  /** Sürücü UUID — V040 migration ile eklendi */
  @Column({ name: 'driver_id', type: 'uuid', nullable: true })
  driverId?: string;

  /** fleet-service'de oluşturulan sefer UUID — V040 migration ile eklendi */
  @Column({ name: 'trip_id', type: 'uuid', nullable: true })
  tripId?: string;

  /** Stok servisi hareketi başarılı mı? — V040 migration ile eklendi */
  @Column({ name: 'stock_synced', default: false })
  stockSynced!: boolean;

  @Column({ name: 'stock_sync_error', type: 'text', nullable: true })
  stockSyncError?: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

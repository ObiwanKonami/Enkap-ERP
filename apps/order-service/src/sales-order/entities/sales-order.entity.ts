import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SalesOrderLine } from './sales-order-line.entity';

/**
 * Satış Siparişi Durumu (V030 DB değerleri)
 *
 * draft      → Oluşturuldu / taslak
 * confirmed  → Onaylandı
 * processing → Hazırlanıyor
 * shipped    → Sevk edildi (kısmi veya tam)
 * delivered  → Teslim edildi
 * cancelled  → İptal edildi
 */
export type SalesOrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/**
 * Satış Siparişi
 *
 * O2C akışı:
 *   draft → confirmed → processing → shipped → delivered
 *
 * Sevkiyat sonrası stock-service'e CIKIS hareketi HTTP olarak gönderilir.
 */
@Entity('sales_orders')
export class SalesOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /**
   * Sipariş numarası — format: SO-{YYYY}-{NNNN}
   * PostgreSQL sequence ile race-free üretilir.
   */
  @Column({ name: 'order_number', length: 50, unique: true })
  soNumber!: string;

  /** Müşteri ID (CRM Contact) */
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'draft',
  })
  status!: SalesOrderStatus;

  /** Sipariş tarihi */
  @Column({ name: 'order_date', type: 'date' })
  orderDate!: Date;

  /** Taahhüt edilen teslimat tarihi — DB sütunu: delivery_date */
  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate?: Date;

  /** Teslimat adresi */
  @Column({ name: 'delivery_address', type: 'text', nullable: true })
  deliveryAddress?: string;

  /** Notlar */
  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** KDV toplamı — kuruş */
  @Column({ name: 'kdv_kurus', type: 'bigint', default: 0 })
  kdvKurus!: number;

  /** Genel toplam — kuruş */
  @Column({ name: 'total_kurus', type: 'bigint', default: 0 })
  totalKurus!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => SalesOrderLine, (line) => line.order, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  lines!: SalesOrderLine[];
}

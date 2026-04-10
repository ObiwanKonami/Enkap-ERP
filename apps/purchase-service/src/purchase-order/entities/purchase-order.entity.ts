import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PurchaseOrderLine } from './purchase-order-line.entity';

/**
 * Satın Alma Siparişi Durumu (V030 DB değerleri)
 *
 * draft    → Oluşturuldu / taslak
 * sent     → Tedarikçiye iletildi / onaylandı
 * partial  → Kısmi mal kabul edildi
 * received → Tüm kalemler teslim alındı
 * cancelled → İptal edildi
 */
export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partial'
  | 'received'
  | 'cancelled';

/**
 * Satın Alma Siparişi (PO)
 *
 * Satın alma akışı:
 *   draft → sent → partial / received
 *
 * Mal kabul (GoodsReceipt) sonrası stock-service'e GIRIS hareketi HTTP olarak gönderilir.
 */
@Entity('purchase_orders')
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /**
   * PO numarası — format: PO-{YYYY}-{NNNN}
   * PostgreSQL sequence ile üretilir (race-free)
   */
  @Column({ name: 'order_number', length: 50, unique: true })
  poNumber!: string;

  /** Tedarikçi UUID'si */
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId!: string;

  /** Tedarikçi adı snapshot — CRM'den kopyalanır, sonradan değişse bile korunur */
  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName?: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'draft',
  })
  status!: PurchaseOrderStatus;

  /** Sipariş tarihi */
  @Column({ name: 'order_date', type: 'date' })
  orderDate!: Date;

  /** Beklenen teslimat tarihi */
  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDeliveryDate?: Date;

  /** Notlar */
  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Ara toplam (KDV hariç) — kuruş */
  @Column({ name: 'subtotal_kurus', type: 'bigint', default: 0 })
  subtotalKurus!: number;

  /** KDV toplamı — kuruş */
  @Column({ name: 'kdv_kurus', type: 'bigint', default: 0 })
  kdvKurus!: number;

  /** Genel toplam — kuruş */
  @Column({ name: 'total_kurus', type: 'bigint', default: 0 })
  totalKurus!: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PurchaseOrderLine, (line) => line.order, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  lines!: PurchaseOrderLine[];
}

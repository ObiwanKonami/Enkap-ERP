import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

/** Satın Alma Sipariş Kalemi */
@Entity('purchase_order_lines')
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'purchase_order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => PurchaseOrder, (order) => order.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  order!: PurchaseOrder;

  /** stock-service ürün UUID'si */
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string;

  /** Ürün adı / açıklama snapshot — DB sütunu: description */
  @Column({ name: 'description', length: 300 })
  productName!: string;

  /** Sipariş edilen miktar */
  @Column({ type: 'numeric', precision: 15, scale: 3 })
  quantity!: number;

  /** Birim kodu — DB sütunu: unit */
  @Column({ name: 'unit', length: 20, default: 'ADET' })
  unitCode!: string;

  /** Mal kabul edilen miktar (kısmi teslimat) — DB sütunu: received_qty */
  @Column({ name: 'received_qty', type: 'numeric', precision: 15, scale: 3, default: 0 })
  receivedQuantity!: number;

  /** Birim fiyat — kuruş */
  @Column({ name: 'unit_price_kurus', type: 'bigint' })
  unitPriceKurus!: number;

  /** KDV oranı — %0, %1, %10, %20 */
  @Column({ name: 'kdv_rate', type: 'numeric', precision: 5, scale: 2, default: 20 })
  kdvRate!: number;

  /** KDV hariç satır toplam — kuruş */
  @Column({ name: 'line_total_kurus', type: 'bigint', default: 0 })
  lineTotalKurus!: number;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SalesOrder } from './sales-order.entity';

/** Satış Sipariş Kalemi */
@Entity('sales_order_lines')
export class SalesOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'sales_order_id', type: 'uuid' })
  salesOrderId!: string;

  @ManyToOne(() => SalesOrder, (order) => order.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sales_order_id' })
  order!: SalesOrder;

  /** stock-service ürün UUID */
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string;

  /** Ürün adı snapshot — DB sütunu: description */
  @Column({ name: 'description', length: 300 })
  productName!: string;

  /** Sipariş edilen miktar */
  @Column({ type: 'numeric', precision: 15, scale: 3 })
  quantity!: number;

  /** Birim kodu — DB sütunu: unit */
  @Column({ name: 'unit', length: 20, default: 'ADET' })
  unitCode!: string;

  /** Birim satış fiyatı — kuruş */
  @Column({ name: 'unit_price_kurus', type: 'bigint' })
  unitPriceKurus!: number;

  /** İskonto oranı */
  @Column({ name: 'discount_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  discountRate!: number;

  /** KDV oranı — %0, %1, %10, %20 */
  @Column({ name: 'kdv_rate', type: 'numeric', precision: 5, scale: 2, default: 20 })
  kdvRate!: number;

  /** İskonto sonrası KDV hariç satır toplam — kuruş */
  @Column({ name: 'line_total_kurus', type: 'bigint', default: 0 })
  lineTotalKurus!: number;
}

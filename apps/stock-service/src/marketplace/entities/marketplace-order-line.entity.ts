import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MarketplaceOrder } from './marketplace-order.entity';

@Entity('marketplace_order_lines')
export class MarketplaceOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @ManyToOne(() => MarketplaceOrder, (order) => order.lines)
  @JoinColumn({ name: 'order_id' })
  order!: MarketplaceOrder;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'platform_line_id', type: 'varchar', length: 100, nullable: true })
  platformLineId!: string | null;

  /** Eşleştirilmiş iç ürün UUID'si (null → henüz eşleşme yok) */
  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId!: string | null;

  @Column({ name: 'platform_sku', type: 'varchar', length: 100 })
  platformSku!: string;

  @Column({ name: 'platform_barcode', type: 'varchar', length: 100, nullable: true })
  platformBarcode!: string | null;

  @Column({ name: 'product_name', type: 'varchar', length: 300 })
  productName!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  quantity!: number;

  @Column({ name: 'unit_price_kurus', type: 'bigint', default: 0 })
  unitPriceKurus!: number;

  @Column({ name: 'commission_kurus', type: 'bigint', default: 0 })
  commissionKurus!: number;
}

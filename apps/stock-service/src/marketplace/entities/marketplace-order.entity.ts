import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MarketplaceOrderLine } from './marketplace-order-line.entity';
import type { MarketplacePlatform } from './marketplace-integration.entity';

export type MarketplaceOrderStatus =
  | 'NEW'
  | 'PICKING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

@Entity('marketplace_orders')
export class MarketplaceOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 30 })
  platform!: MarketplacePlatform;

  @Column({ name: 'platform_order_id', type: 'varchar', length: 100 })
  platformOrderId!: string;

  @Column({ name: 'platform_order_no', type: 'varchar', length: 100, nullable: true })
  platformOrderNo!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'NEW' })
  status!: MarketplaceOrderStatus;

  @Column({ name: 'customer_name', type: 'varchar', length: 200, nullable: true })
  customerName!: string | null;

  @Column({ name: 'cargo_tracking_no', type: 'varchar', length: 100, nullable: true })
  cargoTrackingNo!: string | null;

  /** Sipariş tutarı — kuruş cinsinden (float kaymaması) */
  @Column({ name: 'gross_amount_kurus', type: 'bigint', default: 0 })
  grossAmountKurus!: number;

  /** Oluşturulan stok hareketi ID'si (null → henüz rezerve edilmedi) */
  @Column({ name: 'stock_movement_id', type: 'uuid', nullable: true })
  stockMovementId!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @Column({ name: 'ordered_at', type: 'timestamptz', nullable: true })
  orderedAt!: Date | null;

  @OneToMany(() => MarketplaceOrderLine, (line) => line.order, { cascade: true })
  lines!: MarketplaceOrderLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from '../../product/entities/product.entity';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';

/**
 * Stok hareket tipleri:
 *
 * GIRIS       — Satın alma / üretimden giriş (fatura veya irsaliye ile)
 * CIKIS       — Satış / tüketime çıkış (fatura veya irsaliye ile)
 * TRANSFER    — Depolar arası transfer (hem sourceWarehouse hem targetWarehouse dolu)
 * SAYIM       — Fiziksel sayım düzeltmesi (+ veya - olabilir)
 * IADE_GIRIS  — Alış iadesi (tedarikçiye iade)
 * IADE_CIKIS  — Satış iadesi (müşteriden geri alım)
 * FIRE        — Fire / kayıp / bozulma
 */
export type MovementType =
  | 'GIRIS'
  | 'CIKIS'
  | 'TRANSFER'
  | 'SAYIM'
  | 'IADE_GIRIS'
  | 'IADE_CIKIS'
  | 'FIRE';

/**
 * Stok Hareketi Entity.
 *
 * Her hareket kaydı değiştirilemez (immutable) — silme veya güncelleme yapılmaz.
 * Hata durumunda ters hareket (karşı kayıt) oluşturulur.
 *
 * TRANSFER tipi için:
 *  - warehouseId  = çıkış deposu
 *  - targetWarehouseId = giriş deposu
 */
@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'product_id' })
  productId!: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ name: 'warehouse_id' })
  warehouseId!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  /** Sadece TRANSFER tipinde dolu */
  @Column({ name: 'target_warehouse_id', type: 'uuid', nullable: true })
  targetWarehouseId!: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'target_warehouse_id' })
  targetWarehouse!: Warehouse | null;

  @Column({ length: 20 })
  type!: MovementType;

  /**
   * Miktar — her zaman pozitif.
   * Yönü `type` alanı belirler (GIRIS artırır, CIKIS azaltır vb.)
   */
  @Column({ type: 'numeric', precision: 15, scale: 4 })
  quantity!: number;

  /**
   * Birim maliyet (kuruş).
   * GIRIS, TRANSFER, IADE_GIRIS için giriş maliyeti.
   * CIKIS, FIRE için FIFO/AVG hesaplanan maliyet.
   */
  @Column({ name: 'unit_cost_kurus', type: 'bigint', default: 0 })
  unitCostKurus!: number;

  /** Toplam maliyet = quantity × unitCostKurus */
  @Column({ name: 'total_cost_kurus', type: 'bigint', default: 0 })
  totalCostKurus!: number;

  /** Hareket sonrası ürünün toplam stok adedi (anlık bakiye) */
  @Column({ name: 'running_balance', type: 'numeric', precision: 15, scale: 4 })
  runningBalance!: number;

  /** Bağlı fatura veya irsaliye referansı */
  @Column({ name: 'reference_type', type: 'varchar', length: 50, nullable: true })
  referenceType!: string | null; // 'INVOICE', 'IRSALIYE', 'MANUAL'

  @Column({ name: 'reference_id', type: 'varchar', nullable: true })
  referenceId!: string | null;

  /** Lot / parti numarası (farmasötik, gıda, kimyasal ürünler) */
  @Column({ name: 'lot_number', type: 'varchar', length: 50, nullable: true })
  lotNumber!: string | null;

  /** Seri numarası (elektronik, ekipman — bireysel takip) */
  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Hareketi oluşturan kullanıcı */
  @Column({ name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

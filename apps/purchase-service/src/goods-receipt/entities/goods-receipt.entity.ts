import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Mal Kabul Belgesi (Goods Receipt Note — GRN)
 *
 * PO onaylandıktan sonra tedarikçi teslimatı kaydedilir.
 * Mal kabul sonrası stock-service'e HTTP GIRIS hareketi gönderilir.
 *
 * Kısmi teslimat desteklenir: aynı PO için birden fazla GRN oluşturulabilir.
 */
@Entity('goods_receipts')
export class GoodsReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'purchase_order_id', type: 'uuid' })
  purchaseOrderId!: string;

  /** GRN numarası — format: GRN-{YYYY}-{NNNN} — DB sütunu: receipt_number */
  @Column({ name: 'receipt_number', length: 50 })
  grnNumber!: string;

  /** Teslim alan kullanıcı — DB sütunu: created_by */
  @Column({ name: 'created_by', type: 'uuid' })
  receivedBy!: string;

  /** Fiili teslim tarihi */
  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate!: Date;

  /**
   * Teslim alınan kalemler (JSONB)
   * [{ productId, productName, warehouseId, quantity, unitCostKurus }]
   */
  @Column({ type: 'jsonb' })
  items!: Array<{
    productId:     string;
    productName:   string;
    warehouseId:   string;
    quantity:      number;
    unitCostKurus: number;
    /** stock-service'den dönen movement ID */
    movementId?:   string;
  }>;

  /** Stock-service entegrasyonu başarılı mı? */
  @Column({ name: 'stock_synced', default: false })
  stockSynced!: boolean;

  /** Stock-service hata mesajı (başarısız ise) */
  @Column({ name: 'stock_sync_error', type: 'text', nullable: true })
  stockSyncError?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

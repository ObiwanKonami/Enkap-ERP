import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { KdvRate } from '@enkap/shared-types';
import { Invoice } from './invoice.entity';

/**
 * Fatura satırı.
 *
 * Her satır kendi KDV oranını taşır — çok oranlı faturalar desteklenir.
 * KDV tutarları `KdvEngine` tarafından hesaplanır ve buraya yazılır.
 */
@Entity('invoice_lines')
export class InvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice;

  @Column({ name: 'line_number', type: 'smallint' })
  lineNumber!: number;

  @Column({ name: 'product_id', type: 'uuid', nullable: true })
  productId?: string;

  @Column({ length: 500 })
  description!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4 })
  quantity!: number;

  @Column({ length: 20, default: 'adet' })
  unit!: string;

  /** Birim fiyat (KDV hariç) */
  @Column({ name: 'unit_price', type: 'numeric', precision: 19, scale: 4 })
  unitPrice!: number;

  /** İskonto yüzdesi */
  @Column({ name: 'discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  discountPct!: number;

  /** KDV oranı: 0 | 1 | 10 | 20 */
  @Column({ name: 'kdv_rate', type: 'numeric', precision: 5, scale: 2 })
  kdvRate!: KdvRate;

  /** Hesaplanan KDV tutarı */
  @Column({ name: 'kdv_amount', type: 'numeric', precision: 19, scale: 4 })
  kdvAmount!: number;

  /** Satır toplamı = miktar × birim fiyat × (1 - iskonto%) + KDV */
  @Column({ name: 'line_total', type: 'numeric', precision: 19, scale: 4 })
  lineTotal!: number;

  /**
   * KDV muafiyet kodu — kdvRate=0 olan satırlarda GİB UBL-TR zorunlu alanı.
   * GİB Tebliğ eki KDV Muafiyet Kodları listesinden seçilir (örn. '350' = Diğer).
   */
  @Column({ name: 'kdv_exemption_code', type: 'varchar', length: 10, nullable: true })
  kdvExemptionCode?: string;
}

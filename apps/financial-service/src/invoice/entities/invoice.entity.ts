import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type {
  InvoiceType,
  InvoiceDirection,
  InvoiceStatus,
  Currency,
} from '@enkap/shared-types';
import { InvoiceLine } from './invoice-line.entity';

/**
 * Fatura ana kaydı.
 *
 * Hem giden (satış) hem gelen (alış) faturaları bu entity'de tutulur.
 * `direction` alanı yönü belirler: OUT = satış, IN = alış
 *
 * GİB entegrasyonu:
 *  - `gibUuid`: GİB'in zorunlu kıldığı UUID v4 (e-Fatura/e-Arşiv)
 *  - `status`: GİB gönderim durumunu izler
 *  - `gibResponse`: GİB'den gelen ham yanıt (JSONB)
 */
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** GİB zorunlu UUID — e-Fatura ve e-Arşiv için */
  @Column({ name: 'gib_uuid', type: 'uuid', nullable: true, unique: true })
  gibUuid?: string;

  @Column({ name: 'invoice_number', length: 50 })
  invoiceNumber!: string;

  @Column({
    name: 'invoice_type',
    type: 'varchar',
    length: 20,
  })
  invoiceType!: InvoiceType;

  @Column({
    type: 'varchar',
    length: 3,
  })
  direction!: InvoiceDirection;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'DRAFT',
  })
  status!: InvoiceStatus;

  /** crm_contacts.id — müşteri veya tedarikçi CRM kaydı */
  @Column({ name: 'counterparty_id', type: 'uuid', nullable: true })
  counterpartyId?: string;

  /** @deprecated V021 sonrası counterparty_id kullan */
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  /** @deprecated V021 sonrası counterparty_id kullan */
  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId?: string;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: Date;

  /** KDV hariç toplam */
  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  subtotal!: number;

  @Column({ name: 'kdv_total', type: 'numeric', precision: 19, scale: 4, default: 0 })
  kdvTotal!: number;

  @Column({ name: 'discount_total', type: 'numeric', precision: 19, scale: 4, default: 0 })
  discountTotal!: number;

  /** Genel toplam (subtotal + kdvTotal - discountTotal) */
  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0 })
  total!: number;

  @Column({ length: 3, default: 'TRY' })
  currency!: Currency;

  /** Dövizli faturalarda TRY kuru */
  @Column({ name: 'exchange_rate', type: 'numeric', precision: 10, scale: 6, default: 1 })
  exchangeRate!: number;

  @Column({ nullable: true, type: 'text' })
  notes?: string;

  /** GİB zarf referansı — gelen/giden faturanın bağlı zarfı */
  @Column({ name: 'envelope_uuid', type: 'uuid', nullable: true })
  envelopeUuid?: string;

  /** GİB profil türü — TICARIFATURA, TEMELFATURA, EARSIVFATURA vb. */
  @Column({ name: 'profile_id', type: 'varchar', length: 30, nullable: true })
  profileId?: string;

  /** Ticari fatura kabul/red durumu (yalnızca gelen TICARIFATURA için) */
  @Column({ name: 'commercial_status', type: 'varchar', length: 20, nullable: true, default: 'BEKLIYOR' })
  commercialStatus?: string;

  /** Satın alma siparişi referansı (PO eşleştirme) */
  @Column({ name: 'purchase_order_id', type: 'uuid', nullable: true })
  purchaseOrderId?: string;

  /** PO eşleştirme durumu */
  @Column({ name: 'po_match_status', type: 'varchar', length: 20, nullable: true })
  poMatchStatus?: string;

  /** GİB'den gelen XML yanıtı, hata kodu, zarf ID'si */
  @Column({ name: 'gib_response', type: 'jsonb', nullable: true })
  gibResponse?: Record<string, unknown>;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => InvoiceLine, (line) => line.invoice, {
    cascade: ['insert', 'update'],
    eager: false,
  })
  lines!: InvoiceLine[];
}

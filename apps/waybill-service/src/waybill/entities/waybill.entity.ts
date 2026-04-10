import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WaybillLine } from './waybill-line.entity';

/**
 * İrsaliye Türü
 *
 * SATIS    → Satış siparişine bağlı sevk irsaliyesi
 * ALIS     → Satın alma / mal kabul irsaliyesi
 * TRANSFER → Depo-depo transfer irsaliyesi
 * IADE     → İade irsaliyesi (müşteri iade / tedarikçiye iade)
 */
export type WaybillType = 'SATIS' | 'ALIS' | 'TRANSFER' | 'IADE';

/**
 * İrsaliye Durumu
 *
 * TASLAK          → Oluşturuldu, henüz onaylanmadı
 * ONAYLANDI       → Onaylandı, sevke hazır
 * GIB_KUYRUKTA    → GİB'e gönderim kuyruğunda
 * GIB_GONDERILDI  → GİB API'ye iletildi, yanıt bekleniyor
 * GIB_ONAYLANDI   → GİB tarafından kabul edildi (e-İrsaliye aktif)
 * GIB_REDDEDILDI  → GİB reddetti, düzeltme gerekiyor
 * IPTAL           → İptal edildi
 */
export type WaybillStatus =
  | 'TASLAK'
  | 'ONAYLANDI'
  | 'GIB_KUYRUKTA'
  | 'GIB_GONDERILDI'
  | 'GIB_ONAYLANDI'
  | 'GIB_REDDEDILDI'
  | 'IPTAL';

/** İade yönü */
export type ReturnDirection = 'MUSTERIDEN' | 'TEDARIKCIYE';

@Entity('waybills')
export class Waybill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /**
   * İrsaliye numarası — format: IRS-{YYYY}-{NNNN}
   * PostgreSQL sequence ile race-free üretilir.
   */
  @Column({ name: 'waybill_number', length: 25, unique: true })
  waybillNumber!: string;

  @Column({ name: 'type', type: 'varchar', length: 20 })
  type!: WaybillType;

  @Column({ name: 'status', type: 'varchar', length: 25, default: 'TASLAK' })
  status!: WaybillStatus;

  /** Sevk tarihi */
  @Column({ name: 'ship_date', type: 'date' })
  shipDate!: Date;

  /** Tahmini / fiili teslim tarihi */
  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate?: Date;

  // ─── Gönderici Bilgileri ──────────────────────────────────────────────────

  @Column({ name: 'sender_name', length: 250 })
  senderName!: string;

  @Column({ name: 'sender_vkn', length: 15, nullable: true, type: 'varchar' })
  senderVkn?: string;

  @Column({ name: 'sender_address', type: 'text', nullable: true })
  senderAddress?: string;

  // ─── Alıcı Bilgileri ──────────────────────────────────────────────────────

  @Column({ name: 'receiver_name', length: 250 })
  receiverName!: string;

  /** VKN (B2B) veya TCKN (B2C) */
  @Column({ name: 'receiver_vkn_tckn', length: 15, nullable: true, type: 'varchar' })
  receiverVknTckn?: string;

  @Column({ name: 'receiver_address', type: 'text', nullable: true })
  receiverAddress?: string;

  // ─── Taşıma Bilgileri ─────────────────────────────────────────────────────

  /** Araç plakası (kendi aracıyla sevk) */
  @Column({ name: 'vehicle_plate', length: 20, nullable: true, type: 'varchar' })
  vehiclePlate?: string;

  /** Sürücü adı */
  @Column({ name: 'driver_name', length: 100, nullable: true, type: 'varchar' })
  driverName?: string;

  /** Sürücü TCKN */
  @Column({ name: 'driver_tckn', length: 11, nullable: true, type: 'varchar' })
  driverTckn?: string;

  /** Kargo firması adı (dışarıdan kargo) */
  @Column({ name: 'carrier_name', length: 100, nullable: true, type: 'varchar' })
  carrierName?: string;

  /** Kargo takip numarası */
  @Column({ name: 'tracking_number', length: 100, nullable: true, type: 'varchar' })
  trackingNumber?: string;

  // ─── GİB e-İrsaliye Alanları ──────────────────────────────────────────────

  /** GİB'e gönderilen zarf UUID (uygulama tarafından üretilir) */
  @Column({ name: 'gib_envelope_id', type: 'uuid', nullable: true })
  gibEnvelopeId?: string;

  /** GİB tarafından atanan belge UUID */
  @Column({ name: 'gib_uuid', type: 'uuid', nullable: true })
  gibUuid?: string;

  /** GİB yanıt kodu */
  @Column({ name: 'gib_status_code', length: 20, nullable: true, type: 'varchar' })
  gibStatusCode?: string;

  /** GİB yanıt açıklaması */
  @Column({ name: 'gib_status_desc', type: 'text', nullable: true })
  gibStatusDesc?: string;

  /** GİB'e gönderim zamanı */
  @Column({ name: 'gib_sent_at', type: 'timestamptz', nullable: true })
  gibSentAt?: Date;

  /** GİB yanıt zamanı */
  @Column({ name: 'gib_response_at', type: 'timestamptz', nullable: true })
  gibResponseAt?: Date;

  /** İmzalanmış UBL-TR XML içeriği */
  @Column({ name: 'signed_xml', type: 'text', nullable: true })
  signedXml?: string;

  // ─── Referans (kaynak belge) ──────────────────────────────────────────────

  /**
   * Kaynak belge türü:
   * sales_order | purchase_order | stock_transfer | return
   */
  @Column({ name: 'ref_type', length: 30, nullable: true, type: 'varchar' })
  refType?: string;

  /** Kaynak belge UUID */
  @Column({ name: 'ref_id', type: 'uuid', nullable: true })
  refId?: string;

  /** Kaynak belge numarası (okunabilir — SO-2025-0001, IRS-2025-0001 vb.) */
  @Column({ name: 'ref_number', length: 30, nullable: true, type: 'varchar' })
  refNumber?: string;

  /** İade yönü (IADE türü için) */
  @Column({ name: 'return_direction', length: 20, nullable: true, type: 'varchar' })
  returnDirection?: ReturnDirection;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_by', type: 'varchar', length: 100 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => WaybillLine, (line) => line.waybill, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  lines!: WaybillLine[];
}

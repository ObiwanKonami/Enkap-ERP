import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** Kargo şirketi kodları */
export enum CarrierCode {
  ARAS = 'aras',
  YURTICI = 'yurtici',
  PTT = 'ptt',
}

/** Ödeme tipi: gönderici mi, alıcı mı öder */
export enum PaymentType {
  SENDER = 'sender',
  RECIPIENT = 'recipient',
}

/** Kargo gönderi durumu — kargo firmasından gelen adımları yansıtır */
export enum ShipmentStatus {
  /** Gönderi oluşturuldu, kargoya verilmedi */
  PENDING = 'pending',
  /** Kargo firmasına teslim edildi, takip numarası atandı */
  CREATED = 'created',
  /** Kargoda / dağıtım ağında */
  IN_TRANSIT = 'in_transit',
  /** Dağıtıma çıktı */
  OUT_FOR_DELIVERY = 'out_for_delivery',
  /** Alıcıya teslim edildi */
  DELIVERED = 'delivered',
  /** Teslimat başarısız (adreste bulunamadı vb.) */
  FAILED = 'failed',
  /** İade sürecinde */
  RETURNED = 'returned',
}

/**
 * Kargo Gönderisi Entity.
 *
 * Her gönderi tek bir kargo firmasına (carrier) aittir.
 * Takip numarası kargo API'si tarafından atanır ve oluşturmadan sonra set edilir.
 * TenantAwareSubscriber, insert/update sırasında tenant_id alanını doğrular.
 */
@Entity('shipments')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'carrier'])
@Index(['trackingNumber'])
@Index(['carrierShipmentId'])
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu — TenantAwareSubscriber tarafından doğrulanır */
  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** Bağlı sipariş veya irsaliye numarası (order-service referansı) */
  @Column({ name: 'order_reference', length: 100 })
  orderReference!: string;

  /** Seçilen kargo firması */
  @Column({ type: 'varchar', length: 20 })
  carrier!: CarrierCode;

  /** Kargo takip numarası — API çağrısından sonra set edilir */
  @Column({ name: 'tracking_number', type: 'varchar', length: 100, nullable: true })
  trackingNumber!: string | null;

  /** Kargo firmasının iç gönderi ID'si — webhook eşleştirmesi için */
  @Column({ name: 'carrier_shipment_id', type: 'varchar', length: 200, nullable: true })
  carrierShipmentId!: string | null;

  // ---- Gönderici Bilgileri ----

  @Column({ name: 'sender_name', length: 200 })
  senderName!: string;

  @Column({ name: 'sender_address', type: 'text' })
  senderAddress!: string;

  @Column({ name: 'sender_city', length: 100 })
  senderCity!: string;

  @Column({ name: 'sender_district', type: 'varchar', length: 100, nullable: true })
  senderDistrict!: string | null;

  @Column({ name: 'sender_phone', length: 20 })
  senderPhone!: string;

  // ---- Alıcı Bilgileri ----

  @Column({ name: 'recipient_name', length: 200 })
  recipientName!: string;

  @Column({ name: 'recipient_address', type: 'text' })
  recipientAddress!: string;

  @Column({ name: 'recipient_city', length: 100 })
  recipientCity!: string;

  @Column({ name: 'recipient_district', type: 'varchar', length: 100, nullable: true })
  recipientDistrict!: string | null;

  @Column({ name: 'recipient_phone', length: 20 })
  recipientPhone!: string;

  /** E-posta bildirimi için — oluşturuldu ve teslim edildi olaylarında gönderilir */
  @Column({ name: 'recipient_email', type: 'varchar', length: 254, nullable: true })
  recipientEmail!: string | null;

  // ---- Paket Bilgileri ----

  /** Gerçek ağırlık — kg cinsinden */
  @Column({ name: 'weight_kg', type: 'decimal', precision: 8, scale: 3 })
  weightKg!: number;

  /** Hacimsel ağırlık (desi) — kargo fiyatlandırması için */
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  desi!: number | null;

  /** Kargo ücretini kim öder */
  @Column({ name: 'payment_type', type: 'varchar', length: 20 })
  paymentType!: PaymentType;

  // ---- Durum Takibi ----

  @Column({ type: 'varchar', length: 30, default: ShipmentStatus.PENDING })
  status!: ShipmentStatus;

  /** Kargo firmasından gelen son durum açıklaması */
  @Column({ name: 'status_description', type: 'text', nullable: true })
  statusDescription!: string | null;

  /** Tahmini teslim tarihi — kargo firmasından alınır */
  @Column({ name: 'estimated_delivery_date', type: 'date', nullable: true })
  estimatedDeliveryDate!: Date | null;

  /** Fiili teslim zamanı — DELIVERED durumunda set edilir */
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  /** Son polling zamanı — cron job takibi için */
  @Column({ name: 'last_checked_at', type: 'timestamptz', nullable: true })
  lastCheckedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

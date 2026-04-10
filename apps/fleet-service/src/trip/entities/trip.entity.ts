import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Sefer durumu
 *
 * PLANLANMIS → Oluşturuldu, henüz yola çıkmadı
 * YOLDA      → Araç hareket halinde
 * TAMAMLANDI → Varış noktasına ulaşıldı
 * IPTAL      → Sefer iptal edildi
 */
export type TripStatus = 'PLANLANMIS' | 'YOLDA' | 'TAMAMLANDI' | 'IPTAL';

/**
 * Sefer (Araç seferi)
 *
 * Sefer numarası: SF-{YYYY}-{NNNN} formatında PostgreSQL sequence ile üretilir.
 * Sipariş servisi ile salesOrderId / deliveryId üzerinden ilişkilendirilir.
 * GPS konumları gps_locations tablosuna trip_id ile bağlanır.
 * distanceKm = endKm - startKm (tamamlanınca otomatik hesaplanır).
 */
@Entity({ name: 'trips' })
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /**
   * Sefer numarası — format: SF-{YYYY}-{NNNN}
   * PostgreSQL sequence ile race-free üretilir.
   */
  @Column({ name: 'trip_number', length: 30 })
  tripNumber!: string;

  /** Araç ID'si */
  @Column({ name: 'vehicle_id' })
  vehicleId!: string;

  /** Sürücü ID'si */
  @Column({ name: 'driver_id' })
  driverId!: string;

  /** İlişkili satış siparişi (order-service) */
  @Column({ name: 'sales_order_id', nullable: true })
  salesOrderId?: string;

  /** İlişkili sevkiyat (order-service delivery) */
  @Column({ name: 'delivery_id', nullable: true })
  deliveryId?: string;

  /** Çıkış noktası — adres veya depo adı */
  @Column({ length: 300 })
  origin!: string;

  /** Varış noktası — adres veya müşteri adresi */
  @Column({ length: 300 })
  destination!: string;

  /** Planlanan kalkış zamanı */
  @Column({ name: 'planned_departure', type: 'timestamp' })
  plannedDeparture!: Date;

  /** Gerçek kalkış zamanı (yola çıkınca set edilir) */
  @Column({ name: 'actual_departure', type: 'timestamp', nullable: true })
  actualDeparture?: Date;

  /** Planlanan varış zamanı */
  @Column({ name: 'planned_arrival', type: 'timestamp', nullable: true })
  plannedArrival?: Date;

  /** Gerçek varış zamanı (tamamlanınca set edilir) */
  @Column({ name: 'actual_arrival', type: 'timestamp', nullable: true })
  actualArrival?: Date;

  /** Başlangıç km sayacı */
  @Column({ name: 'start_km', type: 'int', nullable: true })
  startKm?: number;

  /** Bitiş km sayacı */
  @Column({ name: 'end_km', type: 'int', nullable: true })
  endKm?: number;

  /** Hesaplanan mesafe (endKm - startKm) */
  @Column({ name: 'distance_km', type: 'int', nullable: true })
  distanceKm?: number;

  /** Kargo ağırlığı (kg) — oluşturulurken kaydedilir */
  @Column({ name: 'cargo_weight_kg', type: 'numeric', precision: 10, scale: 2, nullable: true })
  cargoWeightKg?: number;

  /** Kargo hacmi (m³) — oluşturulurken kaydedilir */
  @Column({ name: 'cargo_volume_m3', type: 'numeric', precision: 10, scale: 2, nullable: true })
  cargoVolumeM3?: number;

  /** Sefer durumu */
  @Column({ type: 'varchar', length: 20, default: 'PLANLANMIS' })
  status!: TripStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Oluşturan kullanıcı ID'si */
  @Column({ name: 'created_by', length: 100 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

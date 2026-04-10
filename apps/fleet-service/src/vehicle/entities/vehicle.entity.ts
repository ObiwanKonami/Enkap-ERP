import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Araç tipi
 *
 * TIR       → Tır (çekici + dorse)
 * KAMYON    → Kamyon
 * KAMYONET  → Kamyonet / minivan
 * PICKUP    → Pikap
 * FORKLIFT  → Forklift (depo içi)
 * DIGER     → Diğer araçlar
 */
export type VehicleType = 'TIR' | 'KAMYON' | 'KAMYONET' | 'PICKUP' | 'FORKLIFT' | 'DIGER';

/**
 * Araç durumu
 *
 * AKTIF   → Kullanıma hazır
 * PASIF   → Aktif filoda değil
 * BAKIMDA → Servis / bakımda
 */
export type VehicleStatus = 'AKTIF' | 'PASIF' | 'BAKIMDA';

/**
 * Araç
 *
 * GPS/telematik bilgileri (lastLat, lastLng, lastSpeedKmh, lastLocationAt)
 * gerçek zamanlı olarak güncellenir — GPS webhook'u üzerinden.
 * Sigorta, ruhsat, muayene tarihleri için uyarı mekanizması cron job ile çalışır.
 */
@Entity({ name: 'vehicles' })
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** Plaka — örn: 34 ABC 123 */
  @Column({ length: 20 })
  plate!: string;

  /** Araç markası — örn: Ford, Mercedes, Volvo */
  @Column({ length: 100 })
  brand!: string;

  /** Araç modeli — örn: Transit, Actros */
  @Column({ length: 100 })
  model!: string;

  /** Model yılı */
  @Column({ type: 'int', nullable: true })
  year?: number;

  /** Araç tipi */
  @Column({ type: 'varchar', length: 20 })
  type!: VehicleType;

  /** Yük kapasitesi (kg) */
  @Column({ name: 'capacity_kg', type: 'numeric', precision: 10, scale: 2, nullable: true })
  capacityKg?: number;

  /** Hacim kapasitesi (m³) */
  @Column({ name: 'volume_m3', type: 'numeric', precision: 10, scale: 2, nullable: true })
  volumeM3?: number;

  /** Araç durumu */
  @Column({ type: 'varchar', length: 20, default: 'AKTIF' })
  status!: VehicleStatus;

  /** Bağlı depo ID'si (stock-service) */
  @Column({ name: 'assigned_warehouse_id', nullable: true })
  assignedWarehouseId?: string;

  /** Güncel kilometre sayacı */
  @Column({ name: 'current_km', type: 'int', default: 0 })
  currentKm!: number;

  /** Şasi numarası (VIN) */
  @Column({ name: 'vin', length: 50, nullable: true })
  vin?: string;

  /** Ruhsat geçerlilik tarihi */
  @Column({ name: 'registration_expires', type: 'date', nullable: true })
  registrationExpires?: string;

  /** Muayene son tarihi */
  @Column({ name: 'inspection_expires', type: 'date', nullable: true })
  inspectionExpires?: string;

  /** Kasko son tarihi */
  @Column({ name: 'insurance_expires', type: 'date', nullable: true })
  insuranceExpires?: string;

  /** Trafik sigortası son tarihi */
  @Column({ name: 'traffic_insurance_expires', type: 'date', nullable: true })
  trafficInsuranceExpires?: string;

  // --- GPS / Telematik ---

  /** GPS cihaz ID'si (sağlayıcı tarafından verilir) */
  @Column({ name: 'gps_device_id', length: 100, nullable: true })
  gpsDeviceId?: string;

  /** GPS sağlayıcı — örn: teltonika, icomera */
  @Column({ name: 'gps_provider', length: 50, nullable: true })
  gpsProvider?: string;

  /** Son bilinen enlem */
  @Column({ name: 'last_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  lastLat?: number;

  /** Son bilinen boylam */
  @Column({ name: 'last_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  lastLng?: number;

  /** Son bilinen hız (km/h) */
  @Column({ name: 'last_speed_kmh', type: 'numeric', precision: 5, scale: 1, nullable: true })
  lastSpeedKmh?: number;

  /** Son konum güncellenme zamanı */
  @Column({ name: 'last_location_at', type: 'timestamp', nullable: true })
  lastLocationAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

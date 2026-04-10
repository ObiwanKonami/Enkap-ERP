import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Ehliyet sınıfı (Türkiye — 2016 mevzuatı)
 *
 * B   → Otomobil
 * C   → Kamyon (7.5t üstü)
 * CE  → Kamyon + römork (tır ehliyeti)
 * D   → Otobüs
 * DE  → Otobüs + römork
 */
export type LicenseClass = 'B' | 'C' | 'CE' | 'D' | 'DE';

/**
 * Sürücü çalışma durumu
 *
 * AKTIF  → Aktif sürücü
 * PASIF  → Ayrılan / pasif
 * IZINDE → Yıllık izin / raporlu
 */
export type DriverStatus = 'AKTIF' | 'PASIF' | 'IZINDE';

/**
 * Sürücü
 *
 * HR servisi ile employeeId üzerinden bağlantılıdır.
 * currentVehicleId alanı anlık araç atamasını gösterir.
 * Ehliyet son tarihi için uyarı cron job ile kontrol edilir.
 */
@Entity({ name: 'drivers' })
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** HR servisindeki çalışan ID'si (opsiyonel bağlantı) */
  @Column({ name: 'employee_id', nullable: true })
  employeeId?: string;

  @Column({ name: 'first_name', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', length: 100 })
  lastName!: string;

  /** İletişim telefonu */
  @Column({ length: 20, nullable: true })
  phone?: string;

  /** Ehliyet sınıfı */
  @Column({ name: 'license_class', type: 'varchar', length: 5 })
  licenseClass!: LicenseClass;

  /** Ehliyet numarası */
  @Column({ name: 'license_number', length: 50, nullable: true })
  licenseNumber?: string;

  /** Ehliyet son geçerlilik tarihi */
  @Column({ name: 'license_expires', type: 'date', nullable: true })
  licenseExpires?: string;

  /** Sürücü durumu */
  @Column({ type: 'varchar', length: 20, default: 'AKTIF' })
  status!: DriverStatus;

  /** Şu an atanmış araç ID'si */
  @Column({ name: 'current_vehicle_id', nullable: true })
  currentVehicleId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

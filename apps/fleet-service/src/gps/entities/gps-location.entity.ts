import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * GPS Konum Kaydı
 *
 * Telematik cihazlardan gelen anlık konum verileri.
 * Her konum noktası araçla vehicle_id, aktif sefer ile trip_id üzerinden ilişkilidir.
 * recordedAt: cihazın ölçüm zamanı (createdAt ile farklı olabilir — gecikmeli gönderim)
 * heading: araç yön bilgisi (0-360 derece, 0=Kuzey)
 */
@Entity({ name: 'gps_locations' })
export class GpsLocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** İlgili araç ID'si */
  @Column({ name: 'vehicle_id' })
  vehicleId!: string;

  /** Bağlı sefer ID'si (opsiyonel — aktif sefer varsa bağlanır) */
  @Column({ name: 'trip_id', nullable: true })
  tripId?: string;

  /** Enlem (WGS84) */
  @Column({ type: 'numeric', precision: 10, scale: 7 })
  lat!: number;

  /** Boylam (WGS84) */
  @Column({ type: 'numeric', precision: 10, scale: 7 })
  lng!: number;

  /** Hız (km/h) */
  @Column({ name: 'speed_kmh', type: 'numeric', precision: 5, scale: 1, nullable: true })
  speedKmh?: number;

  /** Yön açısı (0-360 derece, 0=Kuzey) */
  @Column({ type: 'int', nullable: true })
  heading?: number;

  /** Cihazın ölçüm zamanı */
  @Column({ name: 'recorded_at', type: 'timestamp' })
  recordedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

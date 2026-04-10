import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Yakıt Kaydı
 *
 * Her yakıt alımı araçla vehicle_id üzerinden ilişkilidir.
 * Aktif sefer sırasında yapılan yakıt alımları trip_id ile bağlanabilir.
 * Tüm para tutarları kuruş (bigint) cinsinden saklanır.
 * Tüketim hesabı: liters / distanceKm * 100 (lt/100km)
 */
@Entity({ name: 'fuel_records' })
export class FuelRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** İlgili araç ID'si */
  @Column({ name: 'vehicle_id' })
  vehicleId!: string;

  /** Bağlı sefer ID'si (opsiyonel) */
  @Column({ name: 'trip_id', nullable: true })
  tripId?: string;

  /** Yakıt alım tarihi */
  @Column({ name: 'fueling_date', type: 'date' })
  fuelingDate!: string;

  /** Alınan litre miktarı */
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  liters!: number;

  /** Litre başına fiyat — kuruş */
  @Column({ name: 'price_per_liter_kurus', type: 'bigint' })
  pricePerLiterKurus!: number;

  /** Toplam tutar — kuruş */
  @Column({ name: 'total_kurus', type: 'bigint' })
  totalKurus!: number;

  /** Akaryakıt istasyonu / şirketi */
  @Column({ length: 200, nullable: true })
  station?: string;

  /** Yakıt alım anındaki km sayacı */
  @Column({ name: 'km_at_fueling', type: 'int', nullable: true })
  kmAtFueling?: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

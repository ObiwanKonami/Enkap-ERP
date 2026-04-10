import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type DeviceType = 'HGS' | 'OGS';

/**
 * HGS/OGS Geçiş Kaydı
 *
 * Her geçiş ücreti araçla vehicle_id üzerinden ilişkilidir.
 * Tutar kuruş (bigint) cinsinden saklanır.
 */
@Entity({ name: 'hgs_records' })
export class HgsRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'vehicle_id' })
  vehicleId!: string;

  /** Geçiş tarihi ve saati */
  @Column({ name: 'transaction_date', type: 'timestamptz' })
  transactionDate!: string;

  /** Geçiş ücreti — kuruş */
  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: number;

  /** HGS bakiyesi geçiş sonrası — kuruş (opsiyonel) */
  @Column({ name: 'balance_kurus', type: 'bigint', nullable: true })
  balanceKurus?: number;

  /** Cihaz tipi: HGS veya OGS */
  @Column({ name: 'device_type', type: 'varchar', length: 10, default: 'HGS' })
  deviceType!: DeviceType;

  /** HGS/OGS cihaz numarası (opsiyonel) */
  @Column({ name: 'device_id', type: 'varchar', length: 50, nullable: true })
  deviceId?: string;

  /** Geçiş noktası — köprü, otoyol gişesi adı */
  @Column({ type: 'varchar', length: 300, nullable: true })
  location?: string;

  /** Geçiş yönü (ör. İstanbul → İzmit) */
  @Column({ type: 'varchar', length: 100, nullable: true })
  direction?: string;

  /** Bağlı sefer ID'si (opsiyonel) */
  @Column({ name: 'trip_id', type: 'uuid', nullable: true })
  tripId?: string;

  /** Ek not */
  @Column({ type: 'text', nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

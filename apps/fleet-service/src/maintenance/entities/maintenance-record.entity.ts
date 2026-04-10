import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Bakım tipi
 *
 * PERIYODIK → Periyodik bakım (km veya zaman bazlı)
 * LASTIK    → Lastik değişimi / rotasyon
 * FREN      → Fren sistemi bakımı
 * YAG       → Yağ değişimi
 * ARIZA     → Arıza onarımı
 * DIGER     → Diğer bakım türleri
 */
export type MaintenanceType = 'PERIYODIK' | 'LASTIK' | 'FREN' | 'YAG' | 'ARIZA' | 'DIGER';

/**
 * Bakım Kaydı
 *
 * Her bakım kaydı araçla vehicle_id üzerinden ilişkilidir.
 * costKurus alanı tüm para tutarlarını kuruş cinsinden saklar.
 * nextServiceDate veya nextServiceKm dolduğunda bakım hatırlatması oluşturulur.
 */
@Entity({ name: 'maintenance_records' })
export class MaintenanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  /** İlgili araç ID'si */
  @Column({ name: 'vehicle_id' })
  vehicleId!: string;

  /** Bakım tipi */
  @Column({ type: 'varchar', length: 20 })
  type!: MaintenanceType;

  /** Bakım açıklaması */
  @Column({ type: 'text' })
  description!: string;

  /** Servis tarihi */
  @Column({ name: 'service_date', type: 'date' })
  serviceDate!: string;

  /** Bir sonraki bakım tarihi (planlanan) */
  @Column({ name: 'next_service_date', type: 'date', nullable: true })
  nextServiceDate?: string;

  /** Bir sonraki bakım km'si */
  @Column({ name: 'next_service_km', type: 'int', nullable: true })
  nextServiceKm?: number;

  /** Bakım sırasındaki km sayacı */
  @Column({ name: 'km_at_service', type: 'int', nullable: true })
  kmAtService?: number;

  /** Bakım maliyeti — kuruş */
  @Column({ name: 'cost_kurus', type: 'bigint', default: 0 })
  costKurus!: number;

  /** Servis firması / tamirci adı */
  @Column({ length: 200, nullable: true })
  vendor?: string;

  /** Fatura / iş emri numarası */
  @Column({ name: 'invoice_number', length: 100, nullable: true })
  invoiceNumber?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

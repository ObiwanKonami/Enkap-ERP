import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Depo Entity.
 *
 * Bir tenant birden fazla depo yönetebilir.
 * Stok hareketleri hangi depoya giriş/çıkış yapıldığını kaydeder.
 *
 * MERKEZ depo: tenant provizyon sırasında otomatik oluşturulur (tenant-seeder).
 */
@Entity('warehouses')
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ length: 20, unique: true })
  code!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  /**
   * Sanal depo: Fiziksel konumu olmayan düşünülen stok yeri.
   * Örnek: "Fire/Kayıp", "Sergi" gibi muhasebe amaçlı depolar.
   */
  @Column({ name: 'is_virtual', default: false })
  isVirtual!: boolean;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

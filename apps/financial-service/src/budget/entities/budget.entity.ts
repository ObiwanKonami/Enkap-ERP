import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/**
 * Bütçe Dönemi
 *
 * Bir tenant için yıllık bütçe planı.
 * Aynı yıl için birden fazla revizyon (version) tutulabilir (v1, v2…).
 * Onaylanmış bütçe kilitlenir; revize bütçe yeni versiyon olarak açılır.
 */
@Entity('budgets')
@Unique(['tenantId', 'year', 'version'])
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Bütçe yılı */
  @Column({ type: 'int' })
  year!: number;

  /** Revizyon etiket — v1, v2 (onaylı bütçede değişiklik yerine yeni revizyon açılır) */
  @Column({ length: 20, default: 'v1' })
  version!: string;

  /** Bütçe adı */
  @Column({ length: 200 })
  name!: string;

  /** Yönetim onayı alındı mı? */
  @Column({ name: 'is_approved', default: false })
  isApproved!: boolean;

  /** Onaylayan kullanıcı UUID */
  @Column({ name: 'approved_by', type: 'varchar', length: 100, nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

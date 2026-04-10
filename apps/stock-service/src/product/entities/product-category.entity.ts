import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

/**
 * Ürün Kategorisi — hiyerarşik (self-referencing tree).
 * Örnek: Elektronik → Bilgisayar → Dizüstü
 *
 * tenant_id: TenantAwareSubscriber tarafından otomatik eklenir.
 */
@Entity('product_categories')
export class ProductCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 20, unique: true })
  code!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => ProductCategory, (cat) => cat.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: ProductCategory | null;

  @OneToMany(() => ProductCategory, (cat) => cat.parent)
  children!: ProductCategory[];

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

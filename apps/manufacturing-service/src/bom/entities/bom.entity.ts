import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { BomLine } from './bom-line.entity';

/** Reçete — Bill of Materials.
 *  Bir mamul ürün için kullanılan hammadde/yarı mamul listesini tanımlar.
 *  Bir ürün için en fazla bir aktif reçete olabilir (isActive=true).
 */
@Entity('boms')
export class Bom {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant izolasyonu için zorunlu alan */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Mamul ürün UUID — stock-service'teki ürün kaydına referans */
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  /** Mamul ürün adı — snapshot, stock değişirse etkilenmez */
  @Column({ name: 'product_name', length: 200 })
  productName!: string;

  /** Revizyon numarası — mühendislik değişikliklerini izler */
  @Column({ name: 'revision_no', length: 20, default: '1.0' })
  revisionNo!: string;

  /** Reçete açıklaması */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Aktif reçete — bir ürün için en fazla bir aktif reçete olmalı */
  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Reçete kalemleri — hammadde/yarı mamul listesi */
  @OneToMany(() => BomLine, (l) => l.bom, { cascade: ['insert', 'update'], eager: true })
  lines!: BomLine[];
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Bom } from './bom.entity';

/** Reçete Kalemi — bir mamul için gereken hammadde veya yarı mamul */
@Entity('bom_lines')
export class BomLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'bom_id', type: 'uuid' })
  bomId!: string;

  @ManyToOne(() => Bom, (b) => b.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bom_id' })
  bom!: Bom;

  /** Hammadde/yarı mamul UUID — stock-service'teki ürün kaydına referans */
  @Column({ name: 'material_id', type: 'uuid' })
  materialId!: string;

  /** Hammadde adı snapshot */
  @Column({ name: 'material_name', length: 200 })
  materialName!: string;

  /** Stok kodu */
  @Column({ length: 100, nullable: true })
  sku?: string;

  /** Bir mamul üretmek için gereken net miktar */
  @Column({ type: 'numeric', precision: 12, scale: 3 })
  quantity!: number;

  /** Fire/atık oranı % (ör: 5 = %5 fire) — brüt ihtiyaç hesabında kullanılır */
  @Column({ name: 'scrap_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  scrapRate!: number;

  /** Hammaddenin çekileceği depo */
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId?: string;

  /** Hammadde ölçü birimi (ADET, KG, LT, MT vb.) */
  @Column({ name: 'unit_of_measure', length: 20, default: 'ADET' })
  unitOfMeasure!: string;
}

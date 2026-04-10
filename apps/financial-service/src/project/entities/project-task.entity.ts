import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

/**
 * Görev durumu — WBS (Work Breakdown Structure) için
 */
export type TaskStatus = 'YAPILACAK' | 'DEVAM' | 'TAMAMLANDI' | 'IPTAL';

/**
 * Proje Görevi (WBS Kalemi)
 *
 * Hiyerarşik görev yapısını destekler: parentTaskId ile üst görev bağlanır.
 * Görevler saatlere ayrılır; gerçekleşen saat vs planlanan saat takip edilir.
 *
 * WBS Kodu: projeName/taskCode formatında gösterilir (örn: PRJ-2026-0001/G-001)
 */
@Entity('project_tasks')
export class ProjectTask {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /** Üst proje — silinirse görevler de silinir (CASCADE) */
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  /**
   * Üst görev UUID'si — WBS hiyerarşisi için öz-referans.
   * Null ise kök seviye görev.
   */
  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true })
  parentTaskId?: string;

  /** Görev kodu (örn: G-001, G-001.1) */
  @Column({ name: 'task_code', length: 50 })
  taskCode!: string;

  /** Görev adı */
  @Column({ length: 200 })
  name!: string;

  /** Görev açıklaması */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Görev durumu */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    default: 'YAPILACAK',
  })
  status!: TaskStatus;

  /** Planlanan başlangıç tarihi */
  @Column({ name: 'planned_start_date', type: 'date', nullable: true })
  plannedStartDate?: Date;

  /** Planlanan bitiş tarihi */
  @Column({ name: 'planned_end_date', type: 'date', nullable: true })
  plannedEndDate?: Date;

  /** Gerçekleşen başlangıç tarihi */
  @Column({ name: 'actual_start_date', type: 'date', nullable: true })
  actualStartDate?: Date;

  /** Gerçekleşen bitiş tarihi */
  @Column({ name: 'actual_end_date', type: 'date', nullable: true })
  actualEndDate?: Date;

  /** Planlanan iş saati */
  @Column({
    name: 'planned_hours',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  plannedHours!: number;

  /** Gerçekleşen iş saati */
  @Column({
    name: 'actual_hours',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
  })
  actualHours!: number;

  /**
   * Atanan çalışan veya kullanıcı UUID'si.
   * HR servisindeki employee ID'si olabilir.
   */
  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo?: string;

  /** Sıralama indisi — Gantt şemasında görsel sıra */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}

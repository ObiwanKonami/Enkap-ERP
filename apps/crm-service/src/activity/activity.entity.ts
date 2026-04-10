import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

export type ActivityType = 'call' | 'meeting' | 'email' | 'task' | 'note';

/**
 * CRM aktivite / iletişim geçmişi.
 *
 * Bir aktivite ya bir fırsata (lead_id) ya da direkt kişiye bağlıdır.
 * completed_at: null ise bekliyor, dolu ise tamamlandı.
 */
@Entity('crm_activities')
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Opsiyonel — fırsata bağlı aktivite */
  @Column({ name: 'lead_id', type: 'uuid', nullable: true })
  leadId!: string | null;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: ActivityType;

  @Column({ type: 'varchar', length: 300 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  /** Görev/toplantı için planlanan zaman */
  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  /** null → bekliyor, dolu → tamamlandı */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  get isPending(): boolean {
    return this.completedAt === null;
  }

  get isOverdue(): boolean {
    return this.isPending && this.scheduledAt !== null && this.scheduledAt < new Date();
  }
}

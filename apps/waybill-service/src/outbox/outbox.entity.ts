import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * GİB Gönderim Outbox Kaydı
 *
 * Güvenilir GİB teslimatı için outbox pattern:
 * 1. Kullanıcı "GİB'e Gönder" → outbox kaydı + waybill GIB_KUYRUKTA
 * 2. Cron job (30 sn) → bekleyen kayıtları işle → XML üret → GİB API
 * 3. Başarılı → processed_at + waybill GIB_GONDERILDI
 * 4. Polling cron (5 dk) → GİB'den sonuç çek → ONAYLANDI / REDDEDILDI
 */
@Entity('gib_outbox')
export class GibOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'waybill_id', type: 'uuid' })
  waybillId!: string;

  /**
   * Outbox işlem türü:
   * SEND   → GİB'e gönder
   * CANCEL → GİB'te iptal et
   * POLL   → Durum sorgula
   */
  @Column({ name: 'action', type: 'varchar', length: 10, default: 'SEND' })
  action!: 'SEND' | 'CANCEL' | 'POLL';

  /** İşlenme durumu */
  @Column({ name: 'status', type: 'varchar', length: 15, default: 'PENDING' })
  status!: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

  /** Deneme sayısı */
  @Column({ name: 'attempt_count', default: 0 })
  attemptCount!: number;

  /** Son hata mesajı */
  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string;

  /** İşlenme zamanı */
  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

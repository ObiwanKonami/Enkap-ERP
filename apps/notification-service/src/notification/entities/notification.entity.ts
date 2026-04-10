import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Bildirim kategorisi
 * finans  → Fatura, ödeme, AR/AP olayları
 * stok    → Kritik stok, irsaliye olayları
 * ik      → İzin talebi, bordro, HR olayları
 * sistem  → Yedekleme, sistem durumu
 */
export type NotifCategory = 'finans' | 'stok' | 'ik' | 'sistem';

/**
 * Bildirim öncelik seviyesi
 * error   → Kırmızı — Hata, vadesi geçmiş, GİB reddi
 * warning → Sarı  — Uyarı, kritik stok, yaklaşan tarih
 * info    → Mavi  — Bilgi, tamamlanan işlem
 * success → Yeşil — Başarı, onay
 */
export type NotifLevel = 'error' | 'warning' | 'info' | 'success';

@Entity('notifications')
@Index(['tenantId', 'isRead', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'category', type: 'varchar', length: 10 })
  category!: NotifCategory;

  @Column({ name: 'level', type: 'varchar', length: 10 })
  level!: NotifLevel;

  @Column({ name: 'title', type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'body', type: 'varchar', length: 500 })
  body!: string;

  /** Tıklanınca yönlendirilecek frontend URL (opsiyonel) */
  @Column({ name: 'href', type: 'varchar', length: 200, nullable: true })
  href?: string;

  /** Olayı tetikleyen kaynak: 'invoice', 'waybill', 'stock', vb. */
  @Column({ name: 'source_type', type: 'varchar', length: 50, nullable: true })
  sourceType?: string;

  /** Kaynak kayıt ID'si */
  @Column({ name: 'source_id', type: 'varchar', length: 100, nullable: true })
  sourceId?: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

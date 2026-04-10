import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantDataSourceManager } from '@enkap/database';
import { Notification, type NotifCategory, type NotifLevel } from './entities/notification.entity';

export interface CreateNotificationInput {
  tenantId:    string;
  category:    NotifCategory;
  level:       NotifLevel;
  title:       string;
  body:        string;
  href?:       string;
  sourceType?: string;
  sourceId?:   string;
}

export interface ListNotificationsQuery {
  limit?:      number;
  offset?:     number;
  unreadOnly?: boolean;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Yeni bildirim oluştur — RabbitMQ consumer'dan veya HTTP POST ile çağrılır.
   * tenantId doğrudan parametre olarak geçirilir (consumer'da TenantContext yok).
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const ds   = await this.dsManager.getDataSource(input.tenantId);
    const repo = ds.getRepository(Notification);

    const notif = repo.create({
      tenantId:   input.tenantId,
      category:   input.category,
      level:      input.level,
      title:      input.title,
      body:       input.body,
      href:       input.href,
      sourceType: input.sourceType,
      sourceId:   input.sourceId,
      isRead:     false,
    });

    const saved = await repo.save(notif);
    this.logger.debug(`[${input.tenantId}] Bildirim oluşturuldu: ${saved.id} (${input.level})`);
    return saved;
  }

  /**
   * Tenant'a ait bildirimleri listele.
   * tenantId HTTP isteğinden veya doğrudan parametre olarak gelir.
   */
  async findAll(tenantId: string, query: ListNotificationsQuery = {}): Promise<{
    items: Notification[];
    total: number;
    unread: number;
  }> {
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Notification);

    const limit  = Math.min(query.limit  ?? 50, 100);
    const offset = query.offset ?? 0;

    const qb = repo.createQueryBuilder('n')
      .where('n.tenant_id = :tenantId', { tenantId })
      .orderBy('n.created_at', 'DESC');

    if (query.unreadOnly) {
      qb.andWhere('n.is_read = false');
    }

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();

    // Toplam okunmamış sayısı (unreadOnly filtreli değil — her zaman tam sayı)
    const unread = await repo.count({ where: { tenantId, isRead: false } });

    return { items, total, unread };
  }

  /** Tek bildirimi okundu işaretle */
  async markRead(tenantId: string, id: string): Promise<Notification> {
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Notification);

    const notif = await repo.findOne({ where: { id, tenantId } });
    if (!notif) throw new NotFoundException(`Bildirim bulunamadı: ${id}`);

    notif.isRead = true;
    notif.readAt = new Date();
    return repo.save(notif);
  }

  /** Tenant'ın tüm bildirimlerini okundu işaretle */
  async markAllRead(tenantId: string): Promise<{ updated: number }> {
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Notification);

    const result = await repo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true, readAt: new Date() })
      .where('tenant_id = :tenantId AND is_read = false', { tenantId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  /** Bildirimi sil */
  async remove(tenantId: string, id: string): Promise<void> {
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Notification);

    const notif = await repo.findOne({ where: { id, tenantId } });
    if (!notif) throw new NotFoundException(`Bildirim bulunamadı: ${id}`);

    await repo.remove(notif);
  }

  /** 30 günden eski okunmuş bildirimleri temizle (cron için) */
  async purgeOldRead(tenantId: string): Promise<number> {
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Notification);

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await repo
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('tenant_id = :tenantId AND is_read = true AND created_at < :cutoff', { tenantId, cutoff })
      .execute();

    return result.affected ?? 0;
  }
}

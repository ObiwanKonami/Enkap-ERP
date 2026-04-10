import { Logger } from '@nestjs/common';
import type {
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  QueryRunner,
} from 'typeorm';
import { getTenantContext } from './tenant-context.storage';

/**
 * TypeORM Entity Subscriber — Çapraz-tenant veri sızıntısı önleyici.
 *
 * Her INSERT ve UPDATE işleminden önce:
 *  1. AsyncLocalStorage'dan tenant_id alır
 *  2. Entity'nin tenant_id alanını otomatik doldurur
 *  3. Yanlış tenant_id yazılmaya çalışılıyorsa hata fırlatır
 *
 * Bu subscriber, developer'ın tenant_id'yi unutmasını veya
 * yanlış tenant'a veri yazmasını yapısal olarak önler.
 *
 * Kullanım: Her servis kendi DataSource'una bu subscriber'ı ekler.
 * Örnek: dataSource.subscribers.push(new TenantAwareSubscriber())
 */
export class TenantAwareSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(TenantAwareSubscriber.name);

  /**
   * Tüm entity türleri için dinle (belirli bir entity belirtme).
   * listenTo() metodunu override etmeyerek tüm entity'lere uygulanır.
   */

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    this.injectAndVerifyTenantId(event.entity, 'INSERT', event.queryRunner);
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    if (event.entity) {
      this.injectAndVerifyTenantId(event.entity, 'UPDATE', event.queryRunner);
    }
  }

  private injectAndVerifyTenantId(
    entity: Record<string, unknown>,
    operation: string,
    queryRunner: QueryRunner,
  ): void {
    // Entity'de tenant_id alanı yoksa bu subscriber ilgilenmez
    // (örn: lookup tabloları, sistem tabloları)
    if (!('tenant_id' in entity)) return;

    let context: ReturnType<typeof getTenantContext>;
    try {
      context = getTenantContext();
    } catch {
      // Guard'sız erişim — güvenlik ihlali
      throw new CrossTenantWriteError(
        `[GÜVENLİK] ${operation} işlemi tenant context olmadan denendi. ` +
        `TenantGuard atlanmış olabilir.`,
      );
    }

    const { tenantId } = context;

    if (entity['tenant_id'] === undefined || entity['tenant_id'] === null) {
      // Otomatik doldur
      entity['tenant_id'] = tenantId;
    } else if (entity['tenant_id'] !== tenantId) {
      // Farklı tenant'a yazmak istiyor — kritik güvenlik ihlali
      this.logger.error(
        `CROSS-TENANT WRITE GİRİŞİMİ ENGELLENDI: ` +
        `işlem=${operation} ` +
        `context_tenant=${tenantId} ` +
        `entity_tenant=${entity['tenant_id'] as string}`,
      );

      // Query'yi hemen iptal et
      void queryRunner.rollbackTransaction().catch(() => undefined);

      throw new CrossTenantWriteError(
        `Çapraz-tenant yazma girişimi engellendi: ` +
        `${tenantId} → ${entity['tenant_id'] as string}`,
      );
    }
  }
}

export class CrossTenantWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossTenantWriteError';
  }
}

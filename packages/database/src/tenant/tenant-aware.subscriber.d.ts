import type { EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
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
export declare class TenantAwareSubscriber implements EntitySubscriberInterface {
    private readonly logger;
    /**
     * Tüm entity türleri için dinle (belirli bir entity belirtme).
     * listenTo() metodunu override etmeyerek tüm entity'lere uygulanır.
     */
    beforeInsert(event: InsertEvent<Record<string, unknown>>): void;
    beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void;
    private injectAndVerifyTenantId;
}
export declare class CrossTenantWriteError extends Error {
    constructor(message: string);
}

import { OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { TenantRoutingRecord } from '@enkap/shared-types';
/**
 * Tenant → Veritabanı yönlendirme çözümleyicisi.
 *
 * Önbellek katmanı (Redis) → Kayıt defteri (Control Plane PostgreSQL)
 * şeklinde iki kademeli arama yapar.
 *
 * Tüm uygulama servisleri bu servisi kullanarak doğru
 * PgBouncer pool endpoint'ini bulur.
 */
export declare class TenantRoutingService implements OnModuleDestroy {
    /**
     * Control plane veritabanı — tenant şemalarından tamamen ayrı.
     * Bu bağlantı yalnızca tenant_routing tablosunu okur.
     */
    private readonly controlPlaneDataSource;
    private readonly logger;
    private readonly redis;
    constructor(
    /**
     * Control plane veritabanı — tenant şemalarından tamamen ayrı.
     * Bu bağlantı yalnızca tenant_routing tablosunu okur.
     */
    controlPlaneDataSource: DataSource);
    /**
     * Tenant için yönlendirme kaydını bulur.
     *
     * Sıra: Redis önbelleği → Control Plane PostgreSQL
     *
     * @throws {TenantNotFoundException} Tenant bulunamazsa
     * @throws {TenantSuspendedException} Tenant askıya alınmışsa
     */
    getRoutingRecord(tenantId: string): Promise<TenantRoutingRecord>;
    /**
     * Tenant durumunu doğrular (aktif / askıya alınmış / provizyon bekliyor).
     * Redis'te ayrı bir anahtar olarak saklanır — sık kontrol edilir.
     */
    assertTenantIsActive(tenantId: string): Promise<void>;
    /**
     * Tenant routing kaydını Redis önbelleğinden siler.
     * Provizyon veya tier değişikliği sonrası çağrılır.
     */
    invalidateCache(tenantId: string): Promise<void>;
    /**
     * Aktif tüm tenant ID'lerini döner.
     *
     * Scheduled job'ların (cron) tüm tenant'lara iterasyon yapması için kullanılır.
     * Sadece `status = 'active'` tenant'lar döner.
     */
    findAllActiveIds(): Promise<string[]>;
    /**
     * Tenant'ın şirket adını döner.
     *
     * tenant_profiles tablosundan çeker — bulunamazsa tenantId döner.
     * E-posta şablonları, PDF başlıkları gibi kullanıcıya dönük içeriklerde kullanılır.
     */
    getCompanyName(tenantId: string): Promise<string>;
    private getFromCache;
    private queryControlPlane;
    private writeToCache;
    onModuleDestroy(): Promise<void>;
}
export declare class TenantNotFoundError extends Error {
    constructor(tenantId: string);
}
export declare class TenantSuspendedError extends Error {
    constructor(tenantId: string);
}
export declare class TenantProvisioningError extends Error {
    constructor(tenantId: string);
}

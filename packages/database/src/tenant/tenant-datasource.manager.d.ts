import { OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantRoutingService } from './tenant-routing.service';
/**
 * Tenant başına dinamik TypeORM DataSource yöneticisi.
 *
 * Her farklı tenant için ayrı bir TypeORM DataSource nesnesi
 * lazy (ilk istekte) oluşturur ve Map'te önbellekler.
 *
 * Tasarım kararları:
 * - Singleton Map: tüm servis instance'ları aynı pool'u paylaşır
 * - Lazy init: tenant ilk kez istek yaparken bağlantı açılır
 * - Idle timeout: uzun süre kullanılmayan bağlantılar kapatılır
 * - search_path kilidi: connection string'e direkt eklenir
 */
export declare class TenantDataSourceManager implements OnModuleDestroy {
    private readonly routingService;
    private readonly logger;
    private readonly dataSourceMap;
    constructor(routingService: TenantRoutingService);
    /**
     * Tenant'a özgü aktif DataSource döndürür.
     *
     * İlk çağrıda bağlantıyı oluşturur; sonraki çağrılarda önbellekten verir.
     * Her çağrı idle timer'ı sıfırlar.
     */
    getDataSource(tenantId: string): Promise<DataSource>;
    /**
     * Belirli bir tenant'ın DataSource'unu kapatır ve Map'ten siler.
     * Tenant deprovisioning veya tier değişikliğinde çağrılır.
     */
    closeDataSource(tenantId: string): Promise<void>;
    private createDataSource;
    private buildDataSourceOptions;
    /**
     * Bağlantı açıldıktan sonra search_path'in doğru şemaya işaret ettiğini
     * doğrular. Yanlış şemaya bağlanma durumunu erken yakalar.
     */
    private verifySearchPath;
    private createIdleTimer;
    private refreshIdleTimer;
    onModuleDestroy(): Promise<void>;
}

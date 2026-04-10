"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var TenantDataSourceManager_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantDataSourceManager = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const tenant_routing_service_1 = require("./tenant-routing.service");
/**
 * Her tenant için açık kalan bağlantı sayısını sınırla.
 * PgBouncer pool budget'ını aşmamak için kritik.
 */
const MAX_POOL_SIZE_PER_TENANT = 5;
const MIN_POOL_SIZE_PER_TENANT = 1;
/** Boşta kalan DataSource'u kaç dakika sonra kapat */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 dakika
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
let TenantDataSourceManager = TenantDataSourceManager_1 = class TenantDataSourceManager {
    constructor(routingService) {
        this.routingService = routingService;
        this.logger = new common_1.Logger(TenantDataSourceManager_1.name);
        this.dataSourceMap = new Map();
    }
    /**
     * Tenant'a özgü aktif DataSource döndürür.
     *
     * İlk çağrıda bağlantıyı oluşturur; sonraki çağrılarda önbellekten verir.
     * Her çağrı idle timer'ı sıfırlar.
     */
    async getDataSource(tenantId) {
        const existing = this.dataSourceMap.get(tenantId);
        if (existing?.dataSource.isInitialized) {
            this.refreshIdleTimer(tenantId, existing);
            return existing.dataSource;
        }
        return this.createDataSource(tenantId);
    }
    /**
     * Belirli bir tenant'ın DataSource'unu kapatır ve Map'ten siler.
     * Tenant deprovisioning veya tier değişikliğinde çağrılır.
     */
    async closeDataSource(tenantId) {
        const entry = this.dataSourceMap.get(tenantId);
        if (!entry)
            return;
        clearTimeout(entry.idleTimer);
        await entry.dataSource.destroy();
        this.dataSourceMap.delete(tenantId);
        this.logger.log(`DataSource kapatıldı: tenant=${tenantId}`);
    }
    // ─── Özel yardımcı metodlar ────────────────────────────────────────────────
    async createDataSource(tenantId) {
        const routing = await this.routingService.getRoutingRecord(tenantId);
        const options = this.buildDataSourceOptions(tenantId, routing);
        this.logger.log(`Yeni DataSource oluşturuluyor: tenant=${tenantId} ` +
            `cluster=${routing.clusterId} tier=${routing.tier}`);
        const dataSource = new typeorm_1.DataSource(options);
        await dataSource.initialize();
        // İlk bağlantıda search_path'i doğrula (güvenlik kontrolü)
        await this.verifySearchPath(dataSource, routing.schemaName, tenantId);
        const entry = {
            dataSource,
            lastUsedAt: Date.now(),
            idleTimer: this.createIdleTimer(tenantId),
        };
        this.dataSourceMap.set(tenantId, entry);
        return dataSource;
    }
    buildDataSourceOptions(tenantId, routing) {
        const schemaName = routing.schemaName;
        return {
            type: 'postgres',
            url: routing.pgbouncerEndpoint,
            // search_path connection string'e eklenerek sürücü seviyesinde kilitlenir.
            // Uygulama katmanındaki SET search_path komutlarına gerek kalmaz.
            // PgBouncer server_reset_query bunu her connection reuse'da sıfırlar.
            connectTimeoutMS: 5_000,
            extra: {
                // node-postgres pool ayarları
                max: MAX_POOL_SIZE_PER_TENANT,
                min: MIN_POOL_SIZE_PER_TENANT,
                idleTimeoutMillis: 30_000,
                connectionTimeoutMillis: 5_000,
                // search_path connection parametresi olarak — en güvenli yöntem
                options: `--search_path=${schemaName},pg_catalog`,
            },
            // Şema adını TypeORM'a söyle; tüm sorgular bu şemada çalışır
            schema: schemaName,
            // TypeORM'un global @Entity() registry'sinden tüm entity sınıflarını al.
            // Her servis kendi entity'lerini @Entity() decorator'ı ile otomatik kaydeder;
            // tenant DataSource oluşturulurken bu registry'den alınır — synchronize: false
            // olduğu için fazladan entity olması hiçbir zarara yol açmaz.
            entities: (0, typeorm_1.getMetadataArgsStorage)()
                .tables
                .map((t) => t.target)
                .filter((t) => typeof t === 'function'),
            synchronize: false, // Asla true — migration'lar ayrı yönetilir
            logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
            // Tenant bazlı query logging için uygulama adını ekle
            applicationName: `enkap_${tenantId.slice(0, 8)}`,
        };
    }
    /**
     * Bağlantı açıldıktan sonra search_path'in doğru şemaya işaret ettiğini
     * doğrular. Yanlış şemaya bağlanma durumunu erken yakalar.
     */
    async verifySearchPath(dataSource, expectedSchema, tenantId) {
        const result = await dataSource.query('SHOW search_path');
        const actualPath = result[0]?.search_path ?? '';
        if (!actualPath.includes(expectedSchema)) {
            // Güvenlik kritik: bağlantı yanlış şemaya gidiyor
            await dataSource.destroy();
            throw new Error(`[GÜVENLİK] search_path doğrulama hatası: ` +
                `tenant=${tenantId} beklenen=${expectedSchema} gerçek=${actualPath}`);
        }
        this.logger.debug(`search_path doğrulandı: tenant=${tenantId} schema=${expectedSchema}`);
    }
    createIdleTimer(tenantId) {
        return setTimeout(async () => {
            this.logger.log(`Boşta kalan bağlantı kapatılıyor: tenant=${tenantId}`);
            await this.closeDataSource(tenantId);
        }, IDLE_TIMEOUT_MS);
    }
    refreshIdleTimer(tenantId, entry) {
        clearTimeout(entry.idleTimer);
        entry.lastUsedAt = Date.now();
        entry.idleTimer = this.createIdleTimer(tenantId);
    }
    async onModuleDestroy() {
        this.logger.log('Tüm tenant DataSource\'ları kapatılıyor...');
        const closePromises = Array.from(this.dataSourceMap.keys()).map((tenantId) => this.closeDataSource(tenantId));
        await Promise.allSettled(closePromises);
        this.logger.log('Tüm bağlantılar kapatıldı.');
    }
};
exports.TenantDataSourceManager = TenantDataSourceManager;
exports.TenantDataSourceManager = TenantDataSourceManager = TenantDataSourceManager_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_routing_service_1.TenantRoutingService])
], TenantDataSourceManager);

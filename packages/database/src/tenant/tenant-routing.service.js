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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var TenantRoutingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantProvisioningError = exports.TenantSuspendedError = exports.TenantNotFoundError = exports.TenantRoutingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ioredis_1 = __importDefault(require("ioredis"));
/** Redis'te bir tenant routing kaydının yaşam süresi (saniye) */
const ROUTING_CACHE_TTL_SECONDS = 300; // 5 dakika
/** Redis anahtar şablonu: tenant:{uuid}:routing */
const routingKey = (tenantId) => `tenant:${tenantId}:routing`;
/** Redis anahtar şablonu: tenant:{uuid}:status */
const statusKey = (tenantId) => `tenant:${tenantId}:status`;
/**
 * Tenant → Veritabanı yönlendirme çözümleyicisi.
 *
 * Önbellek katmanı (Redis) → Kayıt defteri (Control Plane PostgreSQL)
 * şeklinde iki kademeli arama yapar.
 *
 * Tüm uygulama servisleri bu servisi kullanarak doğru
 * PgBouncer pool endpoint'ini bulur.
 */
let TenantRoutingService = TenantRoutingService_1 = class TenantRoutingService {
    constructor(controlPlaneDataSource) {
        this.controlPlaneDataSource = controlPlaneDataSource;
        this.logger = new common_1.Logger(TenantRoutingService_1.name);
        this.redis = new ioredis_1.default(process.env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
        });
    }
    /**
     * Tenant için yönlendirme kaydını bulur.
     *
     * Sıra: Redis önbelleği → Control Plane PostgreSQL
     *
     * @throws {TenantNotFoundException} Tenant bulunamazsa
     * @throws {TenantSuspendedException} Tenant askıya alınmışsa
     */
    async getRoutingRecord(tenantId) {
        // 1. Redis önbelleğini kontrol et
        const cached = await this.getFromCache(tenantId);
        if (cached) {
            return cached;
        }
        // 2. Control plane veritabanından yükle
        const record = await this.queryControlPlane(tenantId);
        // 3. Redis'e yaz (sonraki istekler önbellekten gelir)
        await this.writeToCache(tenantId, record);
        return record;
    }
    /**
     * Tenant durumunu doğrular (aktif / askıya alınmış / provizyon bekliyor).
     * Redis'te ayrı bir anahtar olarak saklanır — sık kontrol edilir.
     */
    async assertTenantIsActive(tenantId) {
        const status = await this.redis.get(statusKey(tenantId));
        if (status === 'suspended') {
            throw new TenantSuspendedError(tenantId);
        }
        if (status === 'provisioning') {
            throw new TenantProvisioningError(tenantId);
        }
        // Redis'te yoksa control plane'e bak
        if (!status) {
            const record = await this.getRoutingRecord(tenantId);
            if (record.tier === undefined) {
                throw new TenantNotFoundError(tenantId);
            }
        }
    }
    /**
     * Tenant routing kaydını Redis önbelleğinden siler.
     * Provizyon veya tier değişikliği sonrası çağrılır.
     */
    async invalidateCache(tenantId) {
        await this.redis.del(routingKey(tenantId), statusKey(tenantId));
        this.logger.log(`Önbellek temizlendi: tenant=${tenantId}`);
    }
    /**
     * Aktif tüm tenant ID'lerini döner.
     *
     * Scheduled job'ların (cron) tüm tenant'lara iterasyon yapması için kullanılır.
     * Sadece `status = 'active'` tenant'lar döner.
     */
    async findAllActiveIds() {
        const rows = await this.controlPlaneDataSource.query(`SELECT tenant_id FROM tenant_routing WHERE status = 'active' ORDER BY created_at`);
        return rows.map((r) => r.tenant_id);
    }
    /**
     * Tenant'ın şirket adını döner.
     *
     * tenant_profiles tablosundan çeker — bulunamazsa tenantId döner.
     * E-posta şablonları, PDF başlıkları gibi kullanıcıya dönük içeriklerde kullanılır.
     */
    async getCompanyName(tenantId) {
        const rows = await this.controlPlaneDataSource.query(`SELECT company_name FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`, [tenantId]);
        return rows[0]?.company_name ?? tenantId;
    }
    // ─── Özel yardımcı metodlar ────────────────────────────────────────────────
    async getFromCache(tenantId) {
        const raw = await this.redis.get(routingKey(tenantId));
        if (!raw)
            return null;
        try {
            return JSON.parse(raw);
        }
        catch {
            // Bozuk önbellek kaydı — sil ve devam et
            await this.redis.del(routingKey(tenantId));
            return null;
        }
    }
    async queryControlPlane(tenantId) {
        const row = await this.controlPlaneDataSource.query(`SELECT
         tenant_id       AS "tenantId",
         cluster_id      AS "clusterId",
         pgbouncer_endpoint AS "pgbouncerEndpoint",
         db_name         AS "databaseName",
         schema_name     AS "schemaName",
         pool_mode       AS "poolMode",
         tier,
         status
       FROM tenant_routing
       WHERE tenant_id = $1
       LIMIT 1`, [tenantId]);
        if (!row.length) {
            throw new TenantNotFoundError(tenantId);
        }
        const record = row[0];
        if (record.status === 'suspended') {
            throw new TenantSuspendedError(tenantId);
        }
        return record;
    }
    async writeToCache(tenantId, record) {
        await this.redis.set(routingKey(tenantId), JSON.stringify(record), 'EX', ROUTING_CACHE_TTL_SECONDS);
    }
    async onModuleDestroy() {
        await this.redis.quit();
    }
};
exports.TenantRoutingService = TenantRoutingService;
exports.TenantRoutingService = TenantRoutingService = TenantRoutingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectDataSource)('control_plane')),
    __metadata("design:paramtypes", [typeorm_2.DataSource])
], TenantRoutingService);
// ─── Domain hataları ────────────────────────────────────────────────────────
class TenantNotFoundError extends Error {
    constructor(tenantId) {
        super(`Tenant bulunamadı: ${tenantId}`);
        this.name = 'TenantNotFoundError';
    }
}
exports.TenantNotFoundError = TenantNotFoundError;
class TenantSuspendedError extends Error {
    constructor(tenantId) {
        super(`Tenant askıya alındı: ${tenantId}`);
        this.name = 'TenantSuspendedError';
    }
}
exports.TenantSuspendedError = TenantSuspendedError;
class TenantProvisioningError extends Error {
    constructor(tenantId) {
        super(`Tenant henüz hazır değil (provizyon devam ediyor): ${tenantId}`);
        this.name = 'TenantProvisioningError';
    }
}
exports.TenantProvisioningError = TenantProvisioningError;

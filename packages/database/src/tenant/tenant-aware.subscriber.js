"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossTenantWriteError = exports.TenantAwareSubscriber = void 0;
const common_1 = require("@nestjs/common");
const tenant_context_storage_1 = require("./tenant-context.storage");
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
class TenantAwareSubscriber {
    constructor() {
        this.logger = new common_1.Logger(TenantAwareSubscriber.name);
    }
    /**
     * Tüm entity türleri için dinle (belirli bir entity belirtme).
     * listenTo() metodunu override etmeyerek tüm entity'lere uygulanır.
     */
    beforeInsert(event) {
        this.injectAndVerifyTenantId(event.entity, 'INSERT', event.queryRunner);
    }
    beforeUpdate(event) {
        if (event.entity) {
            this.injectAndVerifyTenantId(event.entity, 'UPDATE', event.queryRunner);
        }
    }
    injectAndVerifyTenantId(entity, operation, queryRunner) {
        // Entity'de tenant_id alanı yoksa bu subscriber ilgilenmez
        // (örn: lookup tabloları, sistem tabloları)
        if (!('tenant_id' in entity))
            return;
        let context;
        try {
            context = (0, tenant_context_storage_1.getTenantContext)();
        }
        catch {
            // Guard'sız erişim — güvenlik ihlali
            throw new CrossTenantWriteError(`[GÜVENLİK] ${operation} işlemi tenant context olmadan denendi. ` +
                `TenantGuard atlanmış olabilir.`);
        }
        const { tenantId } = context;
        if (entity['tenant_id'] === undefined || entity['tenant_id'] === null) {
            // Otomatik doldur
            entity['tenant_id'] = tenantId;
        }
        else if (entity['tenant_id'] !== tenantId) {
            // Farklı tenant'a yazmak istiyor — kritik güvenlik ihlali
            this.logger.error(`CROSS-TENANT WRITE GİRİŞİMİ ENGELLENDI: ` +
                `işlem=${operation} ` +
                `context_tenant=${tenantId} ` +
                `entity_tenant=${entity['tenant_id']}`);
            // Query'yi hemen iptal et
            void queryRunner.rollbackTransaction().catch(() => undefined);
            throw new CrossTenantWriteError(`Çapraz-tenant yazma girişimi engellendi: ` +
                `${tenantId} → ${entity['tenant_id']}`);
        }
    }
}
exports.TenantAwareSubscriber = TenantAwareSubscriber;
class CrossTenantWriteError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CrossTenantWriteError';
    }
}
exports.CrossTenantWriteError = CrossTenantWriteError;

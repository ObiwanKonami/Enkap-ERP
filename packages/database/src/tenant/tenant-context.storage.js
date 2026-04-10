"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantContextStorage = void 0;
exports.getTenantContext = getTenantContext;
exports.runWithTenantContext = runWithTenantContext;
exports.enterTenantContext = enterTenantContext;
const async_hooks_1 = require("async_hooks");
/**
 * Uygulama genelinde tek (singleton) AsyncLocalStorage örneği.
 *
 * Node.js'in async context tracking mekanizmasını kullanarak her
 * istek için tenant_id'yi otomatik olarak taşır — herhangi bir
 * fonksiyona parametre olarak geçirmeye gerek kalmaz.
 *
 * KURAL: Bu storage'a YALNIZCA TenantGuard yazar.
 *        Diğer her yer yalnızca okur.
 */
exports.tenantContextStorage = new async_hooks_1.AsyncLocalStorage();
/**
 * Mevcut asenkron bağlamdan tenant context'i döndürür.
 *
 * @throws {Error} Guard çalışmadan doğrudan DB sorgusuna ulaşılırsa.
 *                 Bu durum bir güvenlik açığına işaret eder — sessizce
 *                 devam etmek yerine erken hata fırlatmak tercih edilir.
 */
function getTenantContext() {
    const context = exports.tenantContextStorage.getStore();
    if (!context) {
        throw new Error('[TenantContext] Bağlamda tenant_id bulunamadı. ' +
            'Bu hata, TenantGuard\'ın atlandığını veya Guard dışında ' +
            'doğrudan DB erişimi denendiğini gösterir.');
    }
    return context;
}
/**
 * Verilen tenant context ile bir callback fonksiyonunu çalıştırır.
 * Callback tamamlandığında context otomatik olarak temizlenir.
 *
 * Yalnızca TenantGuard tarafından çağrılmalıdır.
 */
function runWithTenantContext(context, callback) {
    return exports.tenantContextStorage.run(context, callback);
}
/**
 * Mevcut async context'e tenant context'i set eder.
 * `run()` aksine callback gerekmez — context mevcut async scope boyunca kalır.
 *
 * NestJS Guard içinde kullanılır: guard `true` döndürdükten sonra
 * route handler çalıştığında context hâlâ erişilebilir olur.
 */
function enterTenantContext(context) {
    exports.tenantContextStorage.enterWith(context);
}

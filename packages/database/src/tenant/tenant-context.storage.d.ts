import { AsyncLocalStorage } from 'async_hooks';
import type { TenantContext } from '@enkap/shared-types';
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
export declare const tenantContextStorage: AsyncLocalStorage<TenantContext>;
/**
 * Mevcut asenkron bağlamdan tenant context'i döndürür.
 *
 * @throws {Error} Guard çalışmadan doğrudan DB sorgusuna ulaşılırsa.
 *                 Bu durum bir güvenlik açığına işaret eder — sessizce
 *                 devam etmek yerine erken hata fırlatmak tercih edilir.
 */
export declare function getTenantContext(): TenantContext;
/**
 * Verilen tenant context ile bir callback fonksiyonunu çalıştırır.
 * Callback tamamlandığında context otomatik olarak temizlenir.
 *
 * Yalnızca TenantGuard tarafından çağrılmalıdır.
 */
export declare function runWithTenantContext<T>(context: TenantContext, callback: () => T): T;

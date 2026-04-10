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
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Mevcut asenkron bağlamdan tenant context'i döndürür.
 *
 * @throws {Error} Guard çalışmadan doğrudan DB sorgusuna ulaşılırsa.
 *                 Bu durum bir güvenlik açığına işaret eder — sessizce
 *                 devam etmek yerine erken hata fırlatmak tercih edilir.
 */
export function getTenantContext(): TenantContext {
  const context = tenantContextStorage.getStore();

  if (!context) {
    throw new Error(
      '[TenantContext] Bağlamda tenant_id bulunamadı. ' +
      'Bu hata, TenantGuard\'ın atlandığını veya Guard dışında ' +
      'doğrudan DB erişimi denendiğini gösterir.',
    );
  }

  return context;
}

/**
 * Verilen tenant context ile bir callback fonksiyonunu çalıştırır.
 * Callback tamamlandığında context otomatik olarak temizlenir.
 *
 * Yalnızca TenantGuard tarafından çağrılmalıdır.
 */
export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => T,
): T {
  return tenantContextStorage.run(context, callback);
}

/**
 * Mevcut async context'e tenant context'i set eder.
 * `run()` aksine callback gerekmez — context mevcut async scope boyunca kalır.
 *
 * NestJS Guard içinde kullanılır: guard `true` döndürdükten sonra
 * route handler çalıştığında context hâlâ erişilebilir olur.
 */
export function enterTenantContext(context: TenantContext): void {
  tenantContextStorage.enterWith(context);
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithTenantContext, TenantRoutingService } from '@enkap/database';
import { EcommerceService } from './ecommerce.service';

/**
 * E-ticaret Senkronizasyon Zamanlayıcı.
 *
 * Her 30 dakikada bir tüm aktif e-ticaret entegrasyonlarını senkronize eder.
 * Her tenant kendi AsyncLocalStorage bağlamında çalışır (tenant izolasyonu korunur).
 *
 * Hata toleransı: Promise.allSettled — tek tenant hatası diğerlerini durdurmaz.
 * Örtüşme koruması: isRunning flag'i — önceki çalışma bitmemişse yeni tetikleme atlanır.
 *
 * Cron: '0 *\/30 * * * *' → her saatin 0. ve 30. dakikasında
 */
@Injectable()
export class EcommerceSyncScheduler {
  private readonly logger = new Logger(EcommerceSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly tenantRouting: TenantRoutingService,
    private readonly ecommerceService: EcommerceService,
  ) {}

  /** Her 30 dakikada bir tüm aktif e-ticaret entegrasyonlarını senkronize eder */
  @Cron('0 */30 * * * *')
  async runSync(): Promise<void> {
    // Bir önceki çalışma bitmemişse atla — mükerrer çalışmayı engelle
    if (this.isRunning) {
      this.logger.warn('E-ticaret sync zaten çalışıyor — atlanıyor');
      return;
    }

    this.isRunning = true;
    this.logger.log('E-ticaret sync başlıyor...');

    try {
      // Tüm aktif tenant ID'lerini control plane'den al
      const tenantIds = await this.tenantRouting.findAllActiveIds();

      if (tenantIds.length === 0) {
        this.logger.debug('E-ticaret sync: aktif tenant yok');
        return;
      }

      this.logger.log(
        `E-ticaret sync: ${tenantIds.length} tenant için senkronizasyon başlatılıyor`,
      );

      // Her tenant kendi AsyncLocalStorage bağlamında çalışır
      const tasks = tenantIds.map((tenantId) =>
        this.syncForTenant(tenantId),
      );

      // Hatalı tenant diğerlerini bloklamasın
      const results = await Promise.allSettled(tasks);

      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `E-ticaret sync tamamlandı: ${tenantIds.length} tenant, ${failed} hata`,
      );
    } catch (err) {
      this.logger.error(
        `E-ticaret sync kritik hata: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Belirli bir tenant için tüm aktif entegrasyonları senkronize eder.
   * runWithTenantContext ile tenant bağlamı kurulur — getTenantContext() güvenli çalışır.
   */
  private syncForTenant(tenantId: string): Promise<void> {
    return runWithTenantContext(
      {
        tenantId,
        userId:    'system',
        sessionId: 'ecommerce-cron',
        userRoles: [],
        tier:      'starter',
      },
      async () => {
        try {
          await this.ecommerceService.syncAllActive();
        } catch (err) {
          this.logger.error(
            `E-ticaret sync tenant hatası: tenant=${tenantId} — ${err instanceof Error ? err.message : String(err)}`,
          );
          throw err;
        }
      },
    ) as Promise<void>;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { runWithTenantContext, TenantDataSourceManager, TenantRoutingService } from '@enkap/database';
import { TrendyolSyncService } from './trendyol/trendyol-sync.service';
import { HepsiburadaSyncService } from './hepsiburada/hepsiburada-sync.service';
import { MarketplaceIntegration } from './entities/marketplace-integration.entity';

/**
 * Marketplace Senkronizasyon Zamanlayıcı.
 *
 * Her 15 dakikada bir tüm aktif entegrasyonlar için senkronizasyon çalıştırır.
 * Her tenant kendi AsyncLocalStorage bağlamında çalışır (tenant izolasyonu).
 *
 * Cron: '0 *\/15 * * * *' → her saatten 0, 15, 30, 45. dakikasında
 */
@Injectable()
export class MarketplaceSyncScheduler {
  private readonly logger = new Logger(MarketplaceSyncScheduler.name);
  private isRunning = false;

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly tenantRouting: TenantRoutingService,
    private readonly trendyolSync: TrendyolSyncService,
    private readonly hepsiburadaSync: HepsiburadaSyncService,
  ) {}

  @Cron('0 */15 * * * *')
  async syncAll(): Promise<void> {
    // Bir önceki çalışma bitmemişse atla
    if (this.isRunning) {
      this.logger.warn('Marketplace sync zaten çalışıyor — atlanıyor');
      return;
    }

    this.isRunning = true;
    this.logger.log('Marketplace sync başlıyor...');

    try {
      // Tüm aktif tenant ID'lerini control plane'den al
      const tenantIds = await this.tenantRouting.findAllActiveIds();

      if (tenantIds.length === 0) {
        this.logger.debug('Marketplace sync: aktif tenant yok');
        return;
      }

      // Her tenant için aktif entegrasyonları al ve senkronize et
      const tasks = tenantIds.map((tenantId) =>
        this.syncTenant(tenantId),
      );

      // Hatalı tenant diğerlerini bloklamasın
      const results = await Promise.allSettled(tasks);

      const failed = results.filter((r) => r.status === 'rejected').length;
      this.logger.log(
        `Marketplace sync tamamlandı: ${tenantIds.length} tenant, ${failed} hata`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Tek bir tenant için aktif marketplace entegrasyonlarını bulur ve senkronize eder.
   */
  private async syncTenant(tenantId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(MarketplaceIntegration);

    const integrations = await integrationRepo.find({
      where: { isActive: true },
      select: ['tenantId', 'platform'],
    });

    if (integrations.length === 0) return;

    const tasks = integrations.map((integration) =>
      this.syncOne(integration.tenantId, integration.platform),
    );

    await Promise.allSettled(tasks);
  }

  private syncOne(
    tenantId: string,
    platform: MarketplaceIntegration['platform'],
  ): Promise<void> {
    // Her tenant kendi AsyncLocalStorage bağlamında çalışır
    return runWithTenantContext(
      { tenantId, userId: 'system', sessionId: 'cron', userRoles: [], tier: 'starter' },
      async () => {
      switch (platform) {
        case 'TRENDYOL':
          await this.trendyolSync.syncForTenant(tenantId);
          break;
        case 'HEPSIBURADA':
          await this.hepsiburadaSync.syncForTenant(tenantId);
          break;
        default:
          this.logger.warn(`Desteklenmeyen platform: ${platform}`);
      }
    }) as Promise<void>;
  }
}

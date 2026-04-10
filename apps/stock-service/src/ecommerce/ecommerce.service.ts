import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { CredentialEncryptionService } from '../marketplace/credential-encryption.service';
import {
  EcommerceIntegration,
  EcommercePlatform,
} from './entities/ecommerce-integration.entity';
import {
  CreateEcommerceIntegrationDto,
  UpdateEcommerceIntegrationDto,
} from './dto/create-integration.dto';
import { type SyncResult, emptySyncResult } from './dto/sync-result.dto';
import { WooCommerceSyncService } from './woocommerce/woocommerce-sync.service';
import { ShopifySyncService } from './shopify/shopify-sync.service';
import { TicimaxSyncService } from './ticimax/ticimax-sync.service';
import { IdeaSoftSyncService } from './ideasoft/ideasoft-sync.service';

/**
 * E-ticaret Entegrasyon Servisi.
 *
 * Sorumluluklar:
 *  - Entegrasyon CRUD (credential şifreleme/çözme dahil)
 *  - Manuel ve otomatik senkronizasyon tetikleme
 *  - Platform'a uygun sync servisi yönlendirme
 *
 * Tenant izolasyonu: getTenantContext() → AsyncLocalStorage'dan alınır.
 * Credential şifreleme: MARKETPLACE_ENCRYPTION_KEY ile AES-256-GCM.
 */
@Injectable()
export class EcommerceService {
  private readonly logger = new Logger(EcommerceService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly wooSync: WooCommerceSyncService,
    private readonly shopifySync: ShopifySyncService,
    private readonly ticimaxSync: TicimaxSyncService,
    private readonly ideaSoftSync: IdeaSoftSyncService,
  ) {}

  /**
   * Yeni e-ticaret entegrasyonu oluşturur.
   * Credential'lar kaydedilmeden önce AES-256-GCM ile şifrelenir.
   */
  async createIntegration(
    dto: CreateEcommerceIntegrationDto,
  ): Promise<EcommerceIntegration> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    // Credential'ları şifrele — düz metin asla DB'ye yazılmaz
    const encryptedCredentials = this.credentialEncryption.encrypt(dto.credentials);

    const integration = integrationRepo.create({
      tenantId,
      platform:     dto.platform,
      name:         dto.name,
      storeUrl:     dto.store_url,
      credentials:  encryptedCredentials,
      syncProducts: dto.sync_products ?? true,
      syncStock:    dto.sync_stock    ?? true,
      syncOrders:   dto.sync_orders   ?? true,
      // İlk senkronizasyonda 30 gün öncesine bakılacak
      syncSince:    null,
    });

    const saved = await integrationRepo.save(integration);

    this.logger.log(
      `E-ticaret entegrasyonu oluşturuldu: platform=${dto.platform}, isim="${dto.name}", tenant=${tenantId}`,
    );

    return saved;
  }

  /** Tenant'ın tüm e-ticaret entegrasyonlarını listeler */
  async listIntegrations(): Promise<EcommerceIntegration[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    return integrationRepo.find({
      where:  { tenantId },
      order:  { createdAt: 'DESC' },
      select: [
        'id', 'tenantId', 'platform', 'name', 'storeUrl',
        'isActive', 'syncProducts', 'syncStock', 'syncOrders',
        'lastSyncedAt', 'lastSyncError', 'syncSince',
        'createdAt', 'updatedAt',
        // credentials alanı kasıtlı olarak SELECT'e dahil edilmedi (güvenlik)
      ],
    });
  }

  /** Tek entegrasyonu getirir (tenant doğrulaması yapılır) */
  async getIntegration(id: string): Promise<EcommerceIntegration> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    const integration = await integrationRepo.findOne({
      where: { id, tenantId },
    });

    if (!integration) {
      throw new NotFoundException(`E-ticaret entegrasyonu bulunamadı: ${id}`);
    }

    return integration;
  }

  /**
   * E-ticaret entegrasyonunu günceller.
   * Credential gönderilmişse yeniden şifrelenir.
   */
  async updateIntegration(
    id: string,
    dto: UpdateEcommerceIntegrationDto,
  ): Promise<EcommerceIntegration> {
    const integration = await this.getIntegration(id);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    if (dto.platform  !== undefined) integration.platform  = dto.platform;
    if (dto.name      !== undefined) integration.name      = dto.name;
    if (dto.store_url !== undefined) integration.storeUrl  = dto.store_url;

    // Credential güncellemesi — yeniden şifrele
    if (dto.credentials !== undefined) {
      integration.credentials = this.credentialEncryption.encrypt(dto.credentials);
    }

    if (dto.sync_products !== undefined) integration.syncProducts = dto.sync_products;
    if (dto.sync_stock    !== undefined) integration.syncStock    = dto.sync_stock;
    if (dto.sync_orders   !== undefined) integration.syncOrders   = dto.sync_orders;

    const updated = await integrationRepo.save(integration);

    this.logger.log(
      `E-ticaret entegrasyonu güncellendi: id=${id}, platform=${updated.platform}`,
    );

    return updated;
  }

  /** E-ticaret entegrasyonunu siler */
  async deleteIntegration(id: string): Promise<void> {
    const integration = await this.getIntegration(id);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    await integrationRepo.remove(integration);

    this.logger.log(`E-ticaret entegrasyonu silindi: id=${id}`);
  }

  /** Entegrasyonu aktif/pasif yapar */
  async toggleActive(id: string): Promise<EcommerceIntegration> {
    const integration = await this.getIntegration(id);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    integration.isActive = !integration.isActive;
    const updated = await integrationRepo.save(integration);

    this.logger.log(
      `E-ticaret entegrasyon durumu değiştirildi: id=${id}, aktif=${updated.isActive}`,
    );

    return updated;
  }

  /**
   * Belirtilen entegrasyon için senkronizasyon başlatır.
   * Platform'a göre ilgili sync servisi çağrılır.
   * Sonuç: last_synced_at ve last_sync_error güncellenir.
   */
  async syncIntegration(id: string): Promise<SyncResult> {
    const integration = await this.getIntegration(id);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    this.logger.log(
      `Manuel e-ticaret sync başlatıldı: id=${id}, platform=${integration.platform}`,
    );

    const result = await this.runSync(integration);

    // Senkronizasyon sonucunu entegrasyona yaz
    await integrationRepo.update(integration.id, {
      lastSyncedAt:  result.synced_at,
      lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null,
    });

    return result;
  }

  /**
   * Tenant'ın tüm aktif entegrasyonlarını paralel senkronize eder.
   * Scheduler tarafından çağrılır.
   * Tek entegrasyon hatası diğerlerini durdurmaz (Promise.allSettled).
   */
  async syncAllActive(): Promise<void> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    const integrations = await integrationRepo.find({
      where: { tenantId, isActive: true },
    });

    if (integrations.length === 0) return;

    const results = await Promise.allSettled(
      integrations.map((integration) => this.runSyncAndUpdate(integration, tenantId)),
    );

    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      this.logger.warn(
        `E-ticaret sync: tenant=${tenantId}, ${integrations.length} entegrasyon, ${failed} hata`,
      );
    } else {
      this.logger.log(
        `E-ticaret sync tamamlandı: tenant=${tenantId}, ${integrations.length} entegrasyon`,
      );
    }
  }

  /**
   * Senkronizasyon çalıştırır ve DB'yi günceller (iç yardımcı).
   */
  private async runSyncAndUpdate(
    integration: EcommerceIntegration,
    tenantId: string,
  ): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(EcommerceIntegration);

    try {
      const result = await this.runSync(integration);

      await integrationRepo.update(integration.id, {
        lastSyncedAt:  result.synced_at,
        lastSyncError: result.errors.length > 0 ? result.errors.join('; ') : null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `E-ticaret sync fatal hata: id=${integration.id}, platform=${integration.platform} — ${message}`,
      );

      await integrationRepo.update(integration.id, {
        lastSyncError: message,
      });

      throw err;
    }
  }

  /**
   * Platform'a göre doğru sync servisi çağırır.
   * syncProducts ve syncOrders alanları kontrol edilerek seçici senkronizasyon yapılır.
   */
  private async runSync(integration: EcommerceIntegration): Promise<SyncResult> {
    const productResult = emptySyncResult(integration.platform);
    const orderResult   = emptySyncResult(integration.platform);

    switch (integration.platform) {
      case EcommercePlatform.WOOCOMMERCE: {
        if (integration.syncProducts || integration.syncStock) {
          const r = await this.wooSync.syncProducts(integration);
          productResult.products_synced = r.products_synced;
          productResult.stock_updated   = r.stock_updated;
          productResult.errors.push(...r.errors);
        }
        if (integration.syncOrders) {
          const r = await this.wooSync.syncOrders(integration);
          orderResult.orders_imported = r.orders_imported;
          orderResult.errors.push(...r.errors);
        }
        break;
      }

      case EcommercePlatform.SHOPIFY: {
        if (integration.syncProducts || integration.syncStock) {
          const r = await this.shopifySync.syncProducts(integration);
          productResult.products_synced = r.products_synced;
          productResult.stock_updated   = r.stock_updated;
          productResult.errors.push(...r.errors);
        }
        if (integration.syncOrders) {
          const r = await this.shopifySync.syncOrders(integration);
          orderResult.orders_imported = r.orders_imported;
          orderResult.errors.push(...r.errors);
        }
        break;
      }

      case EcommercePlatform.TICIMAX: {
        if (integration.syncProducts || integration.syncStock) {
          const r = await this.ticimaxSync.syncProducts(integration);
          productResult.products_synced = r.products_synced;
          productResult.stock_updated   = r.stock_updated;
          productResult.errors.push(...r.errors);
        }
        if (integration.syncOrders) {
          const r = await this.ticimaxSync.syncOrders(integration);
          orderResult.orders_imported = r.orders_imported;
          orderResult.errors.push(...r.errors);
        }
        break;
      }

      case EcommercePlatform.IDEASOFT: {
        if (integration.syncProducts || integration.syncStock) {
          const r = await this.ideaSoftSync.syncProducts(integration);
          productResult.products_synced = r.products_synced;
          productResult.stock_updated   = r.stock_updated;
          productResult.errors.push(...r.errors);
        }
        if (integration.syncOrders) {
          const r = await this.ideaSoftSync.syncOrders(integration);
          orderResult.orders_imported = r.orders_imported;
          orderResult.errors.push(...r.errors);
        }
        break;
      }

      default: {
        this.logger.warn(
          `Desteklenmeyen e-ticaret platformu: ${integration.platform as string}`,
        );
      }
    }

    // İki sonucu birleştir
    return {
      platform:         integration.platform,
      products_synced:  productResult.products_synced,
      stock_updated:    productResult.stock_updated,
      orders_imported:  orderResult.orders_imported,
      errors:           [...productResult.errors, ...orderResult.errors],
      synced_at:        new Date(),
    };
  }
}

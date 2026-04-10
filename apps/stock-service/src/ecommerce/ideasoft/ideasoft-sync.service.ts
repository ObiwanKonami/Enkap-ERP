import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { IdeaSoftClient, type IdeaSoftOrder } from './ideasoft.client';
import { CredentialEncryptionService } from '../../marketplace/credential-encryption.service';
import { EcommerceIntegration, EcommercePlatform } from '../entities/ecommerce-integration.entity';
import { MarketplaceOrder } from '../../marketplace/entities/marketplace-order.entity';
import { MarketplaceOrderLine } from '../../marketplace/entities/marketplace-order-line.entity';
import { StockMovementService } from '../../movement/stock-movement.service';
import type { MovementType } from '../../movement/entities/stock-movement.entity';
import { type SyncResult, emptySyncResult } from '../dto/sync-result.dto';

/**
 * İdeaSoft Senkronizasyon Servisi.
 *
 * Türkiye e-ticaret sağlayıcısı İdeaSoft için senkronizasyon akışı:
 *  - Ürün stoku: ERP → İdeaSoft (ürün kodu bazlı eşleşme)
 *  - Sipariş aktarımı: İdeaSoft → ERP (idempotent, orderId benzersiz key)
 */
@Injectable()
export class IdeaSoftSyncService {
  private readonly logger = new Logger(IdeaSoftSyncService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly ideaSoftClient: IdeaSoftClient,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly movementService: StockMovementService,
  ) {}

  /**
   * ERP stok miktarlarını İdeaSoft'a senkronize eder.
   * İdeaSoft ürün kodu ↔ ERP SKU eşlemesi yapılır.
   */
  async syncProducts(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.IDEASOFT);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      api_key:    decrypted['api_key']    ?? '',
      store_hash: decrypted['store_hash'] ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    let page = 1;

    while (true) {
      const products = await this.ideaSoftClient.getProducts(creds, page);

      if (products.length === 0) break;

      for (const product of products) {
        if (!product.code) continue;

        try {
          // İdeaSoft code → ERP SKU eşlemesi
          const erpProduct = await ds.query<[{ id: string; quantity: number }?]>(
            `SELECT p.id, COALESCE(
               (SELECT SUM(CASE WHEN sm.type IN ('GIRIS','IADE_GIRIS') THEN sm.quantity ELSE -sm.quantity END)
                FROM stock_movements sm WHERE sm.product_id = p.id), 0
             ) AS quantity
             FROM products p
             WHERE p.tenant_id = $1 AND p.sku = $2
             LIMIT 1`,
            [integration.tenantId, product.code],
          );

          if (!erpProduct[0]) continue;

          const netStock = Math.max(0, erpProduct[0].quantity);

          if (netStock !== product.quantity) {
            await this.ideaSoftClient.updateStock(creds, product.id, netStock);
            result.stock_updated++;
          }

          result.products_synced++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`İdeaSoft stok hatası (kod=${product.code}): ${message}`);
          this.logger.warn(`İdeaSoft stok güncelleme hatası: ${message}`);
        }
      }

      // 100'den az sonuç → son sayfa
      if (products.length < 100) break;
      page++;
    }

    this.logger.log(
      `İdeaSoft ürün sync: ${result.products_synced} ürün, ${result.stock_updated} güncelleme`,
    );

    return result;
  }

  /**
   * İdeaSoft'tan yeni siparişleri ERP'ye aktarır.
   */
  async syncOrders(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.IDEASOFT);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      api_key:    decrypted['api_key']    ?? '',
      store_hash: decrypted['store_hash'] ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    const after = integration.syncSince
      ? new Date(integration.syncSince.getTime() - 5 * 60_000)
      : new Date(Date.now() - 30 * 24 * 60 * 60_000);

    const orders = await this.ideaSoftClient.getOrders(creds, after);

    for (const order of orders) {
      try {
        const isNew = await this.upsertOrder(integration.tenantId, ds, order);
        if (isNew) result.orders_imported++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`İdeaSoft sipariş hatası (no=${order.orderNo}): ${message}`);
        this.logger.error(`İdeaSoft sipariş kayıt hatası: ${message}`);
      }
    }

    const integrationRepo = ds.getRepository(EcommerceIntegration);
    await integrationRepo.update(integration.id, { syncSince: new Date() });

    this.logger.log(
      `İdeaSoft sipariş sync: ${result.orders_imported} yeni sipariş aktarıldı`,
    );

    return result;
  }

  /** İdeaSoft siparişi idempotent kaydeder — orderId benzersiz key */
  private async upsertOrder(tenantId: string, ds: DataSource, raw: IdeaSoftOrder): Promise<boolean> {
    const platformOrderId = String(raw.id);
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const existing = await orderRepo.findOne({
      where: { tenantId, platform: 'IDEASOFT' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (existing) return false;

    await ds.transaction(async (manager) => {
      const totalKurus = Math.round(raw.total * 100);

      const order = manager.create(MarketplaceOrder, {
        tenantId,
        platform:         'IDEASOFT' as MarketplaceOrder['platform'],
        platformOrderId,
        platformOrderNo:  raw.orderNo,
        status:           'NEW' as MarketplaceOrder['status'],
        customerName:     null,
        cargoTrackingNo:  null,
        grossAmountKurus: totalKurus,
        orderedAt:        new Date(raw.date),
        rawPayload:       raw as unknown as Record<string, unknown>,
      });

      const saved = await manager.save(MarketplaceOrder, order);

      const lines = raw.lines.map((item) =>
        manager.create(MarketplaceOrderLine, {
          tenantId,
          orderId:         saved.id,
          platformLineId:  String(item.productId),
          platformSku:     item.productCode,
          platformBarcode: null,
          productName:     item.name,
          quantity:        item.quantity,
          unitPriceKurus:  Math.round(item.price * 100),
          commissionKurus: 0,
        }),
      );

      await manager.save(MarketplaceOrderLine, lines);
    });

    await this.reserveStock(tenantId, ds, platformOrderId, raw);

    return true;
  }

  /** İdeaSoft siparişi için stok CIKIS hareketi oluşturur */
  private async reserveStock(
    tenantId: string,
    ds: DataSource,
    platformOrderId: string,
    raw: IdeaSoftOrder,
  ): Promise<void> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const order = await orderRepo.findOne({
      where: { tenantId, platform: 'IDEASOFT' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (!order) return;

    for (const item of raw.lines) {
      const product = await ds.query<[{ id: string; warehouse_id: string }?]>(
        `SELECT p.id, w.id AS warehouse_id
         FROM products p
         JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_active = true
         WHERE p.tenant_id = $1 AND p.sku = $2
         LIMIT 1`,
        [tenantId, item.productCode],
      );

      if (!product[0]) {
        this.logger.warn(
          `İdeaSoft ürün stok eşleşmedi: kod=${item.productCode}, sipariş=${raw.orderNo}`,
        );
        continue;
      }

      try {
        await this.movementService.create({
          productId:     product[0].id,
          warehouseId:   product[0].warehouse_id,
          type:          'CIKIS' as MovementType,
          quantity:      item.quantity,
          referenceType: 'MARKETPLACE_ORDER',
          referenceId:   order.id,
          notes:         `İdeaSoft sipariş: ${raw.orderNo}`,
        } as Parameters<typeof this.movementService.create>[0]);
      } catch (err) {
        this.logger.error(
          `İdeaSoft stok rezervasyonu başarısız: kod=${item.productCode} — ${String(err)}`,
        );
      }
    }
  }
}

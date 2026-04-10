import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { TicimaxClient, type TicimaxOrder } from './ticimax.client';
import { CredentialEncryptionService } from '../../marketplace/credential-encryption.service';
import { EcommerceIntegration, EcommercePlatform } from '../entities/ecommerce-integration.entity';
import { MarketplaceOrder } from '../../marketplace/entities/marketplace-order.entity';
import { MarketplaceOrderLine } from '../../marketplace/entities/marketplace-order-line.entity';
import { StockMovementService } from '../../movement/stock-movement.service';
import type { MovementType } from '../../movement/entities/stock-movement.entity';
import { type SyncResult, emptySyncResult } from '../dto/sync-result.dto';

/**
 * Ticimax Senkronizasyon Servisi.
 *
 * Türkiye e-ticaret sağlayıcısı Ticimax için senkronizasyon akışı:
 *  - Ürün stoku: ERP → Ticimax (ProductCode bazlı eşleşme)
 *  - Sipariş aktarımı: Ticimax → ERP (idempotent, OrderNo benzersiz key)
 */
@Injectable()
export class TicimaxSyncService {
  private readonly logger = new Logger(TicimaxSyncService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly ticimaxClient: TicimaxClient,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly movementService: StockMovementService,
  ) {}

  /**
   * ERP stok miktarlarını Ticimax'a senkronize eder.
   * ProductCode ↔ ERP SKU eşlemesi yapılır.
   */
  async syncProducts(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.TICIMAX);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      api_key: decrypted['api_key'] ?? '',
      site_id: decrypted['site_id'] ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    let page = 1;

    while (true) {
      const products = await this.ticimaxClient.getProducts(creds, page);

      if (products.length === 0) break;

      for (const product of products) {
        if (!product.ProductCode) continue;

        try {
          // Ticimax ProductCode → ERP SKU eşlemesi
          const erpProduct = await ds.query<[{ id: string; quantity: number }?]>(
            `SELECT p.id, COALESCE(
               (SELECT SUM(CASE WHEN sm.type IN ('GIRIS','IADE_GIRIS') THEN sm.quantity ELSE -sm.quantity END)
                FROM stock_movements sm WHERE sm.product_id = p.id), 0
             ) AS quantity
             FROM products p
             WHERE p.tenant_id = $1 AND p.sku = $2
             LIMIT 1`,
            [integration.tenantId, product.ProductCode],
          );

          if (!erpProduct[0]) continue;

          const netStock = Math.max(0, erpProduct[0].quantity);

          if (netStock !== product.Stock) {
            await this.ticimaxClient.updateStock(creds, product.ProductCode, netStock);
            result.stock_updated++;
          }

          result.products_synced++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Ticimax stok hatası (kod=${product.ProductCode}): ${message}`);
          this.logger.warn(`Ticimax stok güncelleme hatası: ${message}`);
        }
      }

      // Ticimax sayfalama — 100'den az sonuç gelirse son sayfa
      if (products.length < 100) break;
      page++;
    }

    this.logger.log(
      `Ticimax ürün sync: ${result.products_synced} ürün, ${result.stock_updated} güncelleme`,
    );

    return result;
  }

  /**
   * Ticimax'tan yeni siparişleri ERP'ye aktarır.
   */
  async syncOrders(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.TICIMAX);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      api_key: decrypted['api_key'] ?? '',
      site_id: decrypted['site_id'] ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    // İlk senkronizasyonda 30 gün öncesine bak
    const startDate = integration.syncSince
      ? new Date(integration.syncSince.getTime() - 5 * 60_000)
      : new Date(Date.now() - 30 * 24 * 60 * 60_000);

    const orders = await this.ticimaxClient.getOrders(creds, startDate);

    for (const order of orders) {
      try {
        const isNew = await this.upsertOrder(integration.tenantId, ds, order);
        if (isNew) result.orders_imported++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push(`Ticimax sipariş hatası (no=${order.OrderNo}): ${message}`);
        this.logger.error(`Ticimax sipariş kayıt hatası: ${message}`);
      }
    }

    const integrationRepo = ds.getRepository(EcommerceIntegration);
    await integrationRepo.update(integration.id, { syncSince: new Date() });

    this.logger.log(
      `Ticimax sipariş sync: ${result.orders_imported} yeni sipariş aktarıldı`,
    );

    return result;
  }

  /** Ticimax siparişi idempotent kaydeder — OrderId benzersiz key */
  private async upsertOrder(tenantId: string, ds: DataSource, raw: TicimaxOrder): Promise<boolean> {
    const platformOrderId = String(raw.OrderId);
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const existing = await orderRepo.findOne({
      where: { tenantId, platform: 'TICIMAX' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (existing) return false;

    await ds.transaction(async (manager) => {
      const totalKurus = Math.round(raw.TotalPrice * 100);

      const order = manager.create(MarketplaceOrder, {
        tenantId,
        platform:         'TICIMAX' as MarketplaceOrder['platform'],
        platformOrderId,
        platformOrderNo:  raw.OrderNo,
        status:           'NEW' as MarketplaceOrder['status'],
        customerName:     null,
        cargoTrackingNo:  null,
        grossAmountKurus: totalKurus,
        orderedAt:        new Date(raw.OrderDate),
        rawPayload:       raw as unknown as Record<string, unknown>,
      });

      const saved = await manager.save(MarketplaceOrder, order);

      const lines = raw.OrderDetails.map((item) =>
        manager.create(MarketplaceOrderLine, {
          tenantId,
          orderId:         saved.id,
          platformLineId:  null,
          platformSku:     item.ProductCode,
          platformBarcode: null,
          productName:     item.ProductName,
          quantity:        item.Quantity,
          unitPriceKurus:  Math.round(item.Price * 100),
          commissionKurus: 0,
        }),
      );

      await manager.save(MarketplaceOrderLine, lines);
    });

    await this.reserveStock(tenantId, ds, platformOrderId, raw);

    return true;
  }

  /** Ticimax siparişi için stok CIKIS hareketi oluşturur */
  private async reserveStock(
    tenantId: string,
    ds: DataSource,
    platformOrderId: string,
    raw: TicimaxOrder,
  ): Promise<void> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const order = await orderRepo.findOne({
      where: { tenantId, platform: 'TICIMAX' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (!order) return;

    for (const item of raw.OrderDetails) {
      const product = await ds.query<[{ id: string; warehouse_id: string }?]>(
        `SELECT p.id, w.id AS warehouse_id
         FROM products p
         JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_active = true
         WHERE p.tenant_id = $1 AND p.sku = $2
         LIMIT 1`,
        [tenantId, item.ProductCode],
      );

      if (!product[0]) {
        this.logger.warn(
          `Ticimax ürün stok eşleşmedi: kod=${item.ProductCode}, sipariş=${raw.OrderNo}`,
        );
        continue;
      }

      try {
        await this.movementService.create({
          productId:     product[0].id,
          warehouseId:   product[0].warehouse_id,
          type:          'CIKIS' as MovementType,
          quantity:      item.Quantity,
          referenceType: 'MARKETPLACE_ORDER',
          referenceId:   order.id,
          notes:         `Ticimax sipariş: ${raw.OrderNo}`,
        } as Parameters<typeof this.movementService.create>[0]);
      } catch (err) {
        this.logger.error(
          `Ticimax stok rezervasyonu başarısız: kod=${item.ProductCode} — ${String(err)}`,
        );
      }
    }
  }
}

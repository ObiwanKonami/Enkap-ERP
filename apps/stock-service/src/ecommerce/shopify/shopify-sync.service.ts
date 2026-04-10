import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { ShopifyClient, type ShopifyOrder } from './shopify.client';
import { CredentialEncryptionService } from '../../marketplace/credential-encryption.service';
import { EcommerceIntegration, EcommercePlatform } from '../entities/ecommerce-integration.entity';
import { MarketplaceOrder } from '../../marketplace/entities/marketplace-order.entity';
import { MarketplaceOrderLine } from '../../marketplace/entities/marketplace-order-line.entity';
import { StockMovementService } from '../../movement/stock-movement.service';
import type { MovementType } from '../../movement/entities/stock-movement.entity';
import { type SyncResult, emptySyncResult } from '../dto/sync-result.dto';

/** Shopify finansal durum → iç sipariş durumu eşlemesi */
const FINANCIAL_STATUS_MAP: Record<string, MarketplaceOrder['status']> = {
  pending:            'NEW',
  authorized:         'PICKING',
  partially_paid:     'PICKING',
  paid:               'PICKING',
  partially_refunded: 'DELIVERED',
  refunded:           'RETURNED',
  voided:             'CANCELLED',
};

/**
 * Shopify Senkronizasyon Servisi.
 *
 * Özellikler:
 *  - Cursor-based pagination (Link header → rel="next")
 *  - Variant bazlı stok güncelleme (inventory_item_id + location_id)
 *  - İdempotent sipariş aktarımı (platformOrderId unique constraint)
 *  - İlk konum (primary location) otomatik bulunur
 */
@Injectable()
export class ShopifySyncService {
  private readonly logger = new Logger(ShopifySyncService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly shopifyClient: ShopifyClient,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly movementService: StockMovementService,
  ) {}

  /**
   * Shopify ürün varyantlarını ERP stoğuyla senkronize eder.
   * Tüm varyantlar için SKU eşlemesi yapılır; bulunamamışlar atlanır.
   */
  async syncProducts(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.SHOPIFY);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      access_token: decrypted['access_token'] ?? '',
      shop_domain:  decrypted['shop_domain']  ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    // İlk aktif Shopify konumunu al (stok güncelleme için gerekli)
    const locationId = await this.shopifyClient.getPrimaryLocationId(creds);
    if (!locationId) {
      result.errors.push('Shopify aktif konum bulunamadı — stok güncellemesi yapılamadı');
      this.logger.warn(`Shopify konum bulunamadı: entegrasyon=${integration.name}`);
      return result;
    }

    // Cursor-based pagination
    let nextPageInfo: string | null | undefined = undefined;

    do {
      const page = await this.shopifyClient.getProducts(
        creds,
        nextPageInfo ?? undefined,
      );

      for (const product of page.items) {
        for (const variant of product.variants) {
          if (!variant.sku) continue;

          try {
            // SKU ile ERP stok miktarını bul
            const erpProduct = await ds.query<[{ id: string; quantity: number }?]>(
              `SELECT p.id, COALESCE(
                 (SELECT SUM(CASE WHEN sm.type IN ('GIRIS','IADE_GIRIS') THEN sm.quantity ELSE -sm.quantity END)
                  FROM stock_movements sm WHERE sm.product_id = p.id), 0
               ) AS quantity
               FROM products p
               WHERE p.tenant_id = $1 AND p.sku = $2
               LIMIT 1`,
              [integration.tenantId, variant.sku],
            );

            if (!erpProduct[0]) continue;

            const netStock = Math.max(0, erpProduct[0].quantity);

            if (netStock !== variant.inventory_quantity) {
              await this.shopifyClient.updateInventory(
                creds,
                variant.inventory_item_id,
                locationId,
                netStock,
              );
              result.stock_updated++;
            }

            result.products_synced++;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            result.errors.push(`Shopify stok hatası (sku=${variant.sku}): ${message}`);
            this.logger.warn(`Shopify variant stok hatası: ${message}`);
          }
        }
      }

      nextPageInfo = page.nextPageInfo;
    } while (nextPageInfo);

    this.logger.log(
      `Shopify ürün sync: ${result.products_synced} variant, ${result.stock_updated} stok güncelleme`,
    );

    return result;
  }

  /**
   * Shopify siparişlerini ERP'ye aktarır.
   * Cursor-based pagination ile tüm siparişler taranır.
   */
  async syncOrders(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.SHOPIFY);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      access_token: decrypted['access_token'] ?? '',
      shop_domain:  decrypted['shop_domain']  ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    // İlk senkronizasyonda 30 gün öncesine bak; sonrakilerde 5 dk örtüşme
    const createdAtMin = integration.syncSince
      ? new Date(integration.syncSince.getTime() - 5 * 60_000)
      : new Date(Date.now() - 30 * 24 * 60 * 60_000);

    let nextPageInfo: string | null | undefined = undefined;

    do {
      const page = await this.shopifyClient.getOrders(
        creds,
        createdAtMin,
        nextPageInfo ?? undefined,
      );

      for (const order of page.items) {
        try {
          const isNew = await this.upsertOrder(integration.tenantId, ds, order);
          if (isNew) result.orders_imported++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Shopify sipariş hatası (${order.name}): ${message}`);
          this.logger.error(`Shopify sipariş kayıt hatası: ${message}`);
        }
      }

      nextPageInfo = page.nextPageInfo;
    } while (nextPageInfo);

    // sync_since güncelle
    const integrationRepo = ds.getRepository(EcommerceIntegration);
    await integrationRepo.update(integration.id, { syncSince: new Date() });

    this.logger.log(
      `Shopify sipariş sync: ${result.orders_imported} yeni sipariş aktarıldı`,
    );

    return result;
  }

  /** Sipariş kaydeder veya mevcut durumu günceller (idempotent) */
  private async upsertOrder(tenantId: string, ds: DataSource, raw: ShopifyOrder): Promise<boolean> {
    const platformOrderId = String(raw.id);
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const existing = await orderRepo.findOne({
      where: { tenantId, platform: 'SHOPIFY' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (existing) {
      const newStatus = FINANCIAL_STATUS_MAP[raw.financial_status] ?? 'NEW';
      if (existing.status !== newStatus) {
        await orderRepo.update(existing.id, { status: newStatus });
      }
      return false;
    }

    await ds.transaction(async (manager) => {
      const totalKurus = Math.round(parseFloat(raw.total_price) * 100);
      const customerName = raw.customer
        ? `${raw.customer.first_name} ${raw.customer.last_name}`.trim()
        : null;

      const order = manager.create(MarketplaceOrder, {
        tenantId,
        platform:         'SHOPIFY' as MarketplaceOrder['platform'],
        platformOrderId,
        platformOrderNo:  raw.name,
        status:           FINANCIAL_STATUS_MAP[raw.financial_status] ?? 'NEW',
        customerName,
        cargoTrackingNo:  null,
        grossAmountKurus: totalKurus,
        orderedAt:        new Date(raw.created_at),
        rawPayload:       raw as unknown as Record<string, unknown>,
      });

      const saved = await manager.save(MarketplaceOrder, order);

      const lines = raw.line_items.map((item) =>
        manager.create(MarketplaceOrderLine, {
          tenantId,
          orderId:         saved.id,
          platformLineId:  String(item.id),
          platformSku:     item.sku || '',
          platformBarcode: null,
          productName:     item.title,
          quantity:        item.quantity,
          unitPriceKurus:  Math.round(parseFloat(item.price) * 100),
          commissionKurus: 0,
        }),
      );

      await manager.save(MarketplaceOrderLine, lines);
    });

    // İptal/iade edilmemiş siparişler için stok rezervasyonu
    if (raw.financial_status !== 'voided' && raw.financial_status !== 'refunded') {
      await this.reserveStock(tenantId, ds, platformOrderId, raw);
    }

    return true;
  }

  /** Shopify siparişi için stok CIKIS hareketi oluşturur */
  private async reserveStock(
    tenantId: string,
    ds: DataSource,
    platformOrderId: string,
    raw: ShopifyOrder,
  ): Promise<void> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const order = await orderRepo.findOne({
      where: { tenantId, platform: 'SHOPIFY' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (!order) return;

    for (const item of raw.line_items) {
      if (!item.sku) continue;

      const product = await ds.query<[{ id: string; warehouse_id: string }?]>(
        `SELECT p.id, w.id AS warehouse_id
         FROM products p
         JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_active = true
         WHERE p.tenant_id = $1 AND p.sku = $2
         LIMIT 1`,
        [tenantId, item.sku],
      );

      if (!product[0]) {
        this.logger.warn(
          `Shopify SKU stok eşleşmedi: sku=${item.sku}, sipariş=${raw.name}`,
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
          notes:         `Shopify sipariş: ${raw.name}`,
        } as Parameters<typeof this.movementService.create>[0]);
      } catch (err) {
        this.logger.error(
          `Shopify stok rezervasyonu başarısız: sku=${item.sku} — ${String(err)}`,
        );
      }
    }
  }
}

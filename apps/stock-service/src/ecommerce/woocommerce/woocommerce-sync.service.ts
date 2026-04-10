import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { WooCommerceClient, type WooOrder } from './woocommerce.client';
import { CredentialEncryptionService } from '../../marketplace/credential-encryption.service';
import { EcommerceIntegration, EcommercePlatform } from '../entities/ecommerce-integration.entity';
import { MarketplaceOrder } from '../../marketplace/entities/marketplace-order.entity';
import { MarketplaceOrderLine } from '../../marketplace/entities/marketplace-order-line.entity';
import { StockMovementService } from '../../movement/stock-movement.service';
import type { MovementType } from '../../movement/entities/stock-movement.entity';
import { type SyncResult, emptySyncResult } from '../dto/sync-result.dto';

/** WooCommerce sipariş durumu → iç durum eşlemesi */
const STATUS_MAP: Record<string, MarketplaceOrder['status']> = {
  pending:    'NEW',
  processing: 'PICKING',
  'on-hold':  'NEW',
  completed:  'DELIVERED',
  cancelled:  'CANCELLED',
  refunded:   'RETURNED',
  failed:     'CANCELLED',
};

/**
 * WooCommerce Senkronizasyon Servisi.
 *
 * Akış (her 30 dakikada bir tetiklenir):
 *  1. EcommerceService credential'ları çözerek bu servisi çağırır
 *  2. Ürün senkronu: ERP stok → WooCommerce stock_quantity (tek yönlü)
 *  3. Sipariş senkronu: sync_since tarihinden itibaren yeni siparişleri çek
 *  4. Her yeni sipariş için stok CIKIS hareketi oluştur (idempotent)
 */
@Injectable()
export class WooCommerceSyncService {
  private readonly logger = new Logger(WooCommerceSyncService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly wooClient: WooCommerceClient,
    private readonly credentialEncryption: CredentialEncryptionService,
    private readonly movementService: StockMovementService,
  ) {}

  /**
   * Ürün ve stok bilgilerini WooCommerce'e senkronize eder.
   * ERP → platform tek yönlü: ERP kayıtlı stok miktarı WooCommerce'e yazılır.
   */
  async syncProducts(integration: EcommerceIntegration): Promise<SyncResult> {
    const result = emptySyncResult(EcommercePlatform.WOOCOMMERCE);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      store_url:       integration.storeUrl,
      consumer_key:    decrypted['consumer_key']    ?? '',
      consumer_secret: decrypted['consumer_secret'] ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    let page    = 1;
    const perPage = 100;

    // Tüm WooCommerce ürünlerini sayfalayarak çek
    while (true) {
      const wooProducts = await this.wooClient.getProducts(creds, page, perPage);

      if (wooProducts.length === 0) break;

      for (const wooProduct of wooProducts) {
        if (!wooProduct.sku || !wooProduct.manage_stock) {
          // SKU olmayan veya stok yönetimi kapalı ürünler atlanır
          continue;
        }

        try {
          // SKU ile iç ürünü bul
          const erpProduct = await ds.query<[{ id: string; quantity: number }?]>(
            `SELECT p.id, COALESCE(SUM(sm.quantity), 0) AS quantity
             FROM products p
             LEFT JOIN stock_movements sm ON sm.product_id = p.id
               AND sm.type IN ('GIRIS', 'IADE_GIRIS')
             WHERE p.tenant_id = $1 AND p.sku = $2
             GROUP BY p.id
             LIMIT 1`,
            [integration.tenantId, wooProduct.sku],
          );

          if (!erpProduct[0]) {
            this.logger.debug(
              `WooCommerce SKU eşleşmedi: sku=${wooProduct.sku}, entegrasyon=${integration.name}`,
            );
            continue;
          }

          // ERP net stok miktarını hesapla ve WooCommerce'e yaz
          const netStock = Math.max(0, erpProduct[0].quantity);
          if (netStock !== wooProduct.stock_quantity) {
            await this.wooClient.updateProductStock(creds, wooProduct.id, netStock);
            result.stock_updated++;
          }

          result.products_synced++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`WooCommerce ürün stok hatası (sku=${wooProduct.sku}): ${message}`);
          this.logger.warn(`WooCommerce stok güncelleme hatası: ${message}`);
        }
      }

      if (wooProducts.length < perPage) break;
      page++;
    }

    this.logger.log(
      `WooCommerce ürün sync: ${result.products_synced} ürün, ${result.stock_updated} stok güncelleme`,
    );

    return result;
  }

  /**
   * WooCommerce'den yeni siparişleri ERP'ye aktarır.
   * sync_since tarihinden itibaren getirir; ilk çalışmada 30 gün öncesine bakılır.
   */
  async syncOrders(integration: EcommerceIntegration): Promise<SyncResult> {
    const result    = emptySyncResult(EcommercePlatform.WOOCOMMERCE);
    const decrypted = this.credentialEncryption.decrypt(integration.credentials);

    const creds = {
      store_url:       integration.storeUrl,
      consumer_key:    decrypted['consumer_key']    ?? '',
      consumer_secret: decrypted['consumer_secret'] ?? '',
    };

    const ds = await this.dsManager.getDataSource(integration.tenantId);

    // İlk senkronizasyonda 30 gün öncesine bak
    const after = integration.syncSince
      ? new Date(integration.syncSince.getTime() - 5 * 60_000) // 5 dk örtüşme (idempotent)
      : new Date(Date.now() - 30 * 24 * 60 * 60_000);

    let page = 1;

    while (true) {
      const orders = await this.wooClient.getOrders(creds, after, page);

      if (orders.length === 0) break;

      for (const order of orders) {
        try {
          const isNew = await this.upsertOrder(integration.tenantId, ds, order);
          if (isNew) result.orders_imported++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push(`Sipariş aktarım hatası (no=${order.number}): ${message}`);
          this.logger.error(`WooCommerce sipariş kayıt hatası: ${message}`);
        }
      }

      if (orders.length < 50) break;
      page++;
    }

    // sync_since'ı şimdi güncelle (bir sonraki çalışmada bu noktadan devam et)
    const integrationRepo = ds.getRepository(EcommerceIntegration);
    await integrationRepo.update(integration.id, {
      syncSince: new Date(),
    });

    this.logger.log(
      `WooCommerce sipariş sync: ${result.orders_imported} yeni sipariş içe aktarıldı`,
    );

    return result;
  }

  /**
   * Tek siparişi idempotent olarak kaydeder.
   * @returns true → yeni sipariş kaydedildi, false → mevcut güncellendi
   */
  private async upsertOrder(tenantId: string, ds: DataSource, raw: WooOrder): Promise<boolean> {
    const platformOrderId = String(raw.id);
    const orderRepo = ds.getRepository(MarketplaceOrder);

    // Daha önce kaydedildi mi? (external_order_id unique)
    const existing = await orderRepo.findOne({
      where: { tenantId, platform: 'WOOCOMMERCE' as MarketplaceOrder['platform'], platformOrderId },
    });

    if (existing) {
      // Sadece durum güncelle
      const newStatus = STATUS_MAP[raw.status] ?? 'NEW';
      if (existing.status !== newStatus) {
        await orderRepo.update(existing.id, { status: newStatus });
      }
      return false;
    }

    // Yeni sipariş → transaction içinde kaydet
    await ds.transaction(async (manager) => {
      const totalKurus = Math.round(parseFloat(raw.total) * 100);

      const order = manager.create(MarketplaceOrder, {
        tenantId,
        platform:         'WOOCOMMERCE' as MarketplaceOrder['platform'],
        platformOrderId,
        platformOrderNo:  raw.number,
        status:           STATUS_MAP[raw.status] ?? 'NEW',
        customerName:     `${raw.billing.first_name} ${raw.billing.last_name}`.trim(),
        cargoTrackingNo:  null,
        grossAmountKurus: totalKurus,
        orderedAt:        new Date(raw.date_created),
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
          productName:     item.name,
          quantity:        item.quantity,
          unitPriceKurus:  Math.round(parseFloat(item.price) * 100),
          commissionKurus: 0,
        }),
      );

      await manager.save(MarketplaceOrderLine, lines);
    });

    // İptal dışındaki siparişler için stok CIKIS hareketi oluştur
    if (raw.status !== 'cancelled' && raw.status !== 'refunded') {
      await this.reserveStock(tenantId, ds, platformOrderId, raw);
    }

    return true;
  }

  /**
   * Sipariş için stok CIKIS hareketi oluşturur.
   * SKU ile iç ürün eşleşmezse uyarı loglanır, diğer kalemler etkilenmez.
   */
  private async reserveStock(
    tenantId: string,
    ds: DataSource,
    platformOrderId: string,
    raw: WooOrder,
  ): Promise<void> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const order = await orderRepo.findOne({
      where: { tenantId, platform: 'WOOCOMMERCE' as MarketplaceOrder['platform'], platformOrderId },
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
          `WooCommerce SKU stok eşleşmedi: sku=${item.sku}, sipariş=${raw.number}`,
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
          notes:         `WooCommerce sipariş: ${raw.number}`,
        } as Parameters<typeof this.movementService.create>[0]);
      } catch (err) {
        this.logger.error(
          `WooCommerce stok rezervasyonu başarısız: sku=${item.sku} — ${String(err)}`,
        );
      }
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { HepsiburadaClient, type HepsiburadaOrder } from './hepsiburada.client';
import { MarketplaceIntegration } from '../entities/marketplace-integration.entity';
import { MarketplaceOrder } from '../entities/marketplace-order.entity';
import { MarketplaceOrderLine } from '../entities/marketplace-order-line.entity';
import { StockMovementService } from '../../movement/stock-movement.service';
import type { MovementType } from '../../movement/entities/stock-movement.entity';

const STATUS_MAP: Record<string, MarketplaceOrder['status']> = {
  WaitingForPicking: 'NEW',
  Picking:           'PICKING',
  Shipped:           'SHIPPED',
  Delivered:         'DELIVERED',
  Cancelled:         'CANCELLED',
  Returned:          'RETURNED',
};

/**
 * Hepsiburada Sipariş Senkronizasyon Servisi.
 *
 * Akış (her 15 dakikada bir):
 *  1. Aktif Hepsiburada entegrasyonunu çek
 *  2. WaitingForPicking siparişlerini çek (son sync tarihinden itibaren)
 *  3. Yeni siparişleri kaydet + stok rezervasyonu yap
 *  4. last_sync_at güncelle
 */
@Injectable()
export class HepsiburadaSyncService {
  private readonly logger = new Logger(HepsiburadaSyncService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly hbClient: HepsiburadaClient,
    private readonly movementService: StockMovementService,
  ) {}

  async syncForTenant(tenantId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(MarketplaceIntegration);

    const integration = await integrationRepo.findOne({
      where: { tenantId, platform: 'HEPSIBURADA', isActive: true },
    });

    if (!integration) return;

    try {
      const startDate = integration.lastSyncAt
        ? new Date(integration.lastSyncAt.getTime() - 5 * 60_000)
        : new Date(Date.now() - 24 * 60 * 60_000);

      // TODO: Vault'tan şifreli credentials decrypt et
      const credentials = integration.credentialsEnc as {
        username: string;
        password: string;
        merchantId: string;
      };

      const rawOrders = await this.hbClient.getOrders(
        credentials,
        'WaitingForPicking',
        startDate,
      );

      this.logger.log(
        `Hepsiburada sync: tenant=${tenantId}, ${rawOrders.length} sipariş`,
      );

      let newCount = 0;
      for (const raw of rawOrders) {
        const isNew = await this.upsertOrder(tenantId, ds, raw);
        if (isNew) newCount++;
      }

      this.logger.log(
        `Hepsiburada sync tamamlandı: ${newCount} yeni sipariş`,
      );

      await integrationRepo.update(integration.id, {
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Hepsiburada sync hatası: tenant=${tenantId} — ${message}`);

      await integrationRepo.update(integration.id, {
        lastSyncError: message,
      });
    }
  }

  private async upsertOrder(
    tenantId: string,
    ds: DataSource,
    raw: HepsiburadaOrder,
  ): Promise<boolean> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const existing = await orderRepo.findOne({
      where: { tenantId, platform: 'HEPSIBURADA', platformOrderId: raw.orderId },
    });

    if (existing) {
      const newStatus = STATUS_MAP[raw.status] ?? 'NEW';
      if (existing.status !== newStatus) {
        await orderRepo.update(existing.id, { status: newStatus });
      }
      return false;
    }

    await ds.transaction(async (manager) => {
      const order = manager.create(MarketplaceOrder, {
        tenantId,
        platform:         'HEPSIBURADA',
        platformOrderId:  raw.orderId,
        platformOrderNo:  raw.orderNumber,
        status:           STATUS_MAP[raw.status] ?? 'NEW',
        customerName:     raw.invoiceRecipientTitle,
        cargoTrackingNo:  raw.cargoTrackingNumber,
        grossAmountKurus: Math.round(raw.totalPrice * 100),
        orderedAt:        new Date(raw.orderDate),
        rawPayload:       raw as unknown as Record<string, unknown>,
      });

      const saved = await manager.save(MarketplaceOrder, order);

      const lines = raw.lineItems.map((l) =>
        manager.create(MarketplaceOrderLine, {
          tenantId,
          orderId:        saved.id,
          platformLineId: l.lineItemId,
          platformSku:    l.merchantSku,
          productName:    l.productName,
          quantity:       l.quantity,
          unitPriceKurus: Math.round(l.unitPrice * 100),
          // Komisyon tutarı: birim fiyat × komisyon oranı
          commissionKurus: Math.round(l.unitPrice * l.commissionRate * l.quantity * 100),
        }),
      );

      await manager.save(MarketplaceOrderLine, lines);
    });

    if (raw.status !== 'Cancelled') {
      await this.reserveStock(tenantId, ds, raw);
    }

    return true;
  }

  private async reserveStock(
    tenantId: string,
    ds: DataSource,
    raw: HepsiburadaOrder,
  ): Promise<void> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const order = await orderRepo.findOne({
      where: { tenantId, platform: 'HEPSIBURADA', platformOrderId: raw.orderId },
    });

    if (!order) return;

    for (const line of raw.lineItems) {
      const product = await ds.query<[{ id: string; warehouse_id: string }?]>(
        `SELECT p.id, w.id AS warehouse_id
         FROM products p
         JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_active = true
         WHERE p.tenant_id = $1 AND p.sku = $2
         LIMIT 1`,
        [tenantId, line.merchantSku],
      );

      if (!product[0]) {
        this.logger.warn(
          `Hepsiburada SKU eşleşmedi: sku=${line.merchantSku}, sipariş=${raw.orderNumber}`,
        );
        continue;
      }

      try {
        await this.movementService.create({
          productId:     product[0].id,
          warehouseId:   product[0].warehouse_id,
          type:          'CIKIS' as MovementType,
          quantity:      line.quantity,
          referenceType: 'MARKETPLACE_ORDER',
          referenceId:   order.id,
          notes:         `Hepsiburada sipariş: ${raw.orderNumber}`,
        } as Parameters<typeof this.movementService.create>[0]);
      } catch (err) {
        this.logger.error(
          `Stok rezervasyonu başarısız: sku=${line.merchantSku} — ${String(err)}`,
        );
      }
    }
  }
}

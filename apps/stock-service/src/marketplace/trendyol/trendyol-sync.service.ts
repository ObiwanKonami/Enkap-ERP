import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { TrendyolClient, type TrendyolOrder } from './trendyol.client';
import { CredentialEncryptionService } from '../credential-encryption.service';
import { MarketplaceIntegration } from '../entities/marketplace-integration.entity';
import { MarketplaceOrder } from '../entities/marketplace-order.entity';
import { MarketplaceOrderLine } from '../entities/marketplace-order-line.entity';
import { StockMovementService } from '../../movement/stock-movement.service';
import type { MovementType } from '../../movement/entities/stock-movement.entity';

/** Trendyol status → iç durum eşlemesi */
const STATUS_MAP: Record<string, MarketplaceOrder['status']> = {
  Created:   'NEW',
  Picking:   'PICKING',
  Invoiced:  'PICKING',
  Shipped:   'SHIPPED',
  Delivered: 'DELIVERED',
  Cancelled: 'CANCELLED',
};

/**
 * Trendyol Sipariş Senkronizasyon Servisi.
 *
 * Akış (her 15 dakikada bir tetiklenir):
 *  1. Aktif Trendyol entegrasyonlarını çek
 *  2. Son sync tarihinden itibaren 'Created' siparişleri çek
 *  3. Yeni siparişleri kaydet (ON CONFLICT DO NOTHING → idempotent)
 *  4. Her yeni sipariş için stok CIKIS hareketi oluştur
 *  5. last_sync_at güncelle
 */
@Injectable()
export class TrendyolSyncService {
  private readonly logger = new Logger(TrendyolSyncService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly trendyolClient: TrendyolClient,
    private readonly movementService: StockMovementService,
    private readonly credentialEncryption: CredentialEncryptionService,
  ) {}

  /**
   * Belirli bir tenant için Trendyol senkronizasyonu çalıştırır.
   * `tenantId` AsyncLocalStorage'a ayarlanmış olmalı (scheduler ayarlar).
   */
  async syncForTenant(tenantId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const integrationRepo = ds.getRepository(MarketplaceIntegration);

    const integration = await integrationRepo.findOne({
      where: { tenantId, platform: 'TRENDYOL', isActive: true },
    });

    if (!integration) return;

    try {
      // Son sync'ten itibaren al; ilk kez ise son 24 saate bak
      const startDate = integration.lastSyncAt
        ? new Date(integration.lastSyncAt.getTime() - 5 * 60_000) // 5 dk örtüşme (duplikat yok, idempotent)
        : new Date(Date.now() - 24 * 60 * 60_000);

      // Şifreli credentials'ı çöz (AES-256-GCM, MARKETPLACE_ENCRYPTION_KEY ile)
      const decrypted = this.credentialEncryption.decrypt(integration.credentialsEnc);
      const credentials = {
        apiKey:     decrypted['apiKey'] ?? '',
        apiSecret:  decrypted['apiSecret'] ?? '',
        supplierId: decrypted['supplierId'] ?? '',
      };

      const rawOrders = await this.trendyolClient.getNewOrders(
        credentials,
        startDate,
      );

      this.logger.log(
        `Trendyol sync: tenant=${tenantId}, ${rawOrders.length} sipariş bulundu`,
      );

      let newCount = 0;
      for (const raw of rawOrders) {
        const isNew = await this.upsertOrder(tenantId, ds, raw);
        if (isNew) newCount++;
      }

      this.logger.log(
        `Trendyol sync tamamlandı: ${newCount} yeni sipariş kaydedildi`,
      );

      await integrationRepo.update(integration.id, {
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Trendyol sync hatası: tenant=${tenantId} — ${message}`);

      await integrationRepo.update(integration.id, {
        lastSyncError: message,
      });
    }
  }

  /**
   * Tek siparişi kaydeder veya günceller.
   * @returns true → yeni sipariş (stok rezervasyonu yapıldı)
   */
  private async upsertOrder(
    tenantId: string,
    ds: DataSource,
    raw: TrendyolOrder,
  ): Promise<boolean> {
    const platformOrderId = String(raw.orderId);
    const orderRepo = ds.getRepository(MarketplaceOrder);

    // Daha önce kaydedildi mi?
    const existing = await orderRepo.findOne({
      where: { tenantId, platform: 'TRENDYOL', platformOrderId },
    });

    if (existing) {
      // Sadece status güncelle
      const newStatus = STATUS_MAP[raw.status] ?? 'NEW';
      if (existing.status !== newStatus) {
        await orderRepo.update(existing.id, { status: newStatus });
      }
      return false;
    }

    // Yeni sipariş → transaction içinde kaydet + stok rezerve et
    await ds.transaction(async (manager) => {
      const order = manager.create(MarketplaceOrder, {
        tenantId,
        platform:        'TRENDYOL',
        platformOrderId,
        platformOrderNo: raw.orderNumber,
        status:          STATUS_MAP[raw.status] ?? 'NEW',
        customerName:    `${raw.customerFirstName} ${raw.customerLastName}`.trim(),
        cargoTrackingNo: raw.cargoTrackingNumber,
        // TL → kuruş dönüşümü (Math.round float hatasını önler)
        grossAmountKurus: Math.round(raw.grossAmount * 100),
        orderedAt:        new Date(raw.orderDate),
        rawPayload:       raw as unknown as Record<string, unknown>,
      });

      const saved = await manager.save(MarketplaceOrder, order);

      // Sipariş kalemlerini kaydet
      const lines = raw.lines.map((l) =>
        manager.create(MarketplaceOrderLine, {
          tenantId,
          orderId:         saved.id,
          platformLineId:  String(l.orderLineId),
          platformSku:     l.merchantSku,
          platformBarcode: l.barcode,
          productName:     l.productName,
          quantity:        l.quantity,
          unitPriceKurus:  Math.round(l.amount * 100),
          commissionKurus: Math.round(l.commission * 100),
        }),
      );

      await manager.save(MarketplaceOrderLine, lines);
    });

    // Stok rezervasyonu — iptal edilmişse yapma
    if (raw.status !== 'Cancelled') {
      await this.reserveStock(tenantId, ds, platformOrderId, raw);
    }

    return true;
  }

  /**
   * Sipariş için stok CIKIS hareketi oluşturur.
   * Barkod → iç ürün eşlemesi yapılamamışsa kalem atlanır ve uyarı loglanır.
   */
  private async reserveStock(
    tenantId: string,
    ds: DataSource,
    platformOrderId: string,
    raw: TrendyolOrder,
  ): Promise<void> {
    const orderRepo = ds.getRepository(MarketplaceOrder);

    const order = await orderRepo.findOne({
      where: { tenantId, platform: 'TRENDYOL', platformOrderId },
      relations: ['lines'],
    });

    if (!order) return;

    for (const line of raw.lines) {
      // TODO: Barkod → product_id eşlemesi (marketplace_product_mappings tablosu — Faz 2A.2)
      // Şimdilik: barcode ile ürün ara
      const product = await ds.query<[{ id: string; warehouse_id: string }?]>(
        `SELECT p.id, w.id AS warehouse_id
         FROM products p
         JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_active = true
         WHERE p.tenant_id = $1 AND p.barcode = $2
         LIMIT 1`,
        [tenantId, line.barcode],
      );

      if (!product[0]) {
        this.logger.warn(
          `Trendyol barkod eşleşmedi: barcode=${line.barcode}, sipariş=${raw.orderNumber}`,
        );
        continue;
      }

      try {
        // getTenantContext() çağrısı için AsyncLocalStorage zaten dolu (scheduler set eder)
        await this.movementService.create({
          productId:    product[0].id,
          warehouseId:  product[0].warehouse_id,
          type:         'CIKIS' as MovementType,
          quantity:     line.quantity,
          referenceType: 'MARKETPLACE_ORDER',
          referenceId:  order.id,
          notes:        `Trendyol sipariş: ${raw.orderNumber}`,
        } as Parameters<typeof this.movementService.create>[0]);
      } catch (err) {
        this.logger.error(
          `Stok rezervasyonu başarısız: barcode=${line.barcode} — ${String(err)}`,
        );
      }
    }
  }
}

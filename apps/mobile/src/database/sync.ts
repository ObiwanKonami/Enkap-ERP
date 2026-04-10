import { synchronize, type SyncPullResult } from '@nozbe/watermelondb/sync';
import NetInfo from '@react-native-community/netinfo';
import { getDatabase } from './index';
import { apiClient } from '../services/auth/api-client';

/**
 * WatermelonDB Sync Motoru.
 *
 * Protokol: WatermelonDB Sync (pull + push iki aşamalı)
 *  1. PULL: Backend'den son senkronizasyondan bu yana değişen kayıtlar alınır.
 *     GET /api/v1/sync/pull?lastPulledAt={timestamp}&schemaVersion=1
 *  2. PUSH: Offline'da oluşturulan/değiştirilen kayıtlar backend'e gönderilir.
 *     POST /api/v1/sync/push?lastPulledAt={timestamp}
 *
 * Çakışma çözümü: Server wins (sunucu her zaman kazanır).
 * Neden: GİB ve muhasebe verileri sunucu tarafında doğrulanır.
 *
 * Güvenlik notu: Sync endpoint'leri TenantGuard koruması altındadır.
 * JWT başlığı apiClient interceptor'ı tarafından otomatik eklenir.
 *
 * Ağ yoksa sync atlanır — offline değişiklikler _status alanında bekler.
 */
export async function syncDatabase(): Promise<SyncResult> {
  // Ağ kontrolü
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) {
    return { success: false, reason: 'offline' };
  }

  const db = getDatabase();

  try {
    await synchronize({
      database: db,

      /**
       * PULL aşaması: Backend'den değişiklikleri al.
       * lastPulledAt: null → ilk senkronizasyon (tüm veri gelir)
       */
      pullChanges: async ({ lastPulledAt, schemaVersion, migration }) => {
        const params = new URLSearchParams({
          schemaVersion: String(schemaVersion),
          ...(lastPulledAt !== null ? { lastPulledAt: String(lastPulledAt) } : {}),
        });

        const response = await apiClient.get(`/api/v1/sync/pull?${params}`);
        const { changes, timestamp } = response.data as {
          changes: Record<string, { created: unknown[]; updated: unknown[]; deleted: string[] }>;
          timestamp: number;
        };

        return { changes, timestamp } as SyncPullResult;
      },

      /**
       * PUSH aşaması: Offline değişiklikleri backend'e gönder.
       * WatermelonDB otomatik olarak _status=created/updated/deleted kayıtları toplar.
       */
      pushChanges: async ({ changes, lastPulledAt }) => {
        await apiClient.post(`/api/v1/sync/push?lastPulledAt=${lastPulledAt}`, {
          changes,
        });
      },

      // Çakışma stratejisi: sunucu kazanır
      conflictResolver: (_table, _local, remote) => remote,

      // Yavaş sorgu uyarısı eşiği
      _unsafeBatchPerCollection: true,
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Sync] Hata:', message);
    return { success: false, reason: message };
  }
}

export interface SyncResult {
  success: boolean;
  reason?: string;
}

/**
 * Tek tablo için hafif pull (dashboard için ürün listesi güncelleme vb.)
 * Tam senkronizasyon yerine kullanılır.
 */
export async function quickPullProducts(): Promise<void> {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected) return;

  try {
    const response = await apiClient.get('/api/v1/products?limit=500&isActive=true');
    const products: Array<Record<string, unknown>> = response.data.data ?? [];

    const db = getDatabase();
    await db.write(async () => {
      const productCollection = db.get('products');
      const existing = await productCollection.query().fetch();
      const existingMap = new Map(existing.map((p) => [(p as unknown as { serverId: string }).serverId, p]));

      await db.batch(
        ...products.map((serverProduct) => {
          const serverId = serverProduct['id'] as string;
          const local = existingMap.get(serverId);

          if (local) {
            return local.prepareUpdate((record: unknown) => {
              const r = record as Record<string, unknown>;
              r['totalStockQty'] = serverProduct['totalStockQty'];
              r['listPriceKurus'] = serverProduct['listPriceKurus'];
              r['updatedAt'] = Date.now();
            });
          }

          return productCollection.prepareCreate((record: unknown) => {
            const r = record as Record<string, unknown>;
            r['serverId'] = serverId;
            r['sku'] = serverProduct['sku'];
            r['name'] = serverProduct['name'];
            r['barcode'] = serverProduct['barcode'] ?? null;
            r['unitCode'] = serverProduct['unitCode'];
            r['kdvRate'] = serverProduct['kdvRate'];
            r['listPriceKurus'] = serverProduct['listPriceKurus'];
            r['totalStockQty'] = serverProduct['totalStockQty'];
            r['reorderPoint'] = serverProduct['reorderPoint'];
            r['isActive'] = serverProduct['isActive'];
            r['categoryName'] = (serverProduct['category'] as Record<string, unknown> | undefined)?.['name'] ?? null;
            r['updatedAt'] = Date.now();
          });
        }),
      );
    });
  } catch (err) {
    console.warn('[QuickPull] Ürün güncelleme başarısız:', err);
  }
}

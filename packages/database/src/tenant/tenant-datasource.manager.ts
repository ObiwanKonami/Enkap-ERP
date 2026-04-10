import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { DataSource, DataSourceOptions, getMetadataArgsStorage } from 'typeorm';
import type { TenantRoutingRecord } from '@enkap/shared-types';
import { TenantRoutingService } from './tenant-routing.service';

/**
 * Her tenant için açık kalan bağlantı sayısını sınırla.
 * PgBouncer pool budget'ını aşmamak için kritik.
 */
const MAX_POOL_SIZE_PER_TENANT = 5;
const MIN_POOL_SIZE_PER_TENANT = 1;

/** Boşta kalan DataSource'u kaç dakika sonra kapat */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 dakika

interface DataSourceEntry {
  dataSource: DataSource;
  lastUsedAt: number;
  idleTimer: NodeJS.Timeout;
}

/**
 * Tenant başına dinamik TypeORM DataSource yöneticisi.
 *
 * Her farklı tenant için ayrı bir TypeORM DataSource nesnesi
 * lazy (ilk istekte) oluşturur ve Map'te önbellekler.
 *
 * Tasarım kararları:
 * - Singleton Map: tüm servis instance'ları aynı pool'u paylaşır
 * - Lazy init: tenant ilk kez istek yaparken bağlantı açılır
 * - Idle timeout: uzun süre kullanılmayan bağlantılar kapatılır
 * - search_path kilidi: connection string'e direkt eklenir
 */
@Injectable()
export class TenantDataSourceManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantDataSourceManager.name);
  private readonly dataSourceMap = new Map<string, DataSourceEntry>();

  constructor(private readonly routingService: TenantRoutingService) {}

  /**
   * Tenant'a özgü aktif DataSource döndürür.
   *
   * İlk çağrıda bağlantıyı oluşturur; sonraki çağrılarda önbellekten verir.
   * Her çağrı idle timer'ı sıfırlar.
   */
  async getDataSource(tenantId: string): Promise<DataSource> {
    const existing = this.dataSourceMap.get(tenantId);

    if (existing?.dataSource.isInitialized) {
      this.refreshIdleTimer(tenantId, existing);
      return existing.dataSource;
    }

    return this.createDataSource(tenantId);
  }

  /**
   * Belirli bir tenant'ın DataSource'unu kapatır ve Map'ten siler.
   * Tenant deprovisioning veya tier değişikliğinde çağrılır.
   */
  async closeDataSource(tenantId: string): Promise<void> {
    const entry = this.dataSourceMap.get(tenantId);
    if (!entry) return;

    clearTimeout(entry.idleTimer);
    await entry.dataSource.destroy();
    this.dataSourceMap.delete(tenantId);

    this.logger.log(`DataSource kapatıldı: tenant=${tenantId}`);
  }

  // ─── Özel yardımcı metodlar ────────────────────────────────────────────────

  private async createDataSource(tenantId: string): Promise<DataSource> {
    const routing = await this.routingService.getRoutingRecord(tenantId);
    const options = this.buildDataSourceOptions(tenantId, routing);

    this.logger.log(
      `Yeni DataSource oluşturuluyor: tenant=${tenantId} ` +
      `cluster=${routing.clusterId} tier=${routing.tier}`,
    );

    const dataSource = new DataSource(options);
    await dataSource.initialize();

    // İlk bağlantıda search_path'i doğrula (güvenlik kontrolü)
    await this.verifySearchPath(dataSource, routing.schemaName, tenantId);

    const entry: DataSourceEntry = {
      dataSource,
      lastUsedAt: Date.now(),
      idleTimer: this.createIdleTimer(tenantId),
    };

    this.dataSourceMap.set(tenantId, entry);
    return dataSource;
  }

  private buildDataSourceOptions(
    tenantId: string,
    routing: TenantRoutingRecord,
  ): DataSourceOptions {
    const schemaName = routing.schemaName;

    return {
      type: 'postgres',
      url: routing.pgbouncerEndpoint,
      // search_path connection string'e eklenerek sürücü seviyesinde kilitlenir.
      // Uygulama katmanındaki SET search_path komutlarına gerek kalmaz.
      // PgBouncer server_reset_query bunu her connection reuse'da sıfırlar.
      connectTimeoutMS: 5_000,
      extra: {
        // node-postgres pool ayarları
        max: MAX_POOL_SIZE_PER_TENANT,
        min: MIN_POOL_SIZE_PER_TENANT,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        // search_path connection parametresi olarak — en güvenli yöntem
        options: `--search_path=${schemaName},pg_catalog`,
      },
      // Şema adını TypeORM'a söyle; tüm sorgular bu şemada çalışır
      schema: schemaName,
      // TypeORM'un global @Entity() registry'sinden tüm entity sınıflarını al.
      // Her servis kendi entity'lerini @Entity() decorator'ı ile otomatik kaydeder;
      // tenant DataSource oluşturulurken bu registry'den alınır — synchronize: false
      // olduğu için fazladan entity olması hiçbir zarara yol açmaz.
      entities: getMetadataArgsStorage()
        .tables
        .map((t) => t.target)
        .filter((t): t is Function => typeof t === 'function'),
      synchronize: false, // Asla true — migration'lar ayrı yönetilir
      logging: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      // Tenant bazlı query logging için uygulama adını ekle
      applicationName: `enkap_${tenantId.slice(0, 8)}`,
    };
  }

  /**
   * Bağlantı açıldıktan sonra search_path'in doğru şemaya işaret ettiğini
   * doğrular. Yanlış şemaya bağlanma durumunu erken yakalar.
   */
  private async verifySearchPath(
    dataSource: DataSource,
    expectedSchema: string,
    tenantId: string,
  ): Promise<void> {
    const result = await dataSource.query<[{ search_path: string }]>(
      'SHOW search_path',
    );
    const actualPath = result[0]?.search_path ?? '';

    if (!actualPath.includes(expectedSchema)) {
      // Güvenlik kritik: bağlantı yanlış şemaya gidiyor
      await dataSource.destroy();
      throw new Error(
        `[GÜVENLİK] search_path doğrulama hatası: ` +
        `tenant=${tenantId} beklenen=${expectedSchema} gerçek=${actualPath}`,
      );
    }

    this.logger.debug(
      `search_path doğrulandı: tenant=${tenantId} schema=${expectedSchema}`,
    );
  }

  private createIdleTimer(tenantId: string): NodeJS.Timeout {
    return setTimeout(async () => {
      this.logger.log(
        `Boşta kalan bağlantı kapatılıyor: tenant=${tenantId}`,
      );
      await this.closeDataSource(tenantId);
    }, IDLE_TIMEOUT_MS);
  }

  private refreshIdleTimer(tenantId: string, entry: DataSourceEntry): void {
    clearTimeout(entry.idleTimer);
    entry.lastUsedAt = Date.now();
    entry.idleTimer = this.createIdleTimer(tenantId);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Tüm tenant DataSource\'ları kapatılıyor...');

    const closePromises = Array.from(this.dataSourceMap.keys()).map(
      (tenantId) => this.closeDataSource(tenantId),
    );

    await Promise.allSettled(closePromises);
    this.logger.log('Tüm bağlantılar kapatıldı.');
  }
}

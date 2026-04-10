import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { TenantRoutingRecord } from '@enkap/shared-types';
import { TenantDataSourceManager } from '@enkap/database';
import { V001_InitialTenantSchema } from './migrations/V001_InitialTenantSchema';
import { V064_FixFleetEnums } from './migrations/V064_FixFleetEnums';
import { V065_AddTripCargoColumns } from './migrations/V065_AddTripCargoColumns';
import { V066_AddContactDistrict } from './migrations/V066_AddContactDistrict';
import { V067_AddPurchaseOrderSubtotal } from './migrations/V067_AddPurchaseOrderSubtotal';
import { V068_AddStockMovementLotSerial } from './migrations/V068_AddStockMovementLotSerial';
import { CP001_InitialControlPlane } from './migrations/CP001_InitialControlPlane';

/**
 * TypeORM migration'larını yeni tenant şemasına uygular.
 *
 * Tasarım kararları:
 * - Migration'lar `src/database/migrations/` altında raw SQL + TypeORM formatında
 * - Her migration dosyası idempotent (IF NOT EXISTS, idempotent DDL)
 * - Migration geçmişi tenant şemasının içinde `schema_version` tablosunda saklanır
 * - Hata durumunda tüm migration transaction'ı geri alınır
 */
@Injectable()
export class MigrationRunner {
  private readonly logger = new Logger(MigrationRunner.name);

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Tüm baseline migration'ları yeni tenant şemasına uygular.
   *
   * @param routing Tenant'ın veritabanı yönlendirme bilgisi
   */
  async runBaseline(routing: TenantRoutingRecord): Promise<void> {
    this.logger.log(
      `Migration başlatılıyor: tenant=${routing.tenantId} ` +
      `schema=${routing.schemaName}`,
    );

    const dataSource = await this.dataSourceManager.getDataSource(
      routing.tenantId,
    );

    await applyMigrationBatch(dataSource, BASELINE_MIGRATIONS, this.logger);

    this.logger.log(
      `Migration tamamlandı: tenant=${routing.tenantId}`,
    );
  }

  /**
   * Control plane şemasına tüm CP migration'larını uygular.
   *
   * @param dataSource Control plane DataSource (named 'control_plane')
   */
  async runControlPlane(dataSource: DataSource): Promise<void> {
    this.logger.log('Control plane migration başlatılıyor...');
    await applyMigrationBatch(dataSource, CONTROL_PLANE_MIGRATIONS, this.logger);
    this.logger.log('Control plane migration tamamlandı.');
  }
}

// ─── Saf yardımcı fonksiyonlar (NestJS DI bağımsız — CLI de kullanır) ─────────

/**
 * Verilen DataSource üzerinde schema_version tablosunu oluşturur (idempotent).
 */
export async function ensureSchemaVersion(manager: EntityManager): Promise<void> {
  await manager.query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id           SERIAL PRIMARY KEY,
      version      VARCHAR(20) NOT NULL UNIQUE,
      description  TEXT NOT NULL,
      checksum     VARCHAR(64) NOT NULL,
      applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by   VARCHAR(100) NOT NULL DEFAULT current_user,
      success      BOOLEAN NOT NULL DEFAULT true
    )
  `);
}

/**
 * Verilen migration setini idempotent olarak uygular.
 * schema_version tablosunu oluşturur, eksik olanları çalıştırır.
 */
export async function applyMigrationBatch(
  dataSource: DataSource,
  migrations: Migration[],
  logger: Logger,
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await ensureSchemaVersion(manager);

    for (const migration of migrations) {
      const rows = await manager.query<[{ count: string }]>(
        `SELECT COUNT(*) AS count FROM schema_version WHERE version = $1`,
        [migration.version],
      );
      const applied = parseInt(rows[0]?.count ?? '0', 10) > 0;

      if (applied) {
        logger.debug(`Atlanıyor (zaten uygulandı): ${migration.version}`);
        continue;
      }

      logger.log(`Uygulanıyor: ${migration.version} — ${migration.description}`);
      await manager.query(migration.sql);
      await manager.query(
        `INSERT INTO schema_version (version, description, checksum) VALUES ($1, $2, $3)`,
        [migration.version, migration.description, migration.checksum],
      );
    }
  });
}

// ─── Migration tanımları ─────────────────────────────────────────────────────

export interface Migration {
  version: string;
  description: string;
  checksum: string; // SHA-256 (production'da dosya içeriğinden hesaplanır)
  sql: string;
}

/**
 * Baseline migration seti — tüm yeni tenantlara uygulanır.
 * Sıra kritik: foreign key bağımlılıkları gözetilmiştir.
 */
export const BASELINE_MIGRATIONS: Migration[] = [
  V001_InitialTenantSchema,
  V064_FixFleetEnums,
  V065_AddTripCargoColumns,
  V066_AddContactDistrict,
  V067_AddPurchaseOrderSubtotal,
  V068_AddStockMovementLotSerial,
];

// ─── Control Plane Migration seti ────────────────────────────────────────────
//
// Bu migration'lar yalnızca control_plane şemasına uygulanır.
// Tüm platform genelindeki tablolar burada tanımlanır.
// Sıra kritik: foreign key bağımlılıkları gözetilmiştir.

export const CONTROL_PLANE_MIGRATIONS: Migration[] = [CP001_InitialControlPlane];

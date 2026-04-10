/**
 * Migration Runner CLI — Kubernetes Job entry point.
 *
 * Kullanım:
 *   node dist/provisioning/migration-runner-cli.js --target=control_plane
 *   node dist/provisioning/migration-runner-cli.js --target=tenants
 *   node dist/provisioning/migration-runner-cli.js --target=all
 *
 * NestJS bağımsız: doğrudan TypeORM DataSource kullanır.
 * K8s Job: infrastructure/kubernetes/jobs/run-migrations-job.yaml
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import {
  applyMigrationBatch,
  BASELINE_MIGRATIONS,
  CONTROL_PLANE_MIGRATIONS,
} from './migration-runner';

// ─── Ortam değişkenleri ──────────────────────────────────────────────────────

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://enkap_admin:enkap_pass@localhost:5432/enkap_control_plane';

const CONTROL_PLANE_DATABASE_URL =
  process.env.CONTROL_PLANE_DATABASE_URL ?? DATABASE_URL;

// ─── Hedef ayrıştırma ────────────────────────────────────────────────────────

type Target = 'control_plane' | 'tenants' | 'all';

function parseTarget(): Target {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  if (!arg) {
    console.error('Hata: --target=control_plane|tenants|all argümanı gerekli.');
    process.exit(1);
  }
  const value = arg.split('=')[1] as Target;
  if (!['control_plane', 'tenants', 'all'].includes(value)) {
    console.error(`Hata: geçersiz target="${value}". control_plane|tenants|all bekleniyor.`);
    process.exit(1);
  }
  return value;
}

// ─── DataSource fabrikaları ──────────────────────────────────────────────────

function makeControlPlaneDs(): DataSource {
  return new DataSource({
    type:            'postgres',
    url:             CONTROL_PLANE_DATABASE_URL,
    synchronize:     false,
    entities:        [],
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

function makeTenantDs(dbUrl: string): DataSource {
  return new DataSource({
    type:        'postgres',
    url:         dbUrl,
    synchronize: false,
    entities:    [],
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

// ─── Control plane migration ─────────────────────────────────────────────────

async function migrateControlPlane(): Promise<void> {
  const logger = new Logger('MigrationCLI:ControlPlane');
  const ds = makeControlPlaneDs();
  await ds.initialize();
  logger.log('Control plane DataSource bağlandı.');

  try {
    await applyMigrationBatch(ds, CONTROL_PLANE_MIGRATIONS, logger);
    logger.log('Control plane migration tamamlandı.');
  } finally {
    await ds.destroy();
  }
}

// ─── Tenant migration'ları ───────────────────────────────────────────────────

async function migrateAllTenants(): Promise<void> {
  const logger = new Logger('MigrationCLI:Tenants');

  // Aktif tenant listesini control_plane'den al
  const cpDs = makeControlPlaneDs();
  await cpDs.initialize();

  let tenants: Array<{ tenant_id: string; schema_name: string; pgbouncer_endpoint: string }>;
  try {
    tenants = await cpDs.query<typeof tenants>(
      `SELECT tenant_id, schema_name, pgbouncer_endpoint
       FROM tenant_routing
       WHERE status = 'active'
       ORDER BY created_at`,
    );
  } finally {
    await cpDs.destroy();
  }

  logger.log(`${tenants.length} aktif tenant bulundu.`);

  let successCount = 0;
  let failCount = 0;

  for (const tenant of tenants) {
    const tenantLogger = new Logger(`MigrationCLI:Tenant:${tenant.tenant_id}`);
    // pgbouncer_endpoint zaten tam bağlantı URL'si içerir
    const dbUrl = tenant.pgbouncer_endpoint;

    const ds = makeTenantDs(dbUrl);
    try {
      await ds.initialize();
      // search_path'i tenant şemasına çevir
      await ds.query(`SET search_path TO "${tenant.schema_name}", public`);
      await applyMigrationBatch(ds, BASELINE_MIGRATIONS, tenantLogger);
      tenantLogger.log(`Migration tamamlandı: schema=${tenant.schema_name}`);
      successCount++;
    } catch (err) {
      tenantLogger.error(
        `Migration başarısız: schema=${tenant.schema_name} — ${(err as Error).message}`,
      );
      failCount++;
      // Tek tenant başarısız olsa bile diğerlerine devam et
    } finally {
      if (ds.isInitialized) await ds.destroy();
    }
  }

  logger.log(`Tamamlandı: ${successCount} başarılı, ${failCount} başarısız.`);

  if (failCount > 0) {
    process.exit(1);
  }
}

// ─── Ana akış ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const target = parseTarget();
  console.log(`[MigrationCLI] Hedef: ${target}`);

  if (target === 'control_plane' || target === 'all') {
    await migrateControlPlane();
  }

  if (target === 'tenants' || target === 'all') {
    await migrateAllTenants();
  }
}

main().catch((err) => {
  console.error('[MigrationCLI] Beklenmeyen hata:', err);
  process.exit(1);
});

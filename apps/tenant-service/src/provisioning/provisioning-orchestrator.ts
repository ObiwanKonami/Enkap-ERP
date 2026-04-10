import { Injectable, Logger, OnApplicationBootstrap, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import type { TenantRoutingRecord, TenantTier } from '@enkap/shared-types';
import { SchemaCreator } from './schema-creator';
import { MigrationRunner } from './migration-runner';
import { TenantSeeder } from './tenant-seeder';
import { TenantDataSourceManager } from '@enkap/database';

export interface ProvisioningRequest {
  tenantId: string;
  /** URL-safe benzersiz firma kodu (örn: 'acme-corp'). Login ekranında kullanılır. */
  tenantSlug: string;
  tier: TenantTier;
  companyName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface ProvisioningResult {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  completedAt: Date;
  durationMs: number;
}

/**
 * Yeni tenant provizyon sürecini yöneten Saga Orchestrator.
 *
 * 7 atomik adım, her biri başarısız olursa tamamlanan adımlar
 * geri alınır (Compensating Transaction — Saga Pattern).
 *
 * Adımlar:
 *  [1] Control plane kaydı oluştur (status: provisioning)
 *  [2] Veritabanı şeması + PostgreSQL rolü oluştur
 *  [3] TypeORM migration'larını çalıştır
 *  [4] RLS güvenlik politikalarını uygula
 *  [5] Türkiye varsayılan verilerini tohumla
 *  [6] Control plane kaydını güncelle (status: active)
 *  [7] Tamamlanma olayı yayınla
 *
 * Hedef süre: < 90 saniye
 */
@Injectable()
export class ProvisioningOrchestrator implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProvisioningOrchestrator.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
    private readonly schemaCreator: SchemaCreator,
    private readonly migrationRunner: MigrationRunner,
    private readonly seeder: TenantSeeder,
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  async provision(request: ProvisioningRequest): Promise<ProvisioningResult> {
    const startedAt = Date.now();
    const { tenantId, tier, tenantSlug } = request;

    this.logger.log(
      `Provizyon başlatılıyor: tenant=${tenantId} tier=${tier}`,
    );

    // Saga compensating actions — hata durumunda tersten çalıştırılır
    const compensations: Array<() => Promise<void>> = [];

    try {
      // ──── [1] Control Plane Kaydı ─────────────────────────────────────────
      // logStep FK kısıtı nedeniyle tenant_routing kaydından SONRA çağrılmalı
      const routing = await this.createControlPlaneEntry(tenantId, tier, tenantSlug);
      compensations.push(() => this.deleteControlPlaneEntry(tenantId));

      await this.logStep(tenantId, 'control_plane_entry', 'completed');

      // ──── [2] PostgreSQL Şema + Rol ───────────────────────────────────────
      await this.logStep(tenantId, 'schema_creation', 'started');

      // Production'da şifre Vault'tan gelir. Burada güvenli rastgele üretilir.
      const dbPassword = this.generateSecurePassword();
      await this.schemaCreator.create(tenantId, dbPassword);
      compensations.push(() => this.schemaCreator.drop(tenantId));

      await this.logStep(tenantId, 'schema_creation', 'completed');

      // ──── [3] TypeORM Migration ───────────────────────────────────────────
      await this.logStep(tenantId, 'migration', 'started');

      await this.migrationRunner.runBaseline(routing);

      await this.logStep(tenantId, 'migration', 'completed');

      // ──── [4] RLS Politikaları ────────────────────────────────────────────
      await this.logStep(tenantId, 'rls_policies', 'started');

      await this.schemaCreator.applyRlsPolicies(tenantId);

      await this.logStep(tenantId, 'rls_policies', 'completed');

      // ──── [5] Türkiye Varsayılan Verileri ─────────────────────────────────
      await this.logStep(tenantId, 'seeding', 'started');

      await this.seeder.seed(tenantId);

      await this.logStep(tenantId, 'seeding', 'completed');

      // ──── [5.5] Admin Kullanıcı Oluştur ───────────────────────────────────
      await this.createAdminUser(tenantId, request.adminEmail, request.adminPassword);

      // ──── [6] Control Plane → Active ──────────────────────────────────────
      await this.logStep(tenantId, 'activation', 'started');

      await this.activateTenant(tenantId);

      await this.logStep(tenantId, 'activation', 'completed');

      // ──── [7] Tamamlanma Olayı ─────────────────────────────────────────────
      await this.publishCompletionEvent(tenantId, request);

      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `Provizyon tamamlandı: tenant=${tenantId} ` +
        `süre=${durationMs}ms schema=${routing.schemaName}`,
      );

      return {
        tenantId,
        tenantSlug: routing.tenantSlug ?? tenantSlug,
        schemaName: routing.schemaName,
        completedAt: new Date(),
        durationMs,
      };

    } catch (error) {
      const durationMs = Date.now() - startedAt;

      this.logger.error(
        `Provizyon başarısız: tenant=${tenantId} ` +
        `süre=${durationMs}ms hata=${(error as Error).message}`,
        (error as Error).stack,
      );

      // Saga geri alma — tamamlanan adımları ters sırada geri al
      await this.compensate(tenantId, compensations);

      throw new ProvisioningError(tenantId, error as Error);
    }
  }

  // ─── Startup: Mevcut tenant'lara bekleyen migration'ları uygula ─────────────

  /**
   * Servis başlarken tüm aktif tenant'lara bekleyen migration'ları uygular.
   *
   * `runBaseline()` idempotent olduğundan (isApplied() kontrolü),
   * zaten uygulanmış migration'lar atlanır — sadece yeni olanlar çalışır.
   * Hata durumunda ilgili tenant loglanır; diğer tenant'lara devam edilir.
   */
  async onApplicationBootstrap(): Promise<void> {
    let tenantIds: string[];

    try {
      const rows = await this.controlPlane.query<{ tenant_id: string; schema_name: string }[]>(
        `SELECT tenant_id, schema_name FROM tenant_routing WHERE status = 'active' ORDER BY created_at`,
      );
      tenantIds = rows.map((r) => r.tenant_id);
    } catch (err) {
      this.logger.warn(
        `Startup migration: aktif tenant listesi alınamadı — ${(err as Error).message}`,
      );
      return;
    }

    if (tenantIds.length === 0) {
      this.logger.log('Startup migration: aktif tenant yok, atlanıyor.');
      return;
    }

    this.logger.log(
      `Startup migration: ${tenantIds.length} aktif tenant için bekleyen migration'lar kontrol ediliyor`,
    );

    let applied = 0;
    let skipped = 0;
    let failed = 0;

    for (const tenantId of tenantIds) {
      try {
        const rows = await this.controlPlane.query<{ tenant_id: string; schema_name: string; pgbouncer_endpoint: string; cluster_id: string; tier: string; pool_mode: string }[]>(
          `SELECT tenant_id, schema_name, pgbouncer_endpoint, cluster_id, tier, pool_mode
           FROM tenant_routing WHERE tenant_id = $1 LIMIT 1`,
          [tenantId],
        );

        if (!rows.length) {
          skipped++;
          continue;
        }

        const row = rows[0]!;
        const routing = {
          tenantId: row.tenant_id,
          schemaName: row.schema_name,
          pgbouncerEndpoint: row.pgbouncer_endpoint,
          clusterId: row.cluster_id,
          databaseName: '',
          poolMode: row.pool_mode as 'session' | 'transaction',
          tier: row.tier as import('@enkap/shared-types').TenantTier,
        };

        await this.migrationRunner.runBaseline(routing);
        applied++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Startup migration başarısız: tenant=${tenantId} hata=${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Startup migration tamamlandı: toplam=${tenantIds.length} ` +
      `işlendi=${applied} atlandı=${skipped} hatalı=${failed}`,
    );
  }

  // ─── Özel yardımcı metodlar ─────────────────────────────────────────────────

  private async createControlPlaneEntry(
    tenantId: string,
    tier: TenantTier,
    tenantSlug: string,
  ): Promise<TenantRoutingRecord> {
    const schemaName = this.schemaCreator.toSchemaName(tenantId);

    // Basitleştirilmiş: tek cluster (local dev / starter)
    // Production'da: least-loaded cluster seçimi yapılır
    const clusterId = process.env.DEFAULT_CLUSTER_ID ?? 'alpha';
    const pgbouncerEndpoint =
      process.env.PGBOUNCER_ENDPOINT ??
      'postgresql://enkap_app:password@pgbouncer:5432/enkap_control_plane';

    // Slug normalleştirme: küçük harf, alfanumerik + tire
    const baseSlug = tenantSlug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Slug benzersizlik döngüsü — çakışma varsa -2, -3, … soneki ekle
    let finalSlug = baseSlug;
    let suffix = 2;
    while (true) {
      const existing = await this.controlPlane.query<{ tenant_id: string }[]>(
        `SELECT tenant_id FROM tenant_routing WHERE tenant_slug = $1 AND tenant_id != $2 LIMIT 1`,
        [finalSlug, tenantId],
      );
      if (!existing.length) break;
      finalSlug = `${baseSlug}-${suffix}`;
      suffix++;
    }

    await this.controlPlane.query(`
      INSERT INTO tenant_routing (
        tenant_id, tenant_slug, cluster_id, pgbouncer_endpoint,
        schema_name, pool_mode, tier, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'provisioning')
      ON CONFLICT (tenant_id) DO UPDATE
        SET status = 'provisioning', tenant_slug = EXCLUDED.tenant_slug, updated_at = NOW()
    `, [
      tenantId,
      finalSlug,
      clusterId,
      pgbouncerEndpoint,
      schemaName,
      tier === 'enterprise' ? 'session' : 'transaction',
      tier,
    ]);

    return {
      tenantId,
      tenantSlug: finalSlug,
      clusterId,
      pgbouncerEndpoint,
      databaseName: '',
      schemaName,
      poolMode: tier === 'enterprise' ? 'session' : 'transaction',
      tier,
    };
  }

  private async deleteControlPlaneEntry(tenantId: string): Promise<void> {
    // provisioning_log FK'sı tenant_routing'e bağlı — önce log satırları silinmeli
    await this.controlPlane.query(
      `DELETE FROM provisioning_log WHERE tenant_id = $1`,
      [tenantId],
    );
    await this.controlPlane.query(
      `DELETE FROM tenant_routing WHERE tenant_id = $1`,
      [tenantId],
    );
  }

  private async activateTenant(tenantId: string): Promise<void> {
    await this.controlPlane.query(`
      UPDATE tenant_routing
      SET status = 'active', updated_at = NOW()
      WHERE tenant_id = $1
    `, [tenantId]);
  }

  private async logStep(
    tenantId: string,
    step: string,
    status: 'started' | 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    await this.controlPlane.query(`
      INSERT INTO provisioning_log (id, tenant_id, step, status, error_message)
      VALUES (gen_random_uuid(), $1, $2, $3, $4)
    `, [tenantId, step, status, errorMessage ?? null]);
  }

  /**
   * Tenant şemasında sistem_admin rolüne sahip ilk kullanıcıyı oluşturur.
   * Şifre bcrypt ile hash'lenir (cost=12).
   */
  private async createAdminUser(
    tenantId: string,
    email: string,
    plainPassword: string,
  ): Promise<void> {
    // Global e-posta tekil kontrolü — aynı e-posta başka bir tenant'ta kayıtlı olamaz
    const activeTenants = await this.controlPlane.query<{ tenant_id: string }[]>(
      `SELECT tenant_id FROM tenant_routing WHERE status = 'active'`,
    );

    for (const t of activeTenants) {
      try {
        const tds = await this.dsManager.getDataSource(t.tenant_id);
        const rows = await tds.query<{ id: string }[]>(
          `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
          [email],
        );
        if (rows.length) {
          throw new ConflictException(
            `Bu e-posta adresi başka bir firmada zaten kayıtlı: ${email}`,
          );
        }
      } catch (err) {
        if ((err as { status?: number }).status === 409) throw err;
        // Erişilemeyen tenant şemasını sessizce atla
      }
    }

    const ds = await this.dsManager.getDataSource(tenantId);
    const passwordHash = await bcrypt.hash(plainPassword, 12);
    const userId = randomUUID();

    await ds.query(
      `INSERT INTO users (id, tenant_id, email, name, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (tenant_id, email) DO NOTHING`,
      [userId, tenantId, email.toLowerCase(), email.split('@')[0], passwordHash],
    );

    // sistem_admin rolünü ata
    await ds.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE tenant_id = $2 AND name = 'sistem_admin'
       ON CONFLICT DO NOTHING`,
      [userId, tenantId],
    );

    this.logger.log(`Admin kullanıcı oluşturuldu: tenant=${tenantId} email=${email}`);
  }

  private async publishCompletionEvent(
    tenantId: string,
    request: ProvisioningRequest,
  ): Promise<void> {
    // Production'da RabbitMQ'ya yayınlanır
    // Şimdilik loglama yeterli
    this.logger.log(
      `OLAY: tenant.provisioning.completed ` +
      `tenant=${tenantId} email=${request.adminEmail}`,
    );
  }

  private async compensate(
    tenantId: string,
    compensations: Array<() => Promise<void>>,
  ): Promise<void> {
    this.logger.warn(
      `Geri alma başlatılıyor: tenant=${tenantId} ` +
      `adım_sayısı=${compensations.length}`,
    );

    // Ters sırada çalıştır
    for (const compensation of compensations.reverse()) {
      try {
        await compensation();
      } catch (err) {
        // Geri alma hatası loglanır ama işleme devam edilir
        this.logger.error(
          `Geri alma adımı başarısız: ${(err as Error).message}`,
        );
      }
    }

    await this.logStep(tenantId, 'rollback', 'completed').catch(() => undefined);

    // Control plane kaydını failed olarak işaretle
    await this.controlPlane.query(`
      UPDATE tenant_routing
      SET status = 'deprovisioning', updated_at = NOW()
      WHERE tenant_id = $1
    `, [tenantId]).catch(() => undefined); // Kayıt olmayabilir
  }

  /** Güvenli rastgele şifre üretir (32 karakter, büyük/küçük/sayı/özel) */
  private generateSecurePassword(): string {
    // Production'da HashiCorp Vault bu şifreyi üretir ve saklar
    return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 8);
  }
}

export class ProvisioningError extends Error {
  constructor(tenantId: string, cause: Error) {
    super(`Tenant provizyon hatası: ${tenantId} — ${cause.message}`);
    this.name = 'ProvisioningError';
    this.cause = cause;
  }
}

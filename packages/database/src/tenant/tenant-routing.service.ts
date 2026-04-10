import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import type { TenantRoutingRecord } from '@enkap/shared-types';

/** Redis'te bir tenant routing kaydının yaşam süresi (saniye) */
const ROUTING_CACHE_TTL_SECONDS = 300; // 5 dakika

/** Redis anahtar şablonu: tenant:{uuid}:routing */
const routingKey = (tenantId: string) => `tenant:${tenantId}:routing`;

/** Redis anahtar şablonu: tenant:{uuid}:status */
const statusKey = (tenantId: string) => `tenant:${tenantId}:status`;

/**
 * Tenant → Veritabanı yönlendirme çözümleyicisi.
 *
 * Önbellek katmanı (Redis) → Kayıt defteri (Control Plane PostgreSQL)
 * şeklinde iki kademeli arama yapar.
 *
 * Tüm uygulama servisleri bu servisi kullanarak doğru
 * PgBouncer pool endpoint'ini bulur.
 */
@Injectable()
export class TenantRoutingService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantRoutingService.name);
  private readonly redis: Redis;

  constructor(
    /**
     * Control plane veritabanı — tenant şemalarından tamamen ayrı.
     * Bu bağlantı yalnızca tenant_routing tablosunu okur.
     */
    @InjectDataSource('control_plane')
    private readonly controlPlaneDataSource: DataSource,
  ) {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  /**
   * Tenant için yönlendirme kaydını bulur.
   *
   * Sıra: Redis önbelleği → Control Plane PostgreSQL
   *
   * @throws {TenantNotFoundException} Tenant bulunamazsa
   * @throws {TenantSuspendedException} Tenant askıya alınmışsa
   */
  async getRoutingRecord(tenantId: string): Promise<TenantRoutingRecord> {
    // 1. Redis önbelleğini kontrol et
    const cached = await this.getFromCache(tenantId);
    if (cached) {
      return cached;
    }

    // 2. Control plane veritabanından yükle
    const record = await this.queryControlPlane(tenantId);

    // 3. Redis'e yaz (sonraki istekler önbellekten gelir)
    await this.writeToCache(tenantId, record);

    return record;
  }

  /**
   * Tenant durumunu doğrular (aktif / askıya alınmış / provizyon bekliyor).
   * Redis'te ayrı bir anahtar olarak saklanır — sık kontrol edilir.
   */
  async assertTenantIsActive(tenantId: string): Promise<void> {
    const status = await this.redis.get(statusKey(tenantId));

    if (status === 'suspended') {
      throw new TenantSuspendedError(tenantId);
    }

    if (status === 'provisioning') {
      throw new TenantProvisioningError(tenantId);
    }

    // Redis'te yoksa control plane'e bak
    if (!status) {
      const record = await this.getRoutingRecord(tenantId);
      if (record.tier === undefined) {
        throw new TenantNotFoundError(tenantId);
      }
    }
  }

  /**
   * Tenant routing kaydını Redis önbelleğinden siler.
   * Provizyon veya tier değişikliği sonrası çağrılır.
   */
  async invalidateCache(tenantId: string): Promise<void> {
    await this.redis.del(routingKey(tenantId), statusKey(tenantId));
    this.logger.log(`Önbellek temizlendi: tenant=${tenantId}`);
  }

  /**
   * Aktif tüm tenant ID'lerini döner.
   *
   * Scheduled job'ların (cron) tüm tenant'lara iterasyon yapması için kullanılır.
   * Sadece `status = 'active'` tenant'lar döner.
   */
  async findAllActiveIds(): Promise<string[]> {
    const rows = await this.controlPlaneDataSource.query<{ tenant_id: string }[]>(
      `SELECT tenant_id FROM tenant_routing WHERE status = 'active' ORDER BY created_at`,
    );
    return rows.map((r) => r.tenant_id);
  }

  /**
   * Tenant'ın şirket adını döner.
   *
   * tenant_profiles tablosundan çeker — bulunamazsa tenantId döner.
   * E-posta şablonları, PDF başlıkları gibi kullanıcıya dönük içeriklerde kullanılır.
   */
  async getCompanyName(tenantId: string): Promise<string> {
    const rows = await this.controlPlaneDataSource.query<{ company_name: string }[]>(
      `SELECT company_name FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.company_name ?? tenantId;
  }

  /**
   * Belge (PDF) başlığı için şirket profil bilgilerini döner.
   *
   * Bordro pusulası, irsaliye gibi dökümanların başlığında gösterilecek
   * şirket adı, SGK no, vergi dairesi, VKN ve logo URL'ini içerir.
   */
  async getProfileForDocument(tenantId: string): Promise<{
    companyName:   string;
    sgkEmployerNo: string | null;
    taxOffice:     string | null;
    vkn:           string | null;
    logoUrl:       string | null;
  }> {
    const rows = await this.controlPlaneDataSource.query<{
      company_name:    string;
      sgk_employer_no: string | null;
      tax_office:      string | null;
      vkn:             string | null;
      logo_url:        string | null;
    }[]>(
      `SELECT company_name, sgk_employer_no, tax_office, vkn, logo_url
       FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    const row = rows[0];
    return {
      companyName:   row?.company_name    ?? tenantId,
      sgkEmployerNo: row?.sgk_employer_no ?? null,
      taxOffice:     row?.tax_office      ?? null,
      vkn:           row?.vkn             ?? null,
      logoUrl:       row?.logo_url        ?? null,
    };
  }

  // ─── Özel yardımcı metodlar ────────────────────────────────────────────────

  private async getFromCache(
    tenantId: string,
  ): Promise<TenantRoutingRecord | null> {
    const raw = await this.redis.get(routingKey(tenantId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as TenantRoutingRecord;
    } catch {
      // Bozuk önbellek kaydı — sil ve devam et
      await this.redis.del(routingKey(tenantId));
      return null;
    }
  }

  private async queryControlPlane(tenantId: string): Promise<TenantRoutingRecord> {
    const row = await this.controlPlaneDataSource.query<TenantRoutingRecord[]>(
      `SELECT
         tenant_id       AS "tenantId",
         cluster_id      AS "clusterId",
         pgbouncer_endpoint AS "pgbouncerEndpoint",
         db_name         AS "databaseName",
         schema_name     AS "schemaName",
         pool_mode       AS "poolMode",
         tier,
         status
       FROM tenant_routing
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );

    if (!row.length) {
      throw new TenantNotFoundError(tenantId);
    }

    const record = row[0]!;

    if ((record as unknown as { status: string }).status === 'suspended') {
      throw new TenantSuspendedError(tenantId);
    }

    return record;
  }

  private async writeToCache(
    tenantId: string,
    record: TenantRoutingRecord,
  ): Promise<void> {
    await this.redis.set(
      routingKey(tenantId),
      JSON.stringify(record),
      'EX',
      ROUTING_CACHE_TTL_SECONDS,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

// ─── Domain hataları ────────────────────────────────────────────────────────

export class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant bulunamadı: ${tenantId}`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantSuspendedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant askıya alındı: ${tenantId}`);
    this.name = 'TenantSuspendedError';
  }
}

export class TenantProvisioningError extends Error {
  constructor(tenantId: string) {
    super(`Tenant henüz hazır değil (provizyon devam ediyor): ${tenantId}`);
    this.name = 'TenantProvisioningError';
  }
}

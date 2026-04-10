import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';

/**
 * Tenant kullanıcı veritabanı erişim katmanı.
 *
 * İki farklı DataSource kullanır:
 *  - control_plane : tenantSlug → tenantId çözümleme
 *  - tenant DS     : kullanıcı / rol sorguları (TenantDataSourceManager ile)
 */
@Injectable()
export class UserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  /**
   * tenantSlug'ı tenant_id ve tier bilgisine çözümler.
   *
   * Giriş ekranında kullanıcı firma kodunu (slug) girer.
   * Güvenlik: slug bulunamazsa null döner — hata mesajı "firma bulunamadı"
   * değil "e-posta veya şifre hatalı" olmalıdır (bilgi sızdırmama).
   */
  async resolveTenantSlug(
    slug: string,
  ): Promise<{ tenantId: string; tenantTier: string } | null> {
    const rows = await this.controlPlane.query<
      Array<{ tenant_id: string; tier: string }>
    >(
      `SELECT tenant_id, tier
       FROM tenant_routing
       WHERE tenant_slug = $1
         AND status = 'active'
       LIMIT 1`,
      [slug.toLowerCase().trim()],
    );

    if (!rows.length) return null;

    return {
      tenantId: rows[0]!.tenant_id,
      tenantTier: rows[0]!.tier,
    };
  }

  /**
   * E-posta adresine göre kullanıcıyı tenant şemasından getirir.
   * Roller (user_roles → roles JOIN) tek sorguda alınır.
   */
  async findByEmail(
    tenantId: string,
    email: string,
  ): Promise<TenantUser | null> {
    const ds = await this.dsManager.getDataSource(tenantId);

    const rows = await ds.query<RawUserRow[]>(
      `SELECT
         u.id,
         u.tenant_id    AS "tenantId",
         u.email,
         u.name,
         u.password_hash AS "passwordHash",
         u.is_active    AS "isActive",
         COALESCE(
           json_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
           '[]'
         ) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r       ON r.id = ur.role_id
       WHERE u.tenant_id = $1
         AND lower(u.email) = lower($2)
       GROUP BY u.id`,
      [tenantId, email],
    );

    if (!rows.length) return null;

    const row = rows[0]!;
    return {
      id: row.id,
      tenantId: row.tenantId,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      isActive: row.isActive,
      emailVerified: row.emailVerified ?? false,
      roles: Array.isArray(row.roles) ? row.roles : JSON.parse(row.roles as unknown as string),
    };
  }

  /**
   * ID'ye göre kullanıcıyı getirir.
   * Refresh token rotasyonunda güncel rol/durum kontrolü için kullanılır.
   * tenantTier control_plane'den çekilir (token'da saklamaktan kaçınmak için).
   */
  async findById(
    tenantId: string,
    userId: string,
  ): Promise<TenantUserWithTier | null> {
    const [ds, tierResult] = await Promise.all([
      this.dsManager.getDataSource(tenantId),
      this.controlPlane.query<Array<{ tier: string }>>(
        `SELECT tier FROM tenant_routing WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      ),
    ]);

    const rows = await ds.query<RawUserRow[]>(
      `SELECT
         u.id,
         u.tenant_id        AS "tenantId",
         u.email,
         u.name,
         u.is_active        AS "isActive",
         u.email_verified   AS "emailVerified",
         COALESCE(
           json_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
           '[]'
         ) AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r       ON r.id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.id = $2
       GROUP BY u.id`,
      [tenantId, userId],
    );

    if (!rows.length) return null;

    const row = rows[0]!;
    const tier = (tierResult[0]?.tier ?? 'starter') as TenantTier;

    return {
      id:            row.id,
      tenantId:      row.tenantId,
      email:         row.email,
      name:          row.name,
      isActive:      row.isActive,
      emailVerified: row.emailVerified ?? false,
      roles: Array.isArray(row.roles) ? row.roles : JSON.parse(row.roles as unknown as string),
      tenantTier: tier,
    };
  }

  /**
   * Tenant slug verilmeden e-posta ile tenant'ı bulur.
   *
   * Kullanım: Giriş ekranında firma kodu girilmemişse devreye girer.
   * Eğer e-posta yalnızca bir tenant'ta varsa o tenant döner.
   * Birden fazla eşleşme veya hiç eşleşme yoksa null döner.
   *
   * Güvenlik notu: zamanlama saldırısına karşı tüm kontroller yapılır;
   * şifre doğrulaması LocalStrategy'de gerçekleşir.
   */
  async resolveTenantByEmail(
    email: string,
  ): Promise<{ tenantId: string; tenantTier: string } | null> {
    const tenants = await this.controlPlane.query<
      Array<{ tenant_id: string; tier: string; schema_name: string }>
    >(
      `SELECT tenant_id, tier, schema_name
       FROM tenant_routing
       WHERE status = 'active'`,
    );

    const matches: Array<{ tenantId: string; tenantTier: string }> = [];

    for (const t of tenants) {
      try {
        const ds = await this.dsManager.getDataSource(t.tenant_id);
        const rows = await ds.query<Array<{ id: string }>>(
          `SELECT id FROM users WHERE lower(email) = lower($1) AND is_active = true LIMIT 1`,
          [email],
        );
        if (rows.length) {
          matches.push({ tenantId: t.tenant_id, tenantTier: t.tier });
        }
      } catch {
        // Erişilemeyen tenant şemasını sessizce atla
      }
    }

    // Yalnızca tek eşleşmede otomatik giriş — birden fazla varsa kullanıcı slug girmeli
    if (matches.length === 1) return matches[0]!;
    return null;
  }

  /**
   * Kullanıcı şifresini günceller.
   * Şifre sıfırlama akışında kullanılır.
   */
  async updatePassword(tenantId: string, userId: string, passwordHash: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    await ds.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE tenant_id = $2 AND id = $3`,
      [passwordHash, tenantId, userId],
    );
  }

  /**
   * Kullanıcının e-posta adresini doğrulanmış olarak işaretler.
   * email_verified ve email_verified_at sütunlarını günceller.
   */
  async markEmailVerified(tenantId: string, userId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    await ds.query(
      `UPDATE users
       SET email_verified = true, email_verified_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, userId],
    );
  }

  /**
   * Başarılı giriş sonrası last_login_at sütununu günceller.
   * Hata durumunda sessizce geçer — login akışını engellemez.
   */
  async updateLastLogin(tenantId: string, userId: string): Promise<void> {
    try {
      const ds = await this.dsManager.getDataSource(tenantId);
      await ds.query(
        `UPDATE users SET last_login_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, userId],
      );
    } catch (err) {
      // last_login güncellemesi kritik değil — sadece logla
      this.logger.warn(
        `last_login_at güncellenemedi: userId=${userId} hata=${(err as Error).message}`,
      );
    }
  }
}

// ─── Tip tanımları ─────────────────────────────────────────────────────────

type TenantTier = 'starter' | 'business' | 'enterprise';

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  emailVerified: boolean;
  roles: string[];
}

export interface TenantUserWithTier extends Omit<TenantUser, 'passwordHash'> {
  tenantTier: TenantTier;
}

/** Ham SQL satırı (json_agg roles içeriyor) */
interface RawUserRow {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  emailVerified: boolean;
  roles: string[] | string;
}

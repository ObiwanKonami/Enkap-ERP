import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { TenantDataSourceManager } from '@enkap/database';
import { PasswordResetService } from '../auth/password-reset.service';

// ─── Tipler ───────────────────────────────────────────────────────────────────

export type MemberRole   = 'ADMIN' | 'MANAGER' | 'STAFF' | 'READONLY';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';

export interface TenantMember {
  id:           string;
  userId:       string;
  email:        string;
  name?:        string;
  role:         MemberRole;
  status:       MemberStatus;
  invitedAt?:   string;
  joinedAt?:    string;
  lastLoginAt?: string;
}

// ─── Rol Haritalama ────────────────────────────────────────────────────────────

/** Frontend rolü → tenant şemasındaki DB rol adları */
const ROLE_TO_DB: Record<MemberRole, string[]> = {
  ADMIN:    ['sistem_admin'],
  MANAGER:  ['muhasebeci', 'ik_yoneticisi', 'satin_alma', 'depo_sorumlusu', 'satis_temsilcisi'],
  STAFF:    ['satis_temsilcisi', 'depo_sorumlusu', 'satin_alma'],
  READONLY: ['salt_okunur'],
};

/** DB rol listesinden frontend rol türet */
function deriveRole(roles: string[]): MemberRole {
  if (roles.includes('sistem_admin'))                                                return 'ADMIN';
  if (roles.some(r => ['muhasebeci', 'ik_yoneticisi'].includes(r)))                 return 'MANAGER';
  if (roles.some(r => ['satis_temsilcisi', 'depo_sorumlusu', 'satin_alma'].includes(r))) return 'STAFF';
  return 'READONLY';
}

// ─── Servis ────────────────────────────────────────────────────────────────────

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
    private readonly dsManager: TenantDataSourceManager,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /** Tenant kullanıcılarını listeler */
  async list(
    tenantId: string,
    params?: { page?: number; limit?: number },
  ): Promise<{ items: TenantMember[]; total: number; page: number; limit: number }> {
    const ds = await this.dsManager.getDataSource(tenantId);

    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    // Total count query
    const countResult = await ds.query<[{ count: string }]>(`
      SELECT COUNT(DISTINCT u.id)::int AS count
      FROM users u
      WHERE u.tenant_id = $1
    `, [tenantId]);

    const total = parseInt(countResult[0]?.count ?? '0', 10);

    const rows = await ds.query<RawUserRow[]>(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.is_active     AS "isActive",
        u.last_login_at AS "lastLoginAt",
        u.created_at    AS "createdAt",
        COALESCE(
          json_agg(r.name) FILTER (WHERE r.name IS NOT NULL),
          '[]'
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r       ON r.id = ur.role_id
      WHERE u.tenant_id = $1
      GROUP BY u.id
      ORDER BY u.created_at ASC
      LIMIT $2 OFFSET $3
    `, [tenantId, limit, offset]);

    const items = rows.map(row => {
      const roleList = Array.isArray(row.roles)
        ? row.roles as string[]
        : (JSON.parse(row.roles as unknown as string) as string[]);

      const status: MemberStatus = !row.isActive
        ? 'INACTIVE'
        : !row.lastLoginAt
          ? 'PENDING'
          : 'ACTIVE';

      return {
        id:          row.id,
        userId:      row.id,
        email:       row.email,
        name:        row.name || undefined,
        role:        deriveRole(roleList),
        status,
        invitedAt:   row.createdAt  ? new Date(row.createdAt).toISOString()  : undefined,
        joinedAt:    row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : undefined,
        lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt).toISOString() : undefined,
      };
    });

    return { items, total, page, limit };
  }

  /**
   * Yeni kullanıcı davet eder.
   * Rastgele şifre ile hesap açılır; ardından şifre sıfırlama e-postası gönderilir.
   * Kullanıcı e-postadaki bağlantıdan şifresini belirleyerek ilk girişini yapar.
   */
  async invite(
    tenantId: string,
    data: { email: string; name?: string; role: MemberRole },
  ): Promise<TenantMember> {
    const ds = await this.dsManager.getDataSource(tenantId);

    // Aynı tenant içinde kayıtlı mı?
    const existing = await ds.query<{ id: string }[]>(
      `SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = lower($2) LIMIT 1`,
      [tenantId, data.email],
    );
    if (existing.length) {
      throw new ConflictException('Bu e-posta adresi zaten sistemde kayıtlı.');
    }

    // Başka bir tenant'ta kayıtlı mı? (global tekil kontrol)
    const takenElsewhere = await this.isEmailRegisteredInAnyTenant(data.email, tenantId);
    if (takenElsewhere) {
      throw new ConflictException('Bu e-posta adresi başka bir firmada zaten kayıtlı.');
    }

    // Geçici rastgele şifre — kullanıcı sıfırlama e-postasıyla değiştirecek
    const tempPassword = randomBytes(20).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    // Kullanıcıyı oluştur
    const [user] = await ds.query<{ id: string; email: string; name: string; created_at: string }[]>(`
      INSERT INTO users (id, tenant_id, email, name, password_hash, is_active)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, true)
      RETURNING id, email, name, created_at
    `, [tenantId, data.email, data.name ?? data.email, passwordHash]);

    // Rolleri ata
    const roleNames = ROLE_TO_DB[data.role];
    for (const roleName of roleNames) {
      await ds.query(`
        INSERT INTO user_roles (user_id, role_id)
        SELECT $1, r.id FROM roles r
        WHERE r.tenant_id = $2 AND r.name = $3
        ON CONFLICT DO NOTHING
      `, [user!.id, tenantId, roleName]);
    }

    this.logger.log(`Kullanıcı davet edildi: email=${data.email} tenant=${tenantId} role=${data.role}`);

    // Şifre sıfırlama e-postası gönder (kullanıcı bu e-postayla şifresini belirler)
    const tenantSlug = await this.getTenantSlug(tenantId);
    if (tenantSlug) {
      this.passwordResetService
        .requestReset(data.email, tenantSlug)
        .catch(err => this.logger.warn(`Davet e-postası gönderilemedi: ${(err as Error).message}`));
    }

    return {
      id:        user!.id,
      userId:    user!.id,
      email:     user!.email,
      name:      user!.name,
      role:      data.role,
      status:    'PENDING',
      invitedAt: new Date(user!.created_at).toISOString(),
    };
  }

  /** Kullanıcının rolünü günceller — mevcut tüm roller silinip yenisi atanır */
  async updateRole(tenantId: string, userId: string, role: MemberRole): Promise<TenantMember> {
    const ds = await this.dsManager.getDataSource(tenantId);

    const users = await ds.query<{ id: string }[]>(
      `SELECT id FROM users WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, userId],
    );
    if (!users.length) throw new NotFoundException('Kullanıcı bulunamadı.');

    // Eski rolleri temizle
    await ds.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);

    // Yeni rolleri ata
    const roleNames = ROLE_TO_DB[role];
    for (const roleName of roleNames) {
      await ds.query(`
        INSERT INTO user_roles (user_id, role_id)
        SELECT $1, r.id FROM roles r
        WHERE r.tenant_id = $2 AND r.name = $3
        ON CONFLICT DO NOTHING
      `, [userId, tenantId, roleName]);
    }

    // Güncel üye bilgisini döndür
    const result = await this.list(tenantId);
    const updated = result.items.find(m => m.id === userId);
    if (!updated) throw new NotFoundException('Kullanıcı bulunamadı.');
    return updated;
  }

  /** Kullanıcıyı pasif yapar (soft deactivate) */
  async deactivate(tenantId: string, userId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    await ds.query(
      `UPDATE users SET is_active = false, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, userId],
    );
  }

  /**
   * Verilen e-postanın başka herhangi bir aktif tenant'ta kayıtlı olup olmadığını kontrol eder.
   * excludeTenantId: zaten yukarıda kontrol edilen mevcut tenant — tekrar sorgulanmaz.
   */
  private async isEmailRegisteredInAnyTenant(
    email: string,
    excludeTenantId: string,
  ): Promise<boolean> {
    const tenants = await this.controlPlane.query<{ tenant_id: string }[]>(
      `SELECT tenant_id FROM tenant_routing WHERE status = 'active' AND tenant_id != $1`,
      [excludeTenantId],
    );

    for (const t of tenants) {
      try {
        const tds = await this.dsManager.getDataSource(t.tenant_id);
        const rows = await tds.query<{ id: string }[]>(
          `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
          [email],
        );
        if (rows.length) return true;
      } catch {
        // Erişilemeyen tenant şemasını sessizce atla
      }
    }

    return false;
  }

  /** tenantId → tenantSlug çözümleme (davet e-postası için) */
  private async getTenantSlug(tenantId: string): Promise<string | null> {
    const rows = await this.controlPlane.query<{ tenant_slug: string }[]>(
      `SELECT tenant_slug FROM tenant_routing WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
      [tenantId],
    );
    return rows[0]?.tenant_slug ?? null;
  }
}

// ─── Ham SQL satırı ────────────────────────────────────────────────────────────

interface RawUserRow {
  id:          string;
  email:       string;
  name:        string;
  isActive:    boolean;
  lastLoginAt: string | null;
  createdAt:   string;
  roles:       string[] | string;
}

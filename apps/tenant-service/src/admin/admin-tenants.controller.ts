import {
  Controller, Get, Patch, Param, Body,
  HttpCode, HttpStatus, NotFoundException, UseGuards,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformAdminGuard } from '@enkap/database';

export interface TenantListItem {
  tenantId:       string;
  tenantSlug:     string;
  tier:           string;
  status:         string;
  schemaName:     string;
  companyName:    string | null;
  city:           string | null;
  vkn:            string | null;
  onboardingDone: boolean;
  createdAt:      string;
}

export interface TenantDetail extends TenantListItem {
  email:          string | null;
  phone:          string | null;
  address:        string | null;
  invoicePrefix:  string | null;
  onboardingStep: string | null;
  provisionLog:   { step: string; status: string; createdAt: string }[];
}

/**
 * Platform Super Admin — Tenant Yönetimi
 *
 * Bu endpoint'ler yalnızca Enkap platform sahibine aittir.
 * TenantGuard kasıtlı olarak KULLANILMAZ — control_plane
 * tabloları doğrudan sorgulanır.
 *
 * Koruma: PlatformAdminGuard — `aud: 'platform-api'` taşıyan JWT zorunludur.
 * Tenant kullanıcılarının token'ları (aud: 'erp-api') bu endpoint'e giremez.
 */
@ApiTags('super-admin')
@ApiBearerAuth('JWT')
@UseGuards(PlatformAdminGuard)
@Controller('admin/tenants')
export class AdminTenantsController {
  constructor(
    @InjectDataSource('control_plane')
    private readonly db: DataSource,
  ) {}

  /** Tüm tenantları listele (routing + profil join) */
  @ApiOperation({ summary: 'Tüm tenantları listele' })
  @Get()
  async list(): Promise<{ data: TenantListItem[]; total: number }> {
    const rows = await this.db.query<TenantListItem[]>(`
      SELECT
        r.tenant_id       AS "tenantId",
        r.tenant_slug     AS "tenantSlug",
        r.tier,
        r.status,
        r.schema_name     AS "schemaName",
        p.company_name    AS "companyName",
        p.city,
        p.vkn,
        COALESCE(p.onboarding_done, false) AS "onboardingDone",
        r.created_at      AS "createdAt"
      FROM  tenant_routing r
      LEFT  JOIN tenant_profiles p ON p.tenant_id = r.tenant_id
      ORDER BY r.created_at DESC
    `);

    return { data: rows, total: rows.length };
  }

  /** Tekil tenant detayı + provizyon logu */
  @ApiOperation({ summary: 'Tenant detayı' })
  @Get(':tenantId')
  async detail(@Param('tenantId') tenantId: string): Promise<TenantDetail> {
    const rows = await this.db.query<TenantDetail[]>(`
      SELECT
        r.tenant_id       AS "tenantId",
        r.tenant_slug     AS "tenantSlug",
        r.tier,
        r.status,
        r.schema_name     AS "schemaName",
        p.company_name    AS "companyName",
        p.city,
        p.vkn,
        p.email,
        p.phone,
        p.address,
        p.invoice_prefix  AS "invoicePrefix",
        p.onboarding_step AS "onboardingStep",
        COALESCE(p.onboarding_done, false) AS "onboardingDone",
        r.created_at      AS "createdAt"
      FROM  tenant_routing r
      LEFT  JOIN tenant_profiles p ON p.tenant_id = r.tenant_id
      WHERE r.tenant_id = $1
    `, [tenantId]);

    if (!rows.length) throw new NotFoundException('Tenant bulunamadı.');

    const tenant = rows[0]!;

    // Provizyon log'unu ekle
    const log = await this.db.query<{ step: string; status: string; createdAt: string }[]>(`
      SELECT step, status, created_at AS "createdAt"
      FROM   provisioning_log
      WHERE  tenant_id = $1
      ORDER  BY created_at ASC
    `, [tenantId]);

    return { ...tenant, provisionLog: log };
  }

  /** Tenant durumunu değiştir (active ↔ suspended) */
  @ApiOperation({ summary: 'Tenant durumunu değiştir' })
  @Patch(':tenantId/status')
  @HttpCode(HttpStatus.OK)
  async changeStatus(
    @Param('tenantId') tenantId: string,
    @Body() body: { status: 'active' | 'suspended' },
  ): Promise<{ tenantId: string; status: string }> {
    if (!['active', 'suspended'].includes(body.status)) {
      throw new NotFoundException('Geçersiz durum. active veya suspended olmalı.');
    }

    const result = await this.db.query(`
      UPDATE tenant_routing
      SET    status = $1, updated_at = now()
      WHERE  tenant_id = $2
      RETURNING tenant_id, status
    `, [body.status, tenantId]);

    if (!result.length) throw new NotFoundException('Tenant bulunamadı.');
    return { tenantId: result[0].tenant_id, status: result[0].status };
  }

  /** Tenant tier değiştir */
  @ApiOperation({ summary: 'Tenant planını değiştir' })
  @Patch(':tenantId/tier')
  @HttpCode(HttpStatus.OK)
  async changeTier(
    @Param('tenantId') tenantId: string,
    @Body() body: { tier: 'starter' | 'business' | 'enterprise' },
  ): Promise<{ tenantId: string; tier: string }> {
    const result = await this.db.query(`
      UPDATE tenant_routing
      SET    tier = $1, updated_at = now()
      WHERE  tenant_id = $2
      RETURNING tenant_id, tier
    `, [body.tier, tenantId]);

    if (!result.length) throw new NotFoundException('Tenant bulunamadı.');
    return { tenantId: result[0].tenant_id, tier: result[0].tier };
  }
}

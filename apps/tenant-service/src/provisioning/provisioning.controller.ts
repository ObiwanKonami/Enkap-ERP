import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  ProvisioningOrchestrator,
  ProvisioningRequest,
} from './provisioning-orchestrator';
import { OrphanDetectionService } from './orphan-detection.service';
import { MigrationRunner } from './migration-runner';
import { TenantRoutingService } from '@enkap/database';

class ProvisionTenantDto {
  /** Tenant UUID'si */
  tenantId!: string;
  /** Kullanıcının giriş ekranında gireceği benzersiz firma kodu (örn: 'acme-corp') */
  tenantSlug!: string;
  /** Abonelik katmanı */
  tier!: 'starter' | 'business' | 'enterprise';
  /** Şirket adı */
  companyName!: string;
  /** Yönetici e-posta adresi */
  adminEmail!: string;
  /** Yönetici şifresi (plain-text — auth-service hash'ler) */
  adminPassword!: string;
}

/**
 * Tenant provizyon API'si.
 *
 * Bu endpoint yalnızca internal servislerden erişilebilir olmalıdır.
 * Production'da: Kubernetes NetworkPolicy ile dışarıdan izole edilir.
 * Auth: Service-to-service mTLS (Istio) + shared internal API key.
 */
@ApiTags('tenant')
@Controller('tenants')
export class ProvisioningController {
  constructor(
    private readonly orchestrator:      ProvisioningOrchestrator,
    private readonly orphanDetection:   OrphanDetectionService,
    private readonly migrationRunner:   MigrationRunner,
    private readonly tenantRouting:     TenantRoutingService,
  ) {}

  /**
   * Yeni tenant provizyon işlemini başlatır.
   * Ortalama tamamlanma süresi: 30-90 saniye.
   */
  @ApiOperation({ summary: '[Internal] Tenant provizyon', description: 'Yeni tenant için PostgreSQL şeması oluşturur, migrasyonları çalıştırır ve seed verisini yükler. Ortalama süre: 30-90 saniye. Sadece internal servislerden erişilebilir (Kubernetes NetworkPolicy).' })
  @ApiBody({ type: ProvisionTenantDto })
  @ApiResponse({ status: 201, description: 'Tenant başarıyla provizyon edildi.' })
  @ApiResponse({ status: 400, description: 'Zorunlu alanlar eksik.' })
  @Post('provision')
  @HttpCode(HttpStatus.CREATED)
  async provision(@Body() dto: ProvisionTenantDto) {
    if (!dto.tenantId || !dto.tenantSlug || !dto.tier || !dto.adminEmail) {
      throw new BadRequestException(
        'tenantId, tenantSlug, tier ve adminEmail zorunludur.',
      );
    }

    const request: ProvisioningRequest = {
      tenantId:      dto.tenantId,
      tenantSlug:    dto.tenantSlug,
      tier:          dto.tier,
      companyName:   dto.companyName,
      adminEmail:    dto.adminEmail,
      adminPassword: dto.adminPassword ?? 'changeme',
    };

    const result = await this.orchestrator.provision(request);

    return {
      success: true,
      tenantId: result.tenantId,
      schemaName: result.schemaName,
      completedAt: result.completedAt,
      durationMs: result.durationMs,
      message: `Tenant başarıyla oluşturuldu (${result.durationMs}ms)`,
    };
  }

  /**
   * POST /admin/tenants/run-migrations
   * Tüm aktif tenant şemalarına bekleyen migration'ları uygular.
   * Yeni eklenen migration'ları (V012 vb.) mevcut tenantlara yaymak için kullanılır.
   */
  @ApiOperation({ summary: '[Admin] Tüm tenant şemalarında migration çalıştır' })
  @ApiResponse({ status: 200, description: 'Migration sonuçları döndü.' })
  @Post('admin/run-migrations')
  @HttpCode(HttpStatus.OK)
  async runMigrationsForAll() {
    const tenantIds = await this.tenantRouting.findAllActiveIds();
    const results: { tenantId: string; status: 'ok' | 'error'; error?: string }[] = [];

    for (const tenantId of tenantIds) {
      try {
        const routing = await this.tenantRouting.getRoutingRecord(tenantId);
        await this.migrationRunner.runBaseline(routing);
        results.push({ tenantId, status: 'ok' });
      } catch (err) {
        results.push({
          tenantId,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const ok    = results.filter((r) => r.status === 'ok').length;
    const error = results.filter((r) => r.status === 'error').length;

    return { total: tenantIds.length, ok, error, results };
  }

  /** Provizyon adım günlüğünü döndürür (admin/debug amaçlı) */
  @ApiOperation({ summary: '[Admin] Provizyon günlüğü', description: 'Tenant provizyon adımlarının günlüğünü döndürür. Admin ve debug amaçlıdır.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Provizyon günlüğü döndü.' })
  @ApiResponse({ status: 404, description: 'Tenant bulunamadı.' })
  @Get(':tenantId/provisioning-log')
  async getProvisioningLog(@Param('tenantId') tenantId: string) {
    // Basitleştirilmiş — production'da veritabanından sorgulanır
    return { tenantId, message: 'Günlük sorgusu henüz implement edilmedi.' };
  }

  /**
   * GET /admin/tenants/orphaned
   * Yarı oluşturulmuş (orphan) tenant'ları listeler.
   * Kong'da bu endpoint'e sadece admin IP'lerinden erişim verilmeli.
   */
  @ApiOperation({ summary: '[Admin] Orphan tenant listesi', description: 'Son 30 dakika içinde yarım kalan (orphan) provizyon işlemlerini listeler. Kong\'da yalnızca admin IP\'lerine açık olmalıdır.' })
  @ApiResponse({ status: 200, description: 'Orphan tenant listesi döndü.', schema: { example: { count: 1, orphans: [], thresholdMinutes: 30 } } })
  @Get('admin/orphaned')
  async listOrphaned() {
    const orphans = await this.orphanDetection.findOrphanedTenants();
    return {
      count: orphans.length,
      orphans,
      thresholdMinutes: 30,
    };
  }

  /**
   * POST /admin/tenants/:tenantId/mark-failed
   * Orphan tenant'ı manuel olarak 'failed' durumuna geçirir.
   * Şema temizliği hâlâ manuel yapılmalıdır.
   */
  @ApiOperation({ summary: '[Admin] Tenant\'ı başarısız işaretle', description: 'Orphan tenant\'ı manuel olarak "failed" durumuna geçirir. PostgreSQL şema temizliği hâlâ manuel yapılmalıdır.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Tenant başarısız olarak işaretlendi.' })
  @ApiResponse({ status: 400, description: 'Tenant bulunamadı veya zaten aktif durumda.' })
  @Post('admin/:tenantId/mark-failed')
  @HttpCode(HttpStatus.OK)
  async markFailed(@Param('tenantId') tenantId: string) {
    const updated = await this.orphanDetection.markAsFailed(tenantId);
    if (updated === 0) {
      throw new BadRequestException(
        `Tenant bulunamadı veya zaten aktif durumda: ${tenantId}`,
      );
    }
    return { success: true, tenantId };
  }
}

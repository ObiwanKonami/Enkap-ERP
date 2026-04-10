import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { PlatformMetricsService } from './platform-metrics.service';
import { UsageCollectorService }  from '../usage/usage-collector.service';

/**
 * Platform yönetici dashboard API'si.
 *
 * Bu endpoint'ler platform operatörüne açık — tenant'lara değil.
 * Gerçek üretimde Kong Gateway'de ayrı bir route grubu olarak
 * yalnızca internal network'ten erişilebilir olmalı.
 *
 * Prefix: /admin
 */
@ApiTags('admin')
@ApiBearerAuth('JWT')
@Controller('admin')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.SISTEM_ADMIN)
export class PlatformMetricsController {
  constructor(
    private readonly metricsService:   PlatformMetricsService,
    private readonly collectorService: UsageCollectorService,
  ) {}

  /**
   * Platform genel bakış.
   * Bugünkü sayılar + son 30 günlük MRR/aktif tenant trendi.
   */
  @ApiOperation({ summary: 'Platform genel bakış — bugünkü sayılar ve son 30 günlük MRR trendi' })
  @ApiResponse({ status: 200, description: 'Başarılı — platform özet metrikleri' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('overview')
  getOverview() {
    return this.metricsService.getOverview();
  }

  /**
   * Özellik benimseme oranları (son 7 gün).
   * Marketplace / ML / İK / CRM kullanım yüzdesi.
   */
  @ApiOperation({ summary: 'Özellik benimseme oranları — son 7 günlük modül kullanım yüzdesi' })
  @ApiResponse({ status: 200, description: 'Başarılı — modül bazında benimseme oranları' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('feature-adoption')
  getFeatureAdoption() {
    return this.metricsService.getFeatureAdoption();
  }

  /**
   * En aktif tenant'lar (TOP-20).
   * Fatura + kullanıcı sayısına göre sıralı.
   */
  @ApiOperation({ summary: 'En aktif tenant sıralaması — fatura ve kullanıcı sayısına göre TOP-N' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Listelenecek tenant sayısı (varsayılan: 20)' })
  @ApiResponse({ status: 200, description: 'Başarılı — en aktif tenant listesi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('leaderboard')
  getLeaderboard(@Query('limit') limit?: string) {
    return this.metricsService.getLeaderboard(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Cohort analizi — kayıt ayına göre retention oranları (son 12 ay).
   */
  @ApiOperation({ summary: 'Cohort retention analizi — kayıt ayına göre son 12 aylık elde tutma oranları' })
  @ApiResponse({ status: 200, description: 'Başarılı — cohort retention matrisi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('cohort-retention')
  getCohortRetention() {
    return this.metricsService.getCohortRetention();
  }

  /**
   * Tek tenant kullanım geçmişi (son N gün).
   * Müşteri başarı ekibi için hesap sağlığı görünümü.
   */
  @ApiOperation({ summary: 'Tenant kullanım geçmişi — müşteri başarı ekibi için hesap sağlığı' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Kaç günlük geçmiş (varsayılan: 90)' })
  @ApiResponse({ status: 200, description: 'Başarılı — tenant günlük kullanım geçmişi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('tenants/:tenantId/history')
  getTenantHistory(
    @Param('tenantId') tenantId: string,
    @Query('days')     days?:    string,
  ) {
    return this.metricsService.getTenantHistory(
      tenantId,
      days ? parseInt(days, 10) : 90,
    );
  }

  /**
   * Metrik toplamayı manuel tetikle.
   * Normalde cron yapar, test/backfill için kullanılır.
   */
  @ApiOperation({ summary: 'Metrik toplamayı manuel tetikle (test/backfill için)' })
  @ApiResponse({ status: 202, description: 'Başarılı — metrik toplama arka planda başlatıldı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Post('collect-metrics')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCollection(): Promise<{ message: string }> {
    // Arka planda başlat — 1000+ tenant varsa uzun sürer
    void this.collectorService.collectAll();
    return { message: 'Metrik toplama başlatıldı (arka planda).' };
  }
}

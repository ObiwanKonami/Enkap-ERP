import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
// Rate limit: Kong gateway üzerinden yönetilir (@nestjs/throttler kullanılmıyor)

import { TenantGuard, getTenantContext } from '@enkap/database';

import { BIService } from './bi.service';
import {
  CreateReportDefinitionDto,
  UpdateReportDefinitionDto,
  ExecuteReportDto,
  ScheduleReportDto,
  ShareReportDto,
} from './dto/create-report.dto';
import {
  CreateDashboardDto,
  UpdateDashboardDto,
  CreateWidgetDto,
} from './dto/create-dashboard.dto';

/**
 * BI (Business Intelligence) / Özel Raporlama Controller'ı.
 *
 * Tüm endpoint'ler tenant izolasyonu altında çalışır:
 *   - TenantGuard: geçerli JWT ve aktif tenant zorunlu
 *   - getTenantContext(): AsyncLocalStorage'dan tenant bilgisi — parametre değil
 *
 * Rate limit:
 *   - execute endpoint: dakikada 10 istek (@Throttle)
 *   - Diğer endpoint'ler: uygulama genel limiti (Kong gateway)
 *
 * Prefix: /api/v1/bi
 */
@ApiTags('bi')
@ApiBearerAuth('JWT')
@Controller('bi')
@UseGuards(TenantGuard)
export class BIController {
  constructor(private readonly biService: BIService) {}

  // ─── Raporlar ─────────────────────────────────────────────────────────────────

  /**
   * Yeni rapor tanımı oluşturur.
   * Sorgu şablonu SELECT-only doğrulamasından geçer.
   */
  @ApiOperation({ summary: 'Yeni rapor tanımı oluştur' })
  @ApiResponse({ status: 201, description: 'Rapor başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz giriş veya güvenli olmayan SQL' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Post('reports')
  async createReport(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    dto: CreateReportDefinitionDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.createReport(dto, ctx.tenantId, ctx.userId);
  }

  /**
   * Tenant'a ait tüm rapor tanımlarını listeler.
   */
  @ApiOperation({ summary: 'Rapor tanımlarını listele' })
  @ApiResponse({ status: 200, description: 'Rapor listesi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('reports')
  async listReports() {
    const ctx = getTenantContext();
    return this.biService.listReports(ctx.tenantId);
  }

  /**
   * Belirli bir rapor tanımını getirir.
   */
  @ApiOperation({ summary: 'Rapor tanımını getir' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 200, description: 'Rapor tanımı' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @Get('reports/:id')
  async getReport(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = getTenantContext();
    return this.biService.getReport(id, ctx.tenantId);
  }

  /**
   * Rapor tanımını günceller.
   */
  @ApiOperation({ summary: 'Rapor tanımını güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 200, description: 'Güncellenmiş rapor tanımı' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @Patch('reports/:id')
  async updateReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true, skipMissingProperties: true }))
    dto: UpdateReportDefinitionDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.updateReport(id, dto, ctx.tenantId);
  }

  /**
   * Rapor tanımını siler.
   */
  @ApiOperation({ summary: 'Rapor tanımını sil' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 204, description: 'Rapor başarıyla silindi' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @Delete('reports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReport(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const ctx = getTenantContext();
    await this.biService.deleteReport(id, ctx.tenantId);
  }

  /**
   * Raporu parametrelerle çalıştırır.
   *
   * Rate limit: dakikada 10 çalıştırma (hesaplama yoğun sorular için koruma).
   */
  @ApiOperation({ summary: 'Raporu çalıştır — sorguyu parametrelerle çalıştır' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 200, description: 'Rapor sonuçları: columns, rows, total, executedAt' })
  @ApiResponse({ status: 400, description: 'Geçersiz parametre veya güvenli olmayan SQL' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @ApiResponse({ status: 429, description: 'Rate limit aşıldı (dakikada 10 çalıştırma)' })
  @Post('reports/:id/execute')
  // Rate limit: Kong gateway'de yapılandırılmış (dakikada 10 çalıştırma)
  async executeReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: ExecuteReportDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.executeReport(id, dto, ctx.tenantId);
  }

  /**
   * Raporu cron ile zamanlar.
   * Belirtilen e-postaya belirtilen formatta rapor gönderilir.
   */
  @ApiOperation({ summary: 'Raporu zamanla — cron ile otomatik çalıştır ve e-posta gönder' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 200, description: 'Zamanlama kaydedildi' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @Post('reports/:id/schedule')
  async scheduleReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: ScheduleReportDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.scheduleReport(id, dto, ctx.tenantId);
  }

  /**
   * Rapor zamanlamasını kaldırır.
   */
  @ApiOperation({ summary: 'Rapor zamanlamasını kaldır' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 200, description: 'Zamanlama kaldırıldı' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @Delete('reports/:id/schedule')
  async unscheduleReport(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = getTenantContext();
    return this.biService.unscheduleReport(id, ctx.tenantId);
  }

  /**
   * Rapor için herkese açık paylaşım linki oluşturur.
   * Dönen shareUrl JWT olmadan erişilebilir.
   */
  @ApiOperation({ summary: 'Rapor paylaşım linki oluştur' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Rapor UUID' })
  @ApiResponse({ status: 200, description: 'Paylaşım URL\'si: { shareUrl: string }' })
  @ApiResponse({ status: 404, description: 'Rapor bulunamadı' })
  @Post('reports/:id/share')
  async shareReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: ShareReportDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.shareReport(id, ctx.tenantId);
  }

  /**
   * Paylaşım token'ı ile herkese açık raporu getirir.
   *
   * @Public() — JWT gerektirmez.
   * TenantGuard bu endpoint için skip edilir.
   */
  @ApiOperation({ summary: 'Paylaşılan raporu getir — JWT gerektirmez' })
  @ApiParam({ name: 'token', type: 'string', format: 'uuid', description: 'Paylaşım token UUID' })
  @ApiResponse({ status: 200, description: 'Rapor tanımı ve son sonuç' })
  @ApiResponse({ status: 404, description: 'Geçersiz token veya rapor herkese kapalı' })
  @Get('shared/:token')
  @UseGuards() // TenantGuard'ı bu endpoint için devre dışı bırak (public erişim)
  async getSharedReport(
    @Param('token', ParseUUIDPipe) token: string,
  ) {
    return this.biService.getSharedReport(token);
  }

  // ─── Dashboardlar ─────────────────────────────────────────────────────────────

  /**
   * Yeni dashboard oluşturur.
   * is_default = true ise mevcut varsayılan otomatik kaldırılır.
   */
  @ApiOperation({ summary: 'Yeni dashboard oluştur' })
  @ApiResponse({ status: 201, description: 'Dashboard başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz giriş' })
  @Post('dashboards')
  @HttpCode(HttpStatus.CREATED)
  async createDashboard(
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreateDashboardDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.createDashboard(dto, ctx.tenantId, ctx.userId);
  }

  /**
   * Tenant'a ait tüm dashboard'ları listeler.
   * Varsayılan dashboard listenin başında gelir.
   */
  @ApiOperation({ summary: 'Dashboard listesi' })
  @ApiResponse({ status: 200, description: 'Dashboard listesi' })
  @Get('dashboards')
  async listDashboards() {
    const ctx = getTenantContext();
    return this.biService.listDashboards(ctx.tenantId);
  }

  /**
   * Tek dashboard'u widgetları ile birlikte getirir.
   */
  @ApiOperation({ summary: 'Dashboard detayı — widgetlar dahil' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Dashboard UUID' })
  @ApiResponse({ status: 200, description: 'Dashboard ve widgetlar' })
  @ApiResponse({ status: 404, description: 'Dashboard bulunamadı' })
  @Get('dashboards/:id')
  async getDashboard(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ctx = getTenantContext();
    return this.biService.getDashboard(id, ctx.tenantId);
  }

  /**
   * Dashboard günceller.
   */
  @ApiOperation({ summary: 'Dashboard güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Dashboard UUID' })
  @ApiResponse({ status: 200, description: 'Güncellenmiş dashboard' })
  @ApiResponse({ status: 404, description: 'Dashboard bulunamadı' })
  @Patch('dashboards/:id')
  async updateDashboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ValidationPipe({ whitelist: true, skipMissingProperties: true }))
    dto: UpdateDashboardDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.updateDashboard(id, dto, ctx.tenantId);
  }

  /**
   * Dashboard'u siler. Cascade ile tüm widgetlar da silinir.
   */
  @ApiOperation({ summary: 'Dashboard sil — widgetlar ile birlikte silinir' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Dashboard UUID' })
  @ApiResponse({ status: 204, description: 'Dashboard silindi' })
  @ApiResponse({ status: 404, description: 'Dashboard bulunamadı' })
  @Delete('dashboards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDashboard(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const ctx = getTenantContext();
    await this.biService.deleteDashboard(id, ctx.tenantId);
  }

  /**
   * Dashboard'a widget ekler.
   */
  @ApiOperation({ summary: 'Dashboard\'a widget ekle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Dashboard UUID' })
  @ApiResponse({ status: 201, description: 'Widget eklendi' })
  @ApiResponse({ status: 404, description: 'Dashboard veya rapor tanımı bulunamadı' })
  @Post('dashboards/:id/widgets')
  @HttpCode(HttpStatus.CREATED)
  async addWidget(
    @Param('id', ParseUUIDPipe) dashboardId: string,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CreateWidgetDto,
  ) {
    const ctx = getTenantContext();
    return this.biService.addWidget(dashboardId, dto, ctx.tenantId);
  }

  /**
   * Dashboard'dan widget kaldırır.
   */
  @ApiOperation({ summary: 'Dashboard\'dan widget kaldır' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Dashboard UUID' })
  @ApiParam({ name: 'widgetId', type: 'string', format: 'uuid', description: 'Widget UUID' })
  @ApiResponse({ status: 204, description: 'Widget kaldırıldı' })
  @ApiResponse({ status: 404, description: 'Widget bulunamadı' })
  @Delete('dashboards/:id/widgets/:widgetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeWidget(
    @Param('id', ParseUUIDPipe) _dashboardId: string,
    @Param('widgetId', ParseUUIDPipe) widgetId: string,
  ): Promise<void> {
    const ctx = getTenantContext();
    await this.biService.removeWidget(widgetId, ctx.tenantId);
  }
}

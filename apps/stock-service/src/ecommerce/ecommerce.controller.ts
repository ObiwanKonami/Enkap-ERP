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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TenantGuard } from '@enkap/database';
import { EcommerceService } from './ecommerce.service';
import {
  CreateEcommerceIntegrationDto,
  UpdateEcommerceIntegrationDto,
} from './dto/create-integration.dto';
import type { EcommerceIntegration } from './entities/ecommerce-integration.entity';
import type { SyncResult } from './dto/sync-result.dto';

/**
 * E-ticaret Entegrasyon Controller'ı.
 *
 * WooCommerce, Shopify, Ticimax ve İdeaSoft entegrasyonlarının
 * yönetimi ve senkronizasyonunu sağlar.
 *
 * Tüm endpoint'ler TenantGuard ile korunur — JWT token'daki tenantId kullanılır.
 */
@ApiTags('ecommerce')
@ApiBearerAuth('JWT')
@UseGuards(TenantGuard)
@Controller('ecommerce')
export class EcommerceController {
  constructor(private readonly ecommerceService: EcommerceService) {}

  /**
   * Yeni e-ticaret entegrasyonu oluşturur.
   * Credential'lar şifreli olarak saklanır.
   */
  @Post('integrations')
  @ApiOperation({ summary: 'E-ticaret entegrasyonu oluştur' })
  @ApiResponse({ status: 201, description: 'Entegrasyon başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek verisi' })
  createIntegration(
    @Body() dto: CreateEcommerceIntegrationDto,
  ): Promise<EcommerceIntegration> {
    return this.ecommerceService.createIntegration(dto);
  }

  /**
   * Tenant'ın tüm e-ticaret entegrasyonlarını listeler.
   * Credential alanları güvenlik gereği döndürülmez.
   */
  @Get('integrations')
  @ApiOperation({ summary: 'E-ticaret entegrasyonlarını listele' })
  @ApiResponse({ status: 200, description: 'Entegrasyon listesi' })
  listIntegrations(): Promise<EcommerceIntegration[]> {
    return this.ecommerceService.listIntegrations();
  }

  /**
   * Belirtilen e-ticaret entegrasyonunu getirir.
   */
  @Get('integrations/:id')
  @ApiOperation({ summary: 'E-ticaret entegrasyonu getir' })
  @ApiParam({ name: 'id', description: 'Entegrasyon UUID' })
  @ApiResponse({ status: 200, description: 'Entegrasyon detayı' })
  @ApiResponse({ status: 404, description: 'Entegrasyon bulunamadı' })
  getIntegration(
    @Param('id') id: string,
  ): Promise<EcommerceIntegration> {
    return this.ecommerceService.getIntegration(id);
  }

  /**
   * E-ticaret entegrasyonunu günceller.
   * Sadece gönderilen alanlar güncellenir (partial update).
   */
  @Patch('integrations/:id')
  @ApiOperation({ summary: 'E-ticaret entegrasyonu güncelle' })
  @ApiParam({ name: 'id', description: 'Entegrasyon UUID' })
  @ApiResponse({ status: 200, description: 'Entegrasyon güncellendi' })
  @ApiResponse({ status: 404, description: 'Entegrasyon bulunamadı' })
  updateIntegration(
    @Param('id') id: string,
    @Body() dto: UpdateEcommerceIntegrationDto,
  ): Promise<EcommerceIntegration> {
    return this.ecommerceService.updateIntegration(id, dto);
  }

  /**
   * E-ticaret entegrasyonunu siler.
   * İlişkili sipariş kayıtları korunur (soft delete değil, entegrasyon konfigürasyonu silinir).
   */
  @Delete('integrations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'E-ticaret entegrasyonu sil' })
  @ApiParam({ name: 'id', description: 'Entegrasyon UUID' })
  @ApiResponse({ status: 204, description: 'Entegrasyon silindi' })
  @ApiResponse({ status: 404, description: 'Entegrasyon bulunamadı' })
  deleteIntegration(
    @Param('id') id: string,
  ): Promise<void> {
    return this.ecommerceService.deleteIntegration(id);
  }

  /**
   * Entegrasyonu aktif/pasif yapar.
   * Pasif entegrasyonlar scheduler tarafından atlanır.
   */
  @Post('integrations/:id/toggle')
  @ApiOperation({ summary: 'Entegrasyon aktif/pasif yap' })
  @ApiParam({ name: 'id', description: 'Entegrasyon UUID' })
  @ApiResponse({ status: 200, description: 'Durum değiştirildi' })
  @ApiResponse({ status: 404, description: 'Entegrasyon bulunamadı' })
  toggleActive(
    @Param('id') id: string,
  ): Promise<EcommerceIntegration> {
    return this.ecommerceService.toggleActive(id);
  }

  /**
   * Belirtilen entegrasyon için manuel senkronizasyon başlatır.
   * Scheduler beklemeden anında tetikleme için kullanılır.
   * Sonuç: kaç ürün/stok/sipariş senkronize edildiği döndürülür.
   */
  @Post('integrations/:id/sync')
  @ApiOperation({ summary: 'Manuel e-ticaret senkronizasyonu başlat' })
  @ApiParam({ name: 'id', description: 'Entegrasyon UUID' })
  @ApiResponse({ status: 200, description: 'Senkronizasyon tamamlandı, sonuç döndürüldü' })
  @ApiResponse({ status: 404, description: 'Entegrasyon bulunamadı' })
  syncIntegration(
    @Param('id') id: string,
  ): Promise<SyncResult> {
    return this.ecommerceService.syncIntegration(id);
  }
}

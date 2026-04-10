import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  TenantProfileService,
  type CreateProfileDto,
  type UpdateProfileDto,
} from './tenant-profile.service';
import { TenantProfile } from './tenant-profile.entity';

/**
 * Tenant profil REST uç noktaları.
 *
 * /tenants/:tenantId/profile  — CRUD
 * /tenants/:tenantId/invoice-number — Atomik fatura sıra no üretici
 */
@ApiTags('tenant')
@ApiBearerAuth('JWT')
@Controller('tenants/:tenantId')
export class TenantProfileController {
  constructor(private readonly profileService: TenantProfileService) {}

  /** Profil getir */
  @ApiOperation({ summary: 'Tenant profilini getir', description: 'Tenant\'ın şirket profilini (adres, VKN, IBAN vb.) döndürür.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Profil başarıyla döndü.', type: TenantProfile })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @ApiResponse({ status: 404, description: 'Tenant profili bulunamadı.' })
  @Get('profile')
  getProfile(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantProfile> {
    return this.profileService.findByTenant(tenantId);
  }

  /**
   * Profil oluştur.
   * Normalde onboarding servisi çağırır; direkt çağrı da desteklenir.
   */
  @ApiOperation({ summary: 'Tenant profili oluştur', description: 'Yeni tenant için şirket profili oluşturur. Normalde onboarding servisi tarafından çağrılır.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 201, description: 'Profil başarıyla oluşturuldu.', type: TenantProfile })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @ApiResponse({ status: 409, description: 'Bu tenant için profil zaten mevcut.' })
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  createProfile(
    @Param('tenantId') tenantId: string,
    @Body() dto: Omit<CreateProfileDto, 'tenantId'>,
  ): Promise<TenantProfile> {
    return this.profileService.create({ ...dto, tenantId });
  }

  /** Profil güncelle (kısmi) */
  @ApiOperation({ summary: 'Tenant profilini güncelle', description: 'Şirket profilini kısmen günceller (PATCH — yalnızca gönderilen alanlar değişir).' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Profil başarıyla güncellendi.', type: TenantProfile })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @ApiResponse({ status: 404, description: 'Tenant profili bulunamadı.' })
  @Patch('profile')
  updateProfile(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<TenantProfile> {
    return this.profileService.update(tenantId, dto);
  }

  /**
   * Sonraki fatura numarasını atomik olarak al.
   * Çağıran servis (financial-service) aldığı numarayı faturaya yazar.
   */
  @ApiOperation({ summary: 'Sonraki fatura numarasını al', description: 'PostgreSQL atomik UPDATE ile bir sonraki fatura sıra numarasını üretir ve döndürür (örn: ENK-2026-000001). Çakışma garantisi vardır.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Fatura numarası üretildi.', schema: { example: { invoiceNumber: 'ENK-2026-000001' } } })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @ApiResponse({ status: 404, description: 'Tenant profili bulunamadı.' })
  @Post('invoice-number')
  @HttpCode(HttpStatus.OK)
  async nextInvoiceNumber(
    @Param('tenantId') tenantId: string,
  ): Promise<{ invoiceNumber: string }> {
    const invoiceNumber = await this.profileService.nextInvoiceNumber(tenantId);
    return { invoiceNumber };
  }
}

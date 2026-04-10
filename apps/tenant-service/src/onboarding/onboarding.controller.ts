import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import {
  OnboardingService,
  type RegisterRequest,
  type RegisterResult,
  type AddCardRequest,
} from './onboarding.service';
import { TenantProfile } from '../profile/tenant-profile.entity';

/**
 * Self-servis onboarding wizard REST uç noktaları.
 *
 * Adım 1: POST /onboarding/register
 *   Yeni müşteri kaydı → tenant provizyon → trial aboneliği
 *
 * Adım 2 (opsiyonel): POST /onboarding/:tenantId/card
 *   Kart bilgilerini iyzico'ya kaydet
 *
 * Durum: GET /onboarding/:tenantId/status
 */
@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Yeni müşteri kaydı.
   *
   * İş akışı:
   *  1. Şirket profili oluştur
   *  2. Tenant provision (şema + migrasyonlar)
   *  3. Billing aboneliği başlat (14 gün trial)
   *  4. Kart verilmişse iyzico'ya kaydet
   */
  @ApiOperation({ summary: 'Yeni müşteri kaydı', description: 'Self-servis onboarding wizard adım 1: Şirket profili oluşturur, tenant şemasını provizyon eder, 14 günlük trial aboneliği başlatır.' })
  @ApiResponse({ status: 201, description: 'Kayıt tamamlandı — tenantId, trial bitiş tarihi ve sonraki adım döner.', schema: { example: { tenantId: 'uuid', tenantSlug: 'acme-corp', planId: 'starter', trialEndsAt: '2026-04-02T00:00:00Z', onboardingStep: 'card', message: 'Kayıt tamamlandı.' } } })
  @ApiResponse({ status: 400, description: 'Geçersiz veya eksik veri.' })
  @ApiResponse({ status: 409, description: 'Bu e-posta veya slug ile tenant zaten mevcut.' })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterRequest): Promise<RegisterResult> {
    return this.onboardingService.register(dto);
  }

  /**
   * Kart ekleme (wizard 2. adım).
   * Trial sırasında veya ayarlar bölümünden erişilebilir.
   */
  @ApiOperation({ summary: 'Kart ekle', description: 'Onboarding wizard adım 2: iyzico üzerinden kart bilgilerini kaydeder ve aboneliği aktive eder.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Kart başarıyla eklendi ve abonelik aktive edildi.' })
  @ApiResponse({ status: 400, description: 'Kart bilgileri geçersiz.' })
  @ApiResponse({ status: 404, description: 'Tenant bulunamadı.' })
  @Post(':tenantId/card')
  @HttpCode(HttpStatus.OK)
  addCard(
    @Param('tenantId') tenantId: string,
    @Body() body: { card: AddCardRequest['card'] },
  ): Promise<{ message: string }> {
    return this.onboardingService.addCard({ tenantId, card: body.card });
  }

  /** Onboarding durumu ve profil bilgisi */
  @ApiOperation({ summary: 'Onboarding durumunu getir', description: 'Tenant\'ın onboarding adımını (profile / plan / card / completed) ve profil bilgisini döndürür.' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID\'si' })
  @ApiResponse({ status: 200, description: 'Onboarding durumu ve profil bilgisi döndü.', type: TenantProfile })
  @ApiResponse({ status: 404, description: 'Tenant bulunamadı.' })
  @Get(':tenantId/status')
  getStatus(
    @Param('tenantId') tenantId: string,
  ): Promise<TenantProfile> {
    return this.onboardingService.getStatus(tenantId);
  }
}

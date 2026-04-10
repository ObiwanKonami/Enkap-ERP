import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { BillingPlan }         from './plan.entity';
import { Subscription }        from './subscription.entity';
import type { IyzicoCardDetails } from '../payment/iyzico.client';

class IyzicoCardDetailsDto {
  @ApiProperty({ example: 'AHMET YILMAZ', description: 'Kart sahibinin adı soyadı' })
  cardHolderName!: string;

  @ApiProperty({ example: '5528790000000008', description: 'Kart numarası (PCI: Enkap sunucularında saklanmaz)' })
  cardNumber!: string;

  @ApiProperty({ example: '12', description: 'Son kullanma ayı (MM)' })
  expireMonth!: string;

  @ApiProperty({ example: '2030', description: 'Son kullanma yılı (YYYY)' })
  expireYear!: string;

  @ApiProperty({ example: '123', description: 'CVV/CVC kodu' })
  cvc!: string;
}

class StartSubscriptionDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid', description: 'Tenant UUID' })
  tenantId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001', format: 'uuid', description: 'Plan UUID' })
  planId!: string;

  @ApiProperty({ example: 'billing@firma.com.tr', description: 'Fatura e-posta adresi' })
  email!: string;

  @ApiProperty({ example: 'ABC Teknoloji A.Ş.', description: 'Şirket adı' })
  companyName!: string;

  @ApiPropertyOptional({ type: IyzicoCardDetailsDto, description: 'Kart bilgisi (opsiyonel — trial başlatmak için gerekli değil)' })
  card?: IyzicoCardDetails;
}

class ChangePlanDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440002', format: 'uuid', description: 'Yeni plan UUID' })
  planId!: string;
}

class CancelDto {
  @ApiPropertyOptional({ example: false, description: 'true → anında iptal, false → dönem sonunda iptal (varsayılan: false)' })
  /** true → anında, false → dönem sonunda */
  immediate?: boolean;
}

class AddCardBodyDto {
  @ApiProperty({ type: IyzicoCardDetailsDto, description: 'Eklenecek kart bilgileri' })
  card!: IyzicoCardDetails;
}

/**
 * Abonelik & Plan REST uç noktaları.
 *
 * Tüm endpoint'ler billing-service'e özel (port 3008).
 * Gerçek üretimde bu endpoint'ler API Gateway'den geçer
 * ve yalnızca platform admin'i veya tenant kendi aboneliğini yönetir.
 */
@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** Mevcut planları listele */
  @ApiTags('plans')
  @ApiOperation({ summary: 'Mevcut abonelik planlarını listele' })
  @ApiResponse({ status: 200, description: 'Başarılı — aktif planlar listesi' })
  @Get('plans')
  getPlans(): Promise<BillingPlan[]> {
    return this.subscriptionService.getPlans();
  }

  /** Tenant'ın aboneliğini getir */
  @ApiTags('subscriptions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: "Tenant'ın aktif aboneliğini getir" })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı — abonelik detayı (yoksa null)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('subscriptions/:tenantId')
  findByTenant(
    @Param('tenantId') tenantId: string,
  ): Promise<Subscription | null> {
    return this.subscriptionService.findByTenant(tenantId);
  }

  /**
   * Yeni abonelik başlat.
   * Eğer kart bilgisi verilmişse iyzico'ya da kaydeder.
   */
  @ApiTags('subscriptions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Yeni abonelik başlat (14 gün trial ile)' })
  @ApiResponse({ status: 201, description: 'Abonelik başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Kart kaydı başarısız — iyzico hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Plan bulunamadı' })
  @ApiResponse({ status: 409, description: 'Bu tenant için zaten aktif abonelik mevcut' })
  @Post('subscriptions')
  @HttpCode(HttpStatus.CREATED)
  startSubscription(
    @Body() dto: StartSubscriptionDto,
  ): Promise<Subscription> {
    return this.subscriptionService.startSubscription({
      tenantId:    dto.tenantId,
      planId:      dto.planId,
      email:       dto.email,
      companyName: dto.companyName,
      card:        dto.card,
    });
  }

  /** Kart ekle veya güncelle (onboarding wizard adım 2) */
  @ApiTags('subscriptions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Aboneliğe kart ekle veya güncelle (onboarding adım 2)' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Kart başarıyla eklendi' })
  @ApiResponse({ status: 400, description: 'Kart kaydı başarısız — iyzico hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Abonelik bulunamadı' })
  @Patch('subscriptions/:tenantId/card')
  addCard(
    @Param('tenantId') tenantId: string,
    @Body() body: AddCardBodyDto,
  ): Promise<Subscription> {
    return this.subscriptionService.addCard(tenantId, body.card);
  }

  /** Plan değiştir (upgrade/downgrade) */
  @ApiTags('subscriptions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Plan değiştir (upgrade veya downgrade)' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Plan başarıyla değiştirildi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Abonelik veya plan bulunamadı' })
  @Patch('subscriptions/:tenantId/plan')
  changePlan(
    @Param('tenantId') tenantId: string,
    @Body() dto: ChangePlanDto,
  ): Promise<Subscription> {
    return this.subscriptionService.changePlan(tenantId, dto.planId);
  }

  /** Abonelik iptali */
  @ApiTags('subscriptions')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Aboneliği iptal et' })
  @ApiParam({ name: 'tenantId', type: 'string', format: 'uuid', description: 'Tenant UUID' })
  @ApiResponse({ status: 204, description: 'Abonelik iptali başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Abonelik bulunamadı' })
  @Post('subscriptions/:tenantId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('tenantId') tenantId: string,
    @Body() dto: CancelDto,
  ): Promise<void> {
    await this.subscriptionService.cancel(tenantId, dto.immediate ?? false);
  }

  /**
   * Manuel yenileme tetikle (yönetim paneli için).
   * Normalde cron tarafından otomatik çalışır.
   */
  @ApiTags('admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Abonelik yenilemelerini manuel tetikle (yönetim paneli)' })
  @ApiResponse({ status: 204, description: 'Yenileme işlemi başlatıldı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Post('admin/process-renewals')
  @HttpCode(HttpStatus.NO_CONTENT)
  async processRenewals(): Promise<void> {
    await this.subscriptionService.processPeriodRenewals();
  }
}

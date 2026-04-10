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
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { ActivityService, type CreateActivityDto, CreateActivityDtoDoc } from './activity.service';
import { Activity } from './activity.entity';

@ApiTags('activities')
@ApiBearerAuth('JWT')
@Controller('activities')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.SATIS_TEMSILCISI)
@RequiresPlan(Feature.CRM)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  /** Vadesi geçmiş bekleyen aktivite sayısı (dashboard widget) */
  @ApiOperation({ summary: 'Vadesi geçmiş bekleyen aktivite sayısını getir (dashboard widget)' })
  @ApiResponse({ status: 200, description: 'Başarılı — vadesi geçmiş aktivite sayısı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('overdue-count')
  overdueCount(): Promise<number> {
    return this.activityService.overdueCount();
  }

  /** Aktivite listesi */
  @ApiOperation({ summary: 'Aktivite listesi (filtrelenebilir, sayfalanabilir)' })
  @ApiQuery({ name: 'contactId', required: false, type: String, format: 'uuid', description: 'İlgili kişi UUID' })
  @ApiQuery({ name: 'leadId', required: false, type: String, format: 'uuid', description: 'İlgili fırsat UUID' })
  @ApiQuery({ name: 'ownerUserId', required: false, type: String, format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  @ApiQuery({ name: 'pending', required: false, type: Boolean, description: 'true → sadece bekleyenler, false → sadece tamamlananlar' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Başarılı — aktivite listesi ve toplam sayı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get()
  findAll(
    @Query('contactId')   contactId?:   string,
    @Query('leadId')      leadId?:      string,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('pending')     pending?:     string,
    @Query('page')        page?:        string,
    @Query('limit')       limit?:       string,
  ): Promise<{ items: Activity[]; total: number; page: number; limit: number }> {
    return this.activityService.findAll({
      contactId,
      leadId,
      ownerUserId,
      pending: pending === undefined ? undefined : pending === 'true',
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Aktivite detayı */
  @ApiOperation({ summary: 'Aktivite detayını getir' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Aktivite UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı — aktivite detayı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Aktivite bulunamadı' })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<Activity> {
    return this.activityService.findOne(id);
  }

  /** Yeni aktivite oluştur */
  @ApiOperation({ summary: 'Yeni aktivite oluştur' })
  @ApiBody({ type: CreateActivityDtoDoc })
  @ApiResponse({ status: 201, description: 'Aktivite başarıyla oluşturuldu' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateActivityDto): Promise<Activity> {
    return this.activityService.create(dto);
  }

  /** Aktiviteyi tamamlandı olarak işaretle */
  @ApiOperation({ summary: 'Aktiviteyi tamamlandı olarak işaretle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Aktivite UUID' })
  @ApiResponse({ status: 200, description: 'Aktivite başarıyla tamamlandı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Aktivite bulunamadı veya zaten tamamlandı' })
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id') id: string): Promise<Activity> {
    return this.activityService.complete(id);
  }
}

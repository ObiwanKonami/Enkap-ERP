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
import {
  LeadService,
  type CreateLeadDto,
  type UpdateLeadDto,
  type PipelineSummary,
  CreateLeadDtoDoc,
  UpdateLeadDtoDoc,
} from './lead.service';
import { Lead, type LeadStage } from './lead.entity';

@ApiTags('leads')
@ApiBearerAuth('JWT')
@Controller('leads')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.SATIS_TEMSILCISI)
@RequiresPlan(Feature.CRM)
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  /**
   * Pipeline özeti — Dashboard Kanban için.
   * Her açık aşamanın fırsat sayısı + toplam + ağırlıklı değer.
   */
  @ApiOperation({ summary: 'Pipeline özeti — Kanban dashboard için aşama bazlı istatistik' })
  @ApiResponse({ status: 200, description: 'Başarılı — her aşama için sayı, toplam ve ağırlıklı değer' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get('pipeline')
  getPipeline(): Promise<PipelineSummary[]> {
    return this.leadService.getPipelineSummary();
  }

  /** Fırsat listesi */
  @ApiOperation({ summary: 'Fırsat listesi (filtrelenebilir, sayfalanabilir)' })
  @ApiQuery({ name: 'stage', required: false, type: String, enum: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'], description: 'Fırsat aşaması' })
  @ApiQuery({ name: 'ownerUserId', required: false, type: String, format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  @ApiQuery({ name: 'contactId', required: false, type: String, format: 'uuid', description: 'İlgili kişi UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Başarılı — fırsat listesi ve toplam sayı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get()
  findAll(
    @Query('stage')       stage?:       LeadStage,
    @Query('ownerUserId') ownerUserId?: string,
    @Query('contactId')   contactId?:   string,
    @Query('page')        page?:        string,
    @Query('limit')       limit?:       string,
  ): Promise<{ items: Lead[]; total: number; page: number; limit: number }> {
    return this.leadService.findAll({
      stage,
      ownerUserId,
      contactId,
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Fırsat detayı */
  @ApiOperation({ summary: 'Fırsat detayını getir' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Fırsat UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı — fırsat detayı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Fırsat bulunamadı' })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<Lead> {
    return this.leadService.findOne(id);
  }

  /** Yeni fırsat oluştur */
  @ApiOperation({ summary: 'Yeni fırsat oluştur' })
  @ApiBody({ type: CreateLeadDtoDoc })
  @ApiResponse({ status: 201, description: 'Fırsat başarıyla oluşturuldu' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLeadDto): Promise<Lead> {
    return this.leadService.create(dto);
  }

  /**
   * Fırsat güncelle / aşama geçişi.
   * won/lost → closedAt otomatik, lost → lostReason zorunlu.
   */
  @ApiOperation({ summary: 'Fırsatı güncelle veya aşama geçişi yap' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Fırsat UUID' })
  @ApiBody({ type: UpdateLeadDtoDoc })
  @ApiResponse({ status: 200, description: 'Fırsat başarıyla güncellendi' })
  @ApiResponse({ status: 400, description: 'Geçersiz aşama geçişi veya eksik lostReason' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Fırsat bulunamadı' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<Lead> {
    return this.leadService.update(id, dto);
  }
}

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  ContactService,
  type CreateContactDto,
  type UpdateContactDto,
  CreateContactDtoDoc,
  UpdateContactDtoDoc,
} from './contact.service';
import { Contact, type ContactSource, type ContactType } from './contact.entity';

@ApiTags('contacts')
@ApiBearerAuth('JWT')
@Controller('contacts')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.SATIS_TEMSILCISI)
@RequiresPlan(Feature.CRM)
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /** Kişi listesi (filtrelenebilir, sayfalanabilir) */
  @ApiOperation({ summary: 'Kişi listesi (filtrelenebilir, sayfalanabilir)' })
  @ApiQuery({ name: 'ownerUserId', required: false, type: String, format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  @ApiQuery({ name: 'source', required: false, type: String, enum: ['referral', 'web', 'social', 'cold_call', 'other'], description: 'Kişi kaynağı' })
  @ApiQuery({ name: 'type', required: false, type: String, enum: ['customer', 'vendor', 'both', 'prospect'], description: 'Kişi türü' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Ad, e-posta veya şirket arama metni' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Başarılı — kişi listesi ve toplam sayı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Get()
  findAll(
    @Query('ownerUserId') ownerUserId?: string,
    @Query('source')      source?:      ContactSource,
    @Query('type')        type?:        ContactType,
    @Query('search')      search?:      string,
    @Query('page')        page?:        string,
    @Query('limit')       limit?:       string,
  ): Promise<{ items: Contact[]; total: number; page: number; limit: number }> {
    return this.contactService.findAll({
      ownerUserId,
      source,
      type,
      search,
      page:  page   ? parseInt(page,   10) : undefined,
      limit: limit  ? parseInt(limit,  10) : undefined,
    });
  }

  /** Kişi detayı */
  @ApiOperation({ summary: 'Kişi detayını getir' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Kişi UUID' })
  @ApiResponse({ status: 200, description: 'Başarılı — kişi detayı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Kişi bulunamadı' })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<Contact> {
    return this.contactService.findOne(id);
  }

  /** Yeni kişi oluştur */
  @ApiOperation({ summary: 'Yeni kişi oluştur' })
  @ApiBody({ type: CreateContactDtoDoc })
  @ApiResponse({ status: 201, description: 'Kişi başarıyla oluşturuldu' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateContactDto): Promise<Contact> {
    return this.contactService.create(dto);
  }

  /** Kişi güncelle */
  @ApiOperation({ summary: 'Kişiyi güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Kişi UUID' })
  @ApiBody({ type: UpdateContactDtoDoc })
  @ApiResponse({ status: 200, description: 'Kişi başarıyla güncellendi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @ApiResponse({ status: 404, description: 'Kişi bulunamadı' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.contactService.update(id, dto);
  }

  /** Kişiyi sil (soft delete) */
  @ApiOperation({ summary: 'Kişiyi pasife al (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Kişi UUID' })
  @ApiResponse({ status: 204, description: 'Kişi başarıyla silindi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz — geçersiz veya eksik JWT' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.contactService.remove(id);
  }
}

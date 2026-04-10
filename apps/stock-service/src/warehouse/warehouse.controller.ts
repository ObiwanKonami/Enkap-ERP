import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { WarehouseService } from './warehouse.service';

@ApiTags('warehouses')
@ApiBearerAuth('JWT')
@Controller('warehouses')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.DEPO_SORUMLUSU)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @ApiOperation({ summary: 'Depo listesi' })
  @ApiResponse({ status: 200, description: 'Depo listesi başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get()
  async findAll() {
    return this.warehouseService.findAll();
  }

  @ApiOperation({ summary: 'Depo detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Depo UUID' })
  @ApiResponse({ status: 200, description: 'Depo bilgileri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Depo bulunamadı' })
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.findById(id);
  }

  @ApiOperation({ summary: 'Yeni depo oluştur' })
  @ApiBody({ schema: { type: 'object', properties: { code: { type: 'string', description: 'Depo kodu' }, name: { type: 'string', description: 'Depo adı' }, address: { type: 'string', description: 'Adres (opsiyonel)' }, city: { type: 'string', description: 'Şehir (opsiyonel)' }, isVirtual: { type: 'boolean', description: 'Sanal depo mu?' } }, required: ['code', 'name'] } })
  @ApiResponse({ status: 201, description: 'Depo başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz istek' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: {
      code: string;
      name: string;
      address?: string;
      city?: string;
      isVirtual?: boolean;
    },
  ) {
    return this.warehouseService.create(dto);
  }

  @ApiOperation({ summary: 'Depo bilgilerini güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Depo UUID' })
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, isActive: { type: 'boolean' } } } })
  @ApiResponse({ status: 200, description: 'Depo başarıyla güncellendi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Depo bulunamadı' })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<{ name: string; address: string; city: string; isActive: boolean }>,
  ) {
    return this.warehouseService.update(id, dto);
  }

  @ApiOperation({ summary: 'Depodaki ürün stok dağılımı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Depo UUID' })
  @ApiResponse({ status: 200, description: 'Depodaki ürün stokları döndürüldü' })
  @Get(':id/products')
  async findProducts(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.findProductsByWarehouse(id);
  }

  @ApiOperation({ summary: 'Depoyu pasife al (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Depo UUID' })
  @ApiResponse({ status: 204, description: 'Depo başarıyla pasife alındı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Depo bulunamadı' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.warehouseService.deactivate(id);
  }
}

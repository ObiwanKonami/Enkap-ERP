import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '@enkap/database';
import { BomService } from './bom.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';

@ApiTags('bom')
@ApiBearerAuth('JWT')
@Controller('bom')
@UseGuards(TenantGuard)
export class BomController {
  constructor(private readonly bomService: BomService) {}

  @ApiOperation({ summary: 'Reçete listesi' })
  @ApiQuery({ name: 'productId', required: false, type: String, format: 'uuid', description: 'Mamul ürün UUID filtresi' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Aktif/pasif filtresi' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt (maks 200, varsayılan 50)' })
  @ApiResponse({ status: 200, description: 'Reçete listesi döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get()
  findAll(
    @Query('productId') productId?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bomService.findAll({
      productId,
      isActive: isActive !== undefined ? isActive !== 'false' : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Reçete detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Reçete UUID' })
  @ApiResponse({ status: 200, description: 'Reçete detayı döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Reçete bulunamadı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bomService.findOne(id);
  }

  @ApiOperation({ summary: 'Yeni reçete oluştur' })
  @ApiResponse({ status: 201, description: 'Reçete oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Doğrulama hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBomDto) {
    return this.bomService.create(dto);
  }

  @ApiOperation({ summary: 'Reçete güncelle' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Reçete UUID' })
  @ApiResponse({ status: 200, description: 'Reçete güncellendi' })
  @ApiResponse({ status: 400, description: 'Doğrulama hatası' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Reçete bulunamadı' })
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomDto,
  ) {
    return this.bomService.update(id, dto);
  }

  @ApiOperation({ summary: 'Reçeteyi pasife al (soft delete)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Reçete UUID' })
  @ApiResponse({ status: 204, description: 'Reçete pasife alındı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Reçete bulunamadı' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    await this.bomService.deactivate(id);
  }
}

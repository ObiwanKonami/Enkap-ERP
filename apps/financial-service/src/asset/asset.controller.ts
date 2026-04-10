import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { getTenantContext } from '@enkap/database';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AssetService }     from './asset.service';
import { CreateAssetDto }   from './dto/create-asset.dto';
import { DisposeAssetDto }  from './dto/dispose-asset.dto';

@ApiTags('assets')
@ApiBearerAuth('JWT')
@Controller('assets')
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @ApiOperation({ summary: 'Yeni duran varlık kaydı oluştur' })
  @ApiResponse({ status: 201, description: 'Varlık başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz veri' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateAssetDto,
    @Request() req: { user?: { sub?: string } },
  ) {
    const userId = req.user?.sub ?? '00000000-0000-0000-0000-000000000000';
    return this.assetService.create(dto, userId);
  }

  @ApiOperation({ summary: 'Duran varlıkları listele' })
  @ApiQuery({ name: 'status',   required: false, description: 'AKTIF | TAMAMEN_AMORTIZE | ELDEN_CIKARILDI' })
  @ApiQuery({ name: 'category', required: false, description: 'Varlık kategorisi' })
  @ApiQuery({ name: 'page',     required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit',    required: false, type: Number, description: 'Sayfa başına kayıt (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Varlık listesi ve toplam sayı' })
  @Get()
  findAll(
    @Query('status')   status?: string,
    @Query('category') category?: string,
    @Query('page')     page?: string,
    @Query('limit')    limit?: string,
  ) {
    return this.assetService.findAll({
      status,
      category,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Duran varlık detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Varlık detayı' })
  @ApiResponse({ status: 404, description: 'Varlık bulunamadı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assetService.findOne(id);
  }

  @ApiOperation({ summary: 'Varlığın amortisman geçmişi' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Amortisman kayıtları listesi (yıl başından bugüne)' })
  @Get(':id/depreciation')
  getDepreciation(@Param('id', ParseUUIDPipe) id: string) {
    return this.assetService.getDepreciationHistory(id);
  }

  @ApiOperation({ summary: 'Varlığı elden çıkar (hurda/satış/kayıp)' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Varlık elden çıkarıldı' })
  @ApiResponse({ status: 404, description: 'Varlık bulunamadı' })
  @ApiResponse({ status: 409, description: 'Varlık zaten elden çıkarılmış' })
  @Patch(':id/dispose')
  dispose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DisposeAssetDto,
  ) {
    return this.assetService.dispose(id, dto);
  }

  @ApiOperation({ summary: 'Sonraki yıl amortisman tahmini (yazma işlemi yapmaz)' })
  @ApiResponse({ status: 200, description: 'Tahmini amortisman tutarları listesi' })
  @Get('reports/depreciation-preview')
  async depreciationPreview() {
    const { tenantId } = getTenantContext();
    return this.assetService.previewNextYearDepreciation(tenantId);
  }
}

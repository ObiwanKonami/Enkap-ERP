import {
  Controller,
  Get,
  Post,
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
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { StockMovementService } from './stock-movement.service';
import { CreateMovementDto } from './dto/create-movement.dto';

@ApiTags('movements')
@ApiBearerAuth('JWT')
@Controller('movements')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.DEPO_SORUMLUSU, Role.SATIN_ALMA)
export class StockMovementController {
  constructor(private readonly movementService: StockMovementService) {}

  /**
   * Tüm stok hareketleri — tenant bazında.
   * GET /movements?page=1&limit=100
   */
  @ApiOperation({ summary: 'Tüm stok hareketleri' })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Stok hareketleri döndürüldü' })
  @Get()
  async findAll(
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.movementService.findAll({
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  /**
   * Ürüne ait stok hareketleri.
   * GET /movements/product/:productId?page=1&limit=50
   */
  @ApiOperation({ summary: 'Ürüne ait stok hareketleri' })
  @ApiParam({ name: 'productId', type: 'string', format: 'uuid', description: 'Ürün UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt sayısı (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Stok hareketleri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('product/:productId')
  async findByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.movementService.findByProduct(productId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * Depoya ait stok hareketleri.
   * GET /movements/warehouse/:warehouseId?page=1&limit=50
   */
  @ApiOperation({ summary: 'Depoya ait stok hareketleri' })
  @ApiParam({ name: 'warehouseId', type: 'string', format: 'uuid', description: 'Depo UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Sayfa numarası (varsayılan: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Sayfa başı kayıt sayısı (varsayılan: 50)' })
  @ApiResponse({ status: 200, description: 'Stok hareketleri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('warehouse/:warehouseId')
  async findByWarehouse(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.movementService.findByWarehouse(warehouseId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * Yeni stok hareketi oluştur.
   * Tip: GIRIS | CIKIS | TRANSFER | SAYIM | IADE_GIRIS | IADE_CIKIS | FIRE
   */
  @ApiOperation({ summary: 'Yeni stok hareketi oluştur (GIRIS, CIKIS, TRANSFER, SAYIM, IADE_GIRIS, IADE_CIKIS, FIRE)' })
  @ApiResponse({ status: 201, description: 'Stok hareketi başarıyla oluşturuldu' })
  @ApiResponse({ status: 400, description: 'Geçersiz hareket tipi veya miktar' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @ApiResponse({ status: 404, description: 'Ürün veya depo bulunamadı' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateMovementDto) {
    return this.movementService.create(dto);
  }
}

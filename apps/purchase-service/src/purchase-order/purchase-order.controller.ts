import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Headers,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsArray, IsDateString, IsNumber, IsOptional,
  IsPositive, IsString, IsUUID, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantGuard, getTenantContext } from '@enkap/database';
import { PurchaseOrderService } from './purchase-order.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';

class GoodsReceiptItemDto {
  @ApiProperty({ example: 'a1b2c3-...', description: 'Ürün UUID' })
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: 'Dell PowerEdge R750', description: 'Ürün adı' })
  @IsString()
  productName!: string;

  @ApiProperty({ example: 'b2c3d4-...', description: 'Depo UUID' })
  @IsUUID()
  warehouseId!: string;

  @ApiProperty({ example: 5, description: 'Teslim alınan miktar' })
  @IsNumber()
  @IsPositive()
  quantity!: number;

  @ApiProperty({ example: 15000000, description: 'Birim maliyet — kuruş' })
  @IsNumber()
  @IsPositive()
  unitCostKurus!: number;
}

class CreateGoodsReceiptDto {
  @ApiProperty({ type: [GoodsReceiptItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemDto)
  items!: GoodsReceiptItemDto[];

  @ApiProperty({ example: '2026-03-20', description: 'Teslim alınma tarihi' })
  @IsDateString()
  receiptDate!: string;

  @ApiPropertyOptional({ example: 'Paketler sağlam teslim alındı', description: 'Notlar' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

@ApiTags('purchase-orders')
@ApiBearerAuth('JWT')
@UseGuards(TenantGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly service: PurchaseOrderService) {}

  @ApiOperation({ summary: 'Yeni satın alma siparişi oluştur' })
  @ApiResponse({ status: 201, description: 'Sipariş oluşturuldu' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.service.create(dto, getTenantContext().userId);
  }

  @ApiOperation({ summary: 'Satın alma siparişlerini listele' })
  @ApiQuery({ name: 'status',   required: false })
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  @ApiQuery({ name: 'offset',   required: false, type: Number })
  @Get()
  findAll(
    @Query('status')   status?: string,
    @Query('vendorId') vendorId?: string,
    @Query('limit')    limit?: string,
    @Query('offset')   offset?: string,
  ) {
    return this.service.findAll({
      status,
      vendorId,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @ApiOperation({ summary: 'Sipariş detayı' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @ApiOperation({ summary: 'Siparişi onaya gönder (TASLAK → ONAY_BEKLIYOR)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Patch(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.submitForApproval(id);
  }

  @ApiOperation({ summary: 'Siparişi onayla (ONAY_BEKLIYOR → ONAYLANDI)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Patch(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.approve(id, getTenantContext().userId);
  }

  @ApiOperation({ summary: 'Siparişi iptal et' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Sipariş iptal edildi' })
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(id);
  }

  @ApiOperation({ summary: 'Mal kabul yap — stock-service\'e GIRIS hareketi gönderir' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Mal kabul kaydedildi ve stok güncellendi' })
  @ApiResponse({ status: 400, description: 'Stok servisine bağlanılamadı' })
  @Post(':id/goods-receipt')
  @HttpCode(HttpStatus.CREATED)
  goodsReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGoodsReceiptDto,
    @Headers('authorization') authHeader?: string,
  ) {
    return this.service.createGoodsReceipt(
      id,
      dto.items,
      getTenantContext().userId,
      dto.receiptDate,
      dto.notes,
      authHeader,
    );
  }
}

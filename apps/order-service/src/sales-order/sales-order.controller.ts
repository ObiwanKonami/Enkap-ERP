import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import {
  IsArray, IsDateString, IsNumber, IsOptional,
  IsPositive, IsString, IsUUID, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantGuard, getTenantContext } from '@enkap/database';
import { SalesOrderService } from './sales-order.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import type { SalesOrder } from './entities/sales-order.entity';
import type { Delivery } from './entities/delivery.entity';

class DeliveryItemDto {
  @IsUUID()    productId!:   string;
  @IsString()  @MaxLength(200) productName!: string;
  @IsUUID()    warehouseId!: string;
  @IsNumber()  @IsPositive()  quantity!:    number;
}

class CreateDeliveryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryItemDto)
  items!: DeliveryItemDto[];

  @IsDateString()
  shipDate!: string;

  @IsOptional() @IsString()  @MaxLength(100) carrier?:   string;
  @IsOptional() @IsString()  @MaxLength(100) tracking?:  string;

  /** Kendi aracıyla sevk — fleet-service UUID'leri */
  @IsOptional() @IsUUID() vehicleId?: string;
  @IsOptional() @IsUUID() driverId?:  string;

  /** Filo seferi için nereden → nereye bilgisi */
  @IsOptional() @IsString() @MaxLength(300) origin?:      string;
  @IsOptional() @IsString() @MaxLength(300) destination?: string;
}

@ApiTags('Satış Siparişleri')
@ApiBearerAuth()
@Controller('orders')
@UseGuards(TenantGuard)
export class SalesOrderController {
  constructor(private readonly service: SalesOrderService) {}

  /** Yeni sipariş oluştur */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Satış siparişi oluştur' })
  create(
    @Body() dto: CreateSalesOrderDto,
  ): Promise<SalesOrder> {
    const { userId } = getTenantContext();
    return this.service.create(dto, userId);
  }

  /** Sipariş listesi */
  @Get()
  @ApiOperation({ summary: 'Sipariş listesi' })
  @ApiQuery({ name: 'status',     required: false })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'limit',      required: false, type: Number })
  @ApiQuery({ name: 'offset',     required: false, type: Number })
  findAll(
    @Query('status')     status?: string,
    @Query('customerId') customerId?: string,
    @Query('limit')      limit?: string,
    @Query('offset')     offset?: string,
  ): Promise<{ data: SalesOrder[]; total: number }> {
    return this.service.findAll({
      status,
      customerId,
      limit:  limit  ? Number(limit)  : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** Sipariş detayı */
  @Get(':id')
  @ApiOperation({ summary: 'Sipariş detayı' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrder> {
    return this.service.findOne(id);
  }

  /** Sipariş onayla (TASLAK → ONAYLANDI) */
  @Post(':id/confirm')
  @ApiOperation({ summary: 'Siparişi onayla' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrder> {
    return this.service.confirm(id);
  }

  /** Hazırlanmaya başla (ONAYLANDI → HAZIRLANIYOR) */
  @Post(':id/pick')
  @ApiOperation({ summary: 'Hazırlamaya başla' })
  startPicking(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrder> {
    return this.service.startPicking(id);
  }

  /** Sevkiyat oluştur */
  @Post(':id/deliveries')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Sevkiyat kaydı oluştur' })
  createDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateDeliveryDto,
    @Headers('authorization') auth?: string,
  ): Promise<Delivery> {
    const { userId } = getTenantContext();
    return this.service.createDelivery(
      id,
      body.items,
      body.shipDate,
      body.carrier,
      body.tracking,
      userId,
      auth,
      body.vehicleId,
      body.driverId,
      body.origin,
      body.destination,
    );
  }

  /** Sevkiyat listesi */
  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Siparişe ait sevkiyatlar' })
  getDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Delivery[]> {
    return this.service.getDeliveries(id);
  }

  /** Sipariş iptal */
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Siparişi iptal et' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SalesOrder> {
    return this.service.cancel(id);
  }
}

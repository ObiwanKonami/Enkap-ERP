import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
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
import { TenantGuard } from '@enkap/database';
import { VehicleService }       from './vehicle.service';
import { CreateVehicleDto }     from './dto/create-vehicle.dto';
import { UpdateVehicleDto }     from './dto/update-vehicle.dto';
import type { Vehicle, VehicleType, VehicleStatus } from './entities/vehicle.entity';

@ApiTags('Araçlar')
@ApiBearerAuth()
@Controller('vehicles')
@UseGuards(TenantGuard)
export class VehicleController {
  constructor(private readonly service: VehicleService) {}

  /** Yeni araç ekle */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni araç ekle' })
  create(@Body() dto: CreateVehicleDto): Promise<Vehicle> {
    return this.service.create(dto);
  }

  /** Araç listesi */
  @Get()
  @ApiOperation({ summary: 'Araç listesi' })
  @ApiQuery({ name: 'status', required: false, enum: ['AKTIF', 'PASIF', 'BAKIMDA'] })
  @ApiQuery({ name: 'type',   required: false, enum: ['TIR', 'KAMYON', 'KAMYONET', 'PICKUP', 'FORKLIFT', 'DIGER'] })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  findAll(
    @Query('status') status?: VehicleStatus,
    @Query('type')   type?:   VehicleType,
    @Query('page')   page?:   string,
    @Query('limit')  limit?:  string,
  ): Promise<{ items: Vehicle[]; total: number; page: number; limit: number }> {
    return this.service.findAll({
      status,
      type,
      page:  page  ? Number(page)  : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Araç detayı */
  @Get(':id')
  @ApiOperation({ summary: 'Araç detayı' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Vehicle> {
    return this.service.findOne(id);
  }

  /** Araç güncelle */
  @Patch(':id')
  @ApiOperation({ summary: 'Araç güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<Vehicle> {
    return this.service.update(id, dto);
  }

}

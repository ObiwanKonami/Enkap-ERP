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
import { DriverService }    from './driver.service';
import { CreateDriverDto }  from './dto/create-driver.dto';
import { UpdateDriverDto }  from './dto/update-driver.dto';
import type { Driver }      from './entities/driver.entity';
import type { DriverStatus } from './entities/driver.entity';

@ApiTags('Sürücüler')
@ApiBearerAuth()
@Controller('drivers')
@UseGuards(TenantGuard)
export class DriverController {
  constructor(private readonly service: DriverService) {}

  /** Yeni sürücü ekle */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni sürücü ekle' })
  create(@Body() dto: CreateDriverDto): Promise<Driver> {
    return this.service.create(dto);
  }

  /** Sürücü listesi */
  @Get()
  @ApiOperation({ summary: 'Sürücü listesi' })
  @ApiQuery({ name: 'status', required: false, enum: ['AKTIF', 'PASIF', 'IZINDE'] })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  findAll(
    @Query('status') status?: DriverStatus,
    @Query('page')   page?:   string,
    @Query('limit')  limit?:  string,
  ): Promise<{ items: Driver[]; total: number; page: number; limit: number }> {
    return this.service.findAll({
      status,
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Sürücü detayı */
  @Get(':id')
  @ApiOperation({ summary: 'Sürücü detayı' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Driver> {
    return this.service.findOne(id);
  }

  /** Sürücü güncelle */
  @Patch(':id')
  @ApiOperation({ summary: 'Sürücü güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
  ): Promise<Driver> {
    return this.service.update(id, dto);
  }

  /**
   * Sürücüye araç ata
   *
   * Önceki atama varsa temizlenir, yeni atama gerçekleştirilir.
   */
  @Post(':id/assign/:vehicleId')
  @ApiOperation({ summary: 'Sürücüye araç ata' })
  assignVehicle(
    @Param('id',        ParseUUIDPipe) id:        string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ): Promise<Driver> {
    return this.service.assignVehicle(id, vehicleId);
  }
}

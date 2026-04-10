import {
  Controller,
  Get,
  Post,
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
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TenantGuard, getTenantContext } from '@enkap/database';
import { TripService }    from './trip.service';
import { CreateTripDto }  from './dto/create-trip.dto';
import type { Trip }      from './entities/trip.entity';
import type { TripStatus } from './entities/trip.entity';

class StartTripDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  startKm?: number;
}

class CompleteTripDto {
  @IsInt()
  @Min(0)
  @Type(() => Number)
  endKm!: number;
}

@ApiTags('Seferler')
@ApiBearerAuth()
@Controller('trips')
@UseGuards(TenantGuard)
export class TripController {
  constructor(private readonly service: TripService) {}

  /** Yeni sefer oluştur */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yeni sefer oluştur' })
  create(@Body() dto: CreateTripDto): Promise<Trip> {
    const { userId } = getTenantContext();
    return this.service.create(dto, userId);
  }

  /** Sefer listesi */
  @Get()
  @ApiOperation({ summary: 'Sefer listesi' })
  @ApiQuery({ name: 'status',    required: false, enum: ['PLANLANMIS', 'YOLDA', 'TAMAMLANDI', 'IPTAL'] })
  @ApiQuery({ name: 'vehicleId', required: false })
  @ApiQuery({ name: 'driverId',  required: false })
  @ApiQuery({ name: 'page',      required: false, type: Number })
  @ApiQuery({ name: 'limit',     required: false, type: Number })
  findAll(
    @Query('status')    status?:    TripStatus,
    @Query('vehicleId') vehicleId?: string,
    @Query('driverId')  driverId?:  string,
    @Query('page')      page?:      string,
    @Query('limit')     limit?:     string,
  ): Promise<{ items: Trip[]; total: number; page: number; limit: number }> {
    return this.service.findAll({
      status,
      vehicleId,
      driverId,
      page:  page  ? parseInt(page, 10)  : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /** Sefer detayı */
  @Get(':id')
  @ApiOperation({ summary: 'Sefer detayı' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Trip> {
    return this.service.findOne(id);
  }

  /** Seferi başlat (PLANLANMIS → YOLDA) */
  @Post(':id/start')
  @ApiOperation({ summary: 'Seferi başlat — yola çık. startKm opsiyonel: araç km sayacı' })
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StartTripDto,
  ): Promise<Trip> {
    return this.service.start(id, body.startKm);
  }

  /** Seferi tamamla (YOLDA → TAMAMLANDI) */
  @Post(':id/complete')
  @ApiOperation({ summary: 'Seferi tamamla — varışta kullanılır' })
  complete(
    @Param('id',     ParseUUIDPipe) id:  string,
    @Body() body: CompleteTripDto,
  ): Promise<Trip> {
    return this.service.complete(id, body.endKm);
  }

  /** Seferi iptal et */
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Seferi iptal et' })
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<Trip> {
    return this.service.cancel(id);
  }
}

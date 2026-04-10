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
import { TenantGuard } from '@enkap/database';
import { FuelService }    from './fuel.service';
import { CreateFuelDto }  from './dto/create-fuel.dto';
import type { FuelRecord } from './entities/fuel-record.entity';
import type { FuelStats }  from './fuel.service';

@ApiTags('Yakıt Kayıtları')
@ApiBearerAuth()
@Controller()
@UseGuards(TenantGuard)
export class FuelController {
  constructor(private readonly service: FuelService) {}

  /** Araç yakıt kaydı ekle */
  @Post('vehicles/:vehicleId/fuel')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Araç yakıt kaydı ekle' })
  create(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateFuelDto,
  ): Promise<FuelRecord> {
    return this.service.create(vehicleId, dto);
  }

  /** Araç yakıt geçmişi */
  @Get('vehicles/:vehicleId/fuel')
  @ApiOperation({ summary: 'Araç yakıt geçmişi' })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  findByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('limit')  limit?:  string,
    @Query('offset') offset?: string,
  ): Promise<{ data: FuelRecord[]; total: number }> {
    return this.service.findByVehicle(vehicleId, {
      limit:  limit  ? Number(limit)  : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /**
   * Araç yakıt istatistikleri
   *
   * Toplam litre, toplam tutar ve ortalama tüketim (lt/100km) döner.
   */
  @Get('vehicles/:vehicleId/fuel/stats')
  @ApiOperation({ summary: 'Araç yakıt istatistikleri' })
  getStats(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ): Promise<FuelStats> {
    return this.service.getStats(vehicleId);
  }
}

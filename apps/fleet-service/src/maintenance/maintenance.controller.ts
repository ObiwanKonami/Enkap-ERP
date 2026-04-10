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
import { MaintenanceService }    from './maintenance.service';
import { CreateMaintenanceDto }  from './dto/create-maintenance.dto';
import type { MaintenanceRecord } from './entities/maintenance-record.entity';

@ApiTags('Bakım Kayıtları')
@ApiBearerAuth()
@Controller()
@UseGuards(TenantGuard)
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  /** Araç bakım kaydı ekle */
  @Post('vehicles/:vehicleId/maintenance')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Araç bakım kaydı ekle' })
  create(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateMaintenanceDto,
  ): Promise<MaintenanceRecord> {
    return this.service.create(vehicleId, dto);
  }

  /** Araç bakım geçmişi */
  @Get('vehicles/:vehicleId/maintenance')
  @ApiOperation({ summary: 'Araç bakım geçmişi' })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  findByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('limit')  limit?:  string,
    @Query('offset') offset?: string,
  ): Promise<{ data: MaintenanceRecord[]; total: number }> {
    return this.service.findByVehicle(vehicleId, {
      limit:  limit  ? Number(limit)  : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /**
   * Yaklaşan bakımlar
   *
   * next_service_date alanı bugün + {days} gün içinde olan tüm araç bakımlarını döner.
   */
  @Get('maintenance/upcoming')
  @ApiOperation({ summary: 'Yaklaşan bakımlar (varsayılan: 30 gün)' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Kaç gün içindeki bakımlar' })
  getUpcoming(
    @Query('days') days?: string,
  ): Promise<MaintenanceRecord[]> {
    return this.service.getUpcoming(days ? Number(days) : undefined);
  }
}

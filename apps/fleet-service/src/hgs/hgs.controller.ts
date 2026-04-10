import {
  Controller, Post, Get, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TenantGuard } from '@enkap/database';
import { HgsService } from './hgs.service';
import { CreateHgsDto } from './dto/create-hgs.dto';

@ApiTags('HGS/OGS')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller()
export class HgsController {
  constructor(private readonly service: HgsService) {}

  /** Araç için HGS/OGS geçiş kaydı ekle */
  @Post('vehicles/:vehicleId/hgs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'HGS/OGS geçiş kaydı ekle' })
  create(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateHgsDto,
  ) {
    return this.service.create(vehicleId, dto);
  }

  /** Araç geçiş geçmişi */
  @Get('vehicles/:vehicleId/hgs')
  @ApiOperation({ summary: 'Araç HGS/OGS geçiş geçmişi' })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  findByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('limit')  limit?:  string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findByVehicle(vehicleId, {
      limit:  limit  ? Number(limit)  : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** Araç bazlı rapor (özet + aylık döküm) */
  @Get('vehicles/:vehicleId/hgs/report')
  @ApiOperation({ summary: 'Araç HGS/OGS raporu (özet + aylık döküm)' })
  getVehicleReport(@Param('vehicleId', ParseUUIDPipe) vehicleId: string) {
    return this.service.getVehicleReport(vehicleId);
  }

  /** Tenant geneli tüm geçişler */
  @Get('hgs')
  @ApiOperation({ summary: 'Tüm HGS/OGS geçişleri (isteğe bağlı araç filtresi)' })
  @ApiQuery({ name: 'vehicleId', required: false, type: String })
  @ApiQuery({ name: 'limit',     required: false, type: Number })
  @ApiQuery({ name: 'offset',    required: false, type: Number })
  findAll(
    @Query('vehicleId') vehicleId?: string,
    @Query('limit')     limit?:     string,
    @Query('offset')    offset?:    string,
  ) {
    return this.service.findAll({
      vehicleId,
      limit:  limit  ? Number(limit)  : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** Tenant geneli araç başına özet rapor */
  @Get('hgs/summary')
  @ApiOperation({ summary: 'Tenant geneli HGS/OGS özet (araç başına)' })
  getTenantSummary() {
    return this.service.getTenantSummary();
  }
}

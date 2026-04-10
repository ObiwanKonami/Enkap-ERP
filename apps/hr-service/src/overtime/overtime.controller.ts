import {
  Controller, Get, Post, Param, Body, Query, HttpCode, HttpStatus,
  ParseUUIDPipe, ParseIntPipe, DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan, getTenantContext } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { OvertimeService, FindOvertimeParams } from './overtime.service';
import { CreateOvertimeDto } from './dto/create-overtime.dto';

@ApiTags('overtime')
@ApiBearerAuth('JWT')
@Controller('overtime')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class OvertimeController {
  constructor(private readonly overtimeService: OvertimeService) {}

  @ApiOperation({ summary: 'Fazla mesai kaydı oluştur' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOvertimeDto) {
    return this.overtimeService.create(dto);
  }

  @ApiOperation({ summary: 'Fazla mesai kayıtlarını listele' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const params: FindOvertimeParams = { employeeId, status, startDate, endDate, limit, offset };
    return this.overtimeService.findAll(params);
  }

  @ApiOperation({ summary: 'Fazla mesai detayı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.overtimeService.findOne(id);
  }

  @ApiOperation({ summary: 'Fazla mesaiyi onayla' })
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    const { userId } = getTenantContext();
    return this.overtimeService.approve(id, userId);
  }

  @ApiOperation({ summary: 'Fazla mesaiyi reddet' })
  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string) {
    const { userId } = getTenantContext();
    return this.overtimeService.reject(id, userId);
  }
}

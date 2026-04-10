import {
  Controller, Get, Post, Param, Body, Query, HttpCode, HttpStatus,
  ParseUUIDPipe, BadRequestException, ParseIntPipe, DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan, getTenantContext } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { AdvanceService, FindAdvancesParams } from './advance.service';
import { CreateAdvanceDto } from './dto/create-advance.dto';

@ApiTags('advances')
@ApiBearerAuth('JWT')
@Controller('advances')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class AdvanceController {
  constructor(private readonly advanceService: AdvanceService) {}

  @ApiOperation({ summary: 'Yeni avans talebi oluştur' })
  @ApiResponse({ status: 201, description: 'Avans talebi oluşturuldu' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAdvanceDto) {
    return this.advanceService.create(dto);
  }

  @ApiOperation({ summary: 'Avans taleplerini listele' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAID', 'DEDUCTED'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const params: FindAdvancesParams = { employeeId, status, limit, offset };
    return this.advanceService.findAll(params);
  }

  @ApiOperation({ summary: 'Avans talebi detayı' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.advanceService.findOne(id);
  }

  @ApiOperation({ summary: 'Avans talebini onayla' })
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    const { userId } = getTenantContext();
    return this.advanceService.approve(id, userId);
  }

  @ApiOperation({ summary: 'Avans talebini reddet' })
  @ApiBody({ schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } })
  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    if (!reason?.trim()) {
      throw new BadRequestException('Red gerekçesi (reason) zorunludur.');
    }
    const { userId } = getTenantContext();
    return this.advanceService.reject(id, userId, reason.trim());
  }

  @ApiOperation({ summary: 'Avans ödendi işaretle' })
  @Post(':id/pay')
  markPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.advanceService.markPaid(id);
  }
}

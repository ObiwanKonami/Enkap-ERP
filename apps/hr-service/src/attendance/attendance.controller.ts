import {
  Controller, Get, Post, Param, Body, Query, HttpCode, HttpStatus,
  ParseUUIDPipe, ParseIntPipe, DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { AttendanceService, FindAttendanceParams } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';

@ApiTags('attendance')
@ApiBearerAuth('JWT')
@Controller('attendance')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @ApiOperation({ summary: 'Puantaj kaydı oluştur' })
  @ApiResponse({ status: 201 })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAttendanceDto) {
    return this.attendanceService.create(dto);
  }

  @ApiOperation({ summary: 'Puantaj kayıtlarını listele' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'startDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'endDate', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'attendanceType', required: false, enum: ['NORMAL', 'REMOTE', 'HALF_DAY', 'ABSENT', 'LEAVE', 'HOLIDAY'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('attendanceType') attendanceType?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const params: FindAttendanceParams = { employeeId, startDate, endDate, attendanceType, limit, offset };
    return this.attendanceService.findAll(params);
  }

  @ApiOperation({ summary: 'Puantaj kaydı detayı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attendanceService.findOne(id);
  }

  @ApiOperation({ summary: 'Çıkış saati kaydet' })
  @ApiBody({ schema: { type: 'object', properties: { checkOut: { type: 'string', format: 'date-time' } }, required: ['checkOut'] } })
  @Post(':id/check-out')
  checkOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('checkOut') checkOut: string,
  ) {
    return this.attendanceService.checkOut(id, checkOut);
  }
}

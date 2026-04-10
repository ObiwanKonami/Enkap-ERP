import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus,
  ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { TerminationService } from './termination.service';
import { CreateTerminationDto } from './dto/create-termination.dto';

@ApiTags('termination')
@ApiBearerAuth('JWT')
@Controller('termination')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class TerminationController {
  constructor(private readonly terminationService: TerminationService) {}

  @ApiOperation({ summary: 'İşten çıkış hesaplaması yap (kıdem/ihbar/izin)' })
  @ApiResponse({ status: 201, description: 'İşten çıkış detayları hesaplandı ve kaydedildi' })
  @ApiResponse({ status: 404, description: 'Çalışan bulunamadı' })
  @ApiResponse({ status: 409, description: 'Çalışan zaten işten çıkarılmış' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  calculate(@Body() dto: CreateTerminationDto) {
    return this.terminationService.calculate(dto);
  }

  @ApiOperation({ summary: 'İşten çıkış detayı (ID ile)' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.terminationService.findOne(id);
  }

  @ApiOperation({ summary: 'Çalışanın işten çıkış detayı' })
  @Get('employee/:employeeId')
  findByEmployee(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.terminationService.findByEmployee(employeeId);
  }
}

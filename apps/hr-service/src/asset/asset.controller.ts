import {
  Controller, Get, Post, Param, Body, Query, HttpCode, HttpStatus,
  ParseUUIDPipe, ParseIntPipe, DefaultValuePipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, FeatureGateGuard, RequiresPlan } from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { AssetService, FindAssetsParams } from './asset.service';
import { CreateAssetDto } from './dto/create-asset.dto';

@ApiTags('employee-assets')
@ApiBearerAuth('JWT')
@Controller('employee-assets')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI)
@RequiresPlan(Feature.HR)
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @ApiOperation({ summary: 'Zimmet ver (demirbaş ata)' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateAssetDto) {
    return this.assetService.create(dto);
  }

  @ApiOperation({ summary: 'Zimmet listesi' })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ASSIGNED', 'RETURNED', 'LOST'] })
  @ApiQuery({ name: 'assetCategory', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @Get()
  findAll(
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: string,
    @Query('assetCategory') assetCategory?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset = 0,
  ) {
    const params: FindAssetsParams = { employeeId, status, assetCategory, limit, offset };
    return this.assetService.findAll(params);
  }

  @ApiOperation({ summary: 'Zimmet detayı' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assetService.findOne(id);
  }

  @ApiOperation({ summary: 'Zimmet iade al' })
  @Post(':id/return')
  markReturned(@Param('id', ParseUUIDPipe) id: string) {
    return this.assetService.markReturned(id);
  }

  @ApiOperation({ summary: 'Zimmet kayıp/hasarlı işaretle' })
  @ApiBody({ schema: { type: 'object', properties: { notes: { type: 'string' } } } })
  @Post(':id/lost')
  markLost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes?: string,
  ) {
    return this.assetService.markLost(id, notes);
  }
}

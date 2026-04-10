import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  TenantGuard,
  RolesGuard,
  Roles,
  FeatureGateGuard,
  RequiresPlan,
} from '@enkap/database';
import { Role, Feature } from '@enkap/shared-types';
import { EBildirgeService } from './e-bildirge.service';

/**
 * SGK e-Bildirge Controller.
 *
 * GET /sgk/:year/:month/bildirge      → Bildirge verisi (JSON)
 * GET /sgk/:year/:month/bildirge/xml  → Bildirge XML (indirme)
 */
@ApiTags('sgk')
@ApiBearerAuth('JWT')
@Controller('sgk')
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.IK_YONETICISI, Role.MUHASEBECI)
@RequiresPlan(Feature.HR)
export class SgkController {
  constructor(private readonly eBildirgeService: EBildirgeService) {}

  /** e-Bildirge verilerini JSON olarak döner */
  @ApiOperation({ summary: 'SGK e-Bildirge verilerini JSON olarak getir' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 200, description: 'e-Bildirge verileri başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get(':year/:month/bildirge')
  getBildirge(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.eBildirgeService.generateBildirgePeriod(year, month);
  }

  /** e-Bildirge XML çıktısı (indirme) */
  @ApiOperation({ summary: 'SGK e-Bildirge XML dosyasını indir' })
  @ApiParam({ name: 'year', type: 'integer', example: 2026, description: 'Yıl' })
  @ApiParam({ name: 'month', type: 'integer', example: 3, description: 'Ay (1-12)' })
  @ApiResponse({ status: 200, description: 'e-Bildirge XML dosyası döndürüldü', content: { 'application/xml': {} } })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get(':year/:month/bildirge/xml')
  async getBildirgeXml(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const xml      = await this.eBildirgeService.generateXml(year, month);
    const filename = `EBildirge_${year}_${String(month).padStart(2, '0')}.xml`;

    void reply
      .header('Content-Type', 'application/xml; charset=UTF-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(xml);
  }
}

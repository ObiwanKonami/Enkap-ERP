import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  TenantGuard,
  RolesGuard,
  Roles,
} from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { BaBsService } from './ba-bs.service';
import { buildBaXml } from './ba-form.builder';
import { buildBsXml } from './bs-form.builder';

/**
 * Ba/Bs Form Controller.
 *
 * Endpoint'ler:
 *  GET /babs/:year/:month/ba      → Ba formu (JSON)
 *  GET /babs/:year/:month/ba/xml  → Ba formu (GİB XML)
 *  GET /babs/:year/:month/bs      → Bs formu (JSON)
 *  GET /babs/:year/:month/bs/xml  → Bs formu (GİB XML)
 *
 * Yetki: MUHASEBECI veya SISTEM_ADMIN
 */
@ApiTags('babs')
@ApiBearerAuth('JWT')
@Controller('babs')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class BaBsController {
  constructor(private readonly baBsService: BaBsService) {}

  /** Ba formu verilerini JSON olarak döner */
  @ApiOperation({ summary: 'Ba formu (JSON)', description: 'Belirtilen yıl ve ay için Ba formu (alış bildirimi) verilerini JSON formatında getirir' })
  @ApiParam({ name: 'year', description: 'Dönem yılı', example: 2026 })
  @ApiParam({ name: 'month', description: 'Dönem ayı (1-12)', example: 3 })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get(':year/:month/ba')
  getBa(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.baBsService.generateBa(year, month);
  }

  /** Ba formu GİB XML çıktısı (indirme) */
  @ApiOperation({ summary: 'Ba formu XML indir', description: 'Belirtilen dönem için Ba formu GİB XML formatında indirir' })
  @ApiParam({ name: 'year', description: 'Dönem yılı', example: 2026 })
  @ApiParam({ name: 'month', description: 'Dönem ayı (1-12)', example: 3 })
  @ApiResponse({ status: 200, description: 'GİB XML dosyası (application/xml)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get(':year/:month/ba/xml')
  async getBaXml(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const data = await this.baBsService.generateBa(year, month);
    const xml  = buildBaXml(data);
    const filename = `BA_${year}_${String(month).padStart(2, '0')}.xml`;

    void reply
      .header('Content-Type', 'application/xml; charset=UTF-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(xml);
  }

  /** Bs formu verilerini JSON olarak döner */
  @ApiOperation({ summary: 'Bs formu (JSON)', description: 'Belirtilen yıl ve ay için Bs formu (satış bildirimi) verilerini JSON formatında getirir' })
  @ApiParam({ name: 'year', description: 'Dönem yılı', example: 2026 })
  @ApiParam({ name: 'month', description: 'Dönem ayı (1-12)', example: 3 })
  @ApiResponse({ status: 200, description: 'Başarılı' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get(':year/:month/bs')
  getBs(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
  ) {
    return this.baBsService.generateBs(year, month);
  }

  /** Bs formu GİB XML çıktısı (indirme) */
  @ApiOperation({ summary: 'Bs formu XML indir', description: 'Belirtilen dönem için Bs formu GİB XML formatında indirir' })
  @ApiParam({ name: 'year', description: 'Dönem yılı', example: 2026 })
  @ApiParam({ name: 'month', description: 'Dönem ayı (1-12)', example: 3 })
  @ApiResponse({ status: 200, description: 'GİB XML dosyası (application/xml)' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get(':year/:month/bs/xml')
  async getBsXml(
    @Param('year',  ParseIntPipe) year:  number,
    @Param('month', ParseIntPipe) month: number,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const data = await this.baBsService.generateBs(year, month);
    const xml  = buildBsXml(data);
    const filename = `BS_${year}_${String(month).padStart(2, '0')}.xml`;

    void reply
      .header('Content-Type', 'application/xml; charset=UTF-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(xml);
  }
}

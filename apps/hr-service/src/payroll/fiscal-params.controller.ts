import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PlatformAdminGuard } from '@enkap/database';
import { FiscalParamsService, FiscalParams } from './fiscal-params.service';

/** Platform admin tarafından gönderilecek güncelleme DTO'su */
export interface UpdateFiscalParamsDto {
  minWageKurus:         number;
  sgkCeilingKurus:      number;
  sgkWorkerRate:        number;
  unemploymentWorker:   number;
  sgkEmployerRate:      number;
  unemploymentEmployer: number;
  stampTaxRate:         number;
  gvBrackets:           Array<{ limitKurus: number; rate: number }>;
  disabilityDeductions: Record<1 | 2 | 3, number>;
}

/**
 * Yasal bordro parametreleri yönetimi.
 * Platform admin endpoint'leri — TenantGuard yoktur, sadece JWT gereklidir.
 */
@ApiTags('fiscal-params')
@ApiBearerAuth('JWT')
@Controller('payroll/fiscal-params')
@UseGuards(PlatformAdminGuard)
export class FiscalParamsController {
  private readonly logger = new Logger(FiscalParamsController.name);

  constructor(private readonly fiscalParamsService: FiscalParamsService) {}

  /**
   * GET /payroll/fiscal-params/:year
   * Belirtilen yıl için yasal bordro parametrelerini döndürür.
   * Yıl bulunamazsa bir önceki yıl veya 2025 fallback değerleri döner.
   */
  @ApiOperation({ summary: 'Yıla göre yasal bordro parametrelerini getir' })
  @ApiParam({ name: 'year', type: 'integer', example: 2025, description: 'Yıl' })
  @ApiResponse({ status: 200, description: 'Yasal parametreler başarıyla döndürüldü' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get(':year')
  getForYear(@Param('year', ParseIntPipe) year: number): Promise<FiscalParams> {
    return this.fiscalParamsService.getForYear(year);
  }

  /**
   * PUT /payroll/fiscal-params/:year
   * Belirtilen yıl için yasal bordro parametrelerini günceller veya oluşturur.
   * Platform admin yetkisi gerektirir.
   */
  @ApiOperation({ summary: 'Yıla göre yasal bordro parametrelerini güncelle (upsert)' })
  @ApiParam({ name: 'year', type: 'integer', example: 2025, description: 'Yıl' })
  @ApiResponse({ status: 200, description: 'Yasal parametreler başarıyla güncellendi' })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Put(':year')
  async updateForYear(
    @Param('year', ParseIntPipe) year: number,
    @Body() dto: UpdateFiscalParamsDto,
  ): Promise<FiscalParams> {
    this.logger.log(`Yasal parametreler güncelleniyor: yıl=${year}`);
    return this.fiscalParamsService.upsert(year, dto);
  }
}

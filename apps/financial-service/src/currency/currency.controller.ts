import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import type { SupportedCurrency } from '@enkap/shared-types';
import { CurrencyService } from './currency.service';
import { SetRateDto } from './dto/set-rate.dto';

/** Frontend ExchangeRate tipiyle uyumlu yanıt nesnesi */
interface ExchangeRateResponse {
  id:        string;
  tenantId:  string;
  currency:  string;
  date:      string;
  buyRate:   number;
  sellRate:  number;
  source:    string;
  createdAt: string;
}

/** Frontend CurrentRates tipiyle uyumlu yanıt nesnesi */
interface CurrentRatesResponse {
  date:  string;
  rates: Array<{
    currency: string;
    buyRate:  number;
    sellRate: number;
    source:   string;
  }>;
}

/**
 * Döviz kuru yönetimi uç noktaları.
 *
 * TCMB kurları her gün 09:30'da otomatik güncellenir.
 * Manuel kur girişi muhasebeci yetkisi gerektirir.
 */
@ApiTags('currency')
@ApiBearerAuth('JWT')
@Controller('currency')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  /**
   * Belirli dönem için kur listesi.
   */
  @ApiOperation({ summary: 'Kur listesi' })
  @ApiQuery({ name: 'currency', required: false, enum: ['USD', 'EUR', 'GBP', 'SAR', 'AED'] })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate',   required: false, example: '2026-03-31' })
  @ApiResponse({ status: 200 })
  @Get('rates')
  async listRates(
    @Query('currency') currency?: SupportedCurrency,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
  ): Promise<{ data: ExchangeRateResponse[]; total: number }> {
    const records = await this.currencyService.listRates(currency, startDate, endDate);
    const data    = records.map((r) => this.toResponse(r));
    return { data, total: data.length };
  }

  /**
   * Tüm desteklenen para birimleri için güncel kurlar.
   */
  @ApiOperation({ summary: 'Güncel kurlar' })
  @ApiResponse({ status: 200 })
  @Get('rates/current')
  async getCurrentRates(): Promise<CurrentRatesResponse> {
    const records = await this.currencyService.getCurrentRates();
    const date    = records[0]?.date ?? new Date().toISOString().slice(0, 10);

    return {
      date,
      rates: records.map((r) => ({
        currency: r.currency,
        buyRate:  r.rateToTry,
        sellRate: r.rateToTry,
        source:   r.source,
      })),
    };
  }

  /**
   * Manuel kur girişi.
   */
  @ApiOperation({ summary: 'Manuel kur girişi' })
  @ApiResponse({ status: 201 })
  @Post('rates/manual')
  @HttpCode(HttpStatus.CREATED)
  async setManualRate(
    @Body() dto: SetRateDto,
    @Request() req: { user?: { sub?: string } },
  ): Promise<ExchangeRateResponse> {
    const userId = req.user?.sub ?? 'system';
    const record = await this.currencyService.setManualRate(
      dto.currency,
      dto.buyRate,
      dto.date,
      userId,
    );
    return this.toResponse(record);
  }

  /**
   * TCMB'den canlı kur çekimi.
   */
  @ApiOperation({ summary: 'TCMB kur yenileme' })
  @ApiResponse({ status: 200 })
  @Post('rates/refresh')
  @HttpCode(HttpStatus.OK)
  async refreshFromTcmb(): Promise<{ updated: number; date: string }> {
    const saved = await this.currencyService.refreshFromTcmb();
    return {
      updated: saved.length,
      date:    new Date().toISOString().slice(0, 10),
    };
  }

  private toResponse(r: {
    id: string; tenantId: string; currency: string;
    rateToTry: number; source: string; date: string; createdAt: Date;
  }): ExchangeRateResponse {
    return {
      id:        r.id,
      tenantId:  r.tenantId,
      currency:  r.currency,
      date:      r.date,
      buyRate:   r.rateToTry,
      sellRate:  r.rateToTry,
      source:    r.source,
      createdAt: r.createdAt.toISOString(),
    };
  }
}

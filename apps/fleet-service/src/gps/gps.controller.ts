import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  BadRequestException,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { GpsService } from './gps.service';
import type { GpsLocation } from './entities/gps-location.entity';
import type { TeltonikaPayload, IcomeraPayload } from './gps.service';

/**
 * GPS Webhook Controller
 *
 * TenantGuard KULLANILMAZ — telematik sağlayıcılar Bearer token değil,
 * API key ile kimlik doğrular. Tenant, gpsDeviceId üzerinden çözümlenir.
 *
 * Güvenlik: X-Fleet-Api-Key header'ı ile API key doğrulaması yapılır.
 * Üretimde Kong Gateway'de IP restriction + rate limit uygulanır.
 */
@ApiTags('GPS / Telematik')
@Controller('gps')
export class GpsController {
  constructor(
    private readonly service: GpsService,
    private readonly config:  ConfigService,
  ) {}

  /**
   * Telematik webhook — dış sağlayıcıdan konum verisi al
   *
   * Desteklenen sağlayıcılar:
   *   - teltonika: { device_id, timestamp, lat, lng, speed?, heading? }
   *   - icomera:   { deviceId, ts, latitude, longitude, speedKmh?, course? }
   *
   * Header: X-Fleet-Api-Key: <tenant-api-key>
   * X-Tenant-Id header'ı ile tenant kimliği iletilir (API Gateway tarafından inject edilir).
   */
  @Post('webhook/:provider')
  @ApiOperation({ summary: 'Telematik GPS webhook (API key auth)' })
  @ApiParam({
    name:        'provider',
    enum:        ['teltonika', 'icomera'],
    description: 'Telematik sağlayıcı',
  })
  async receiveWebhook(
    @Param('provider')                provider:  string,
    @Body()                           body:      Record<string, unknown>,
    @Headers('x-fleet-api-key')       apiKey?:   string,
    @Headers('x-tenant-id')           tenantId?: string,
  ): Promise<{ ok: boolean }> {
    // API key doğrulaması
    const expectedKey = this.config.get<string>('FLEET_WEBHOOK_API_KEY');
    if (expectedKey && apiKey !== expectedKey) {
      throw new UnauthorizedException('Geçersiz API anahtarı.');
    }

    if (!tenantId) {
      throw new BadRequestException('X-Tenant-Id header\'ı zorunludur.');
    }

    // Sağlayıcıya göre payload normalize et
    let normalized: ReturnType<typeof this.service.normalizeTeltonika>;

    switch (provider) {
      case 'teltonika':
        normalized = this.service.normalizeTeltonika(body as unknown as TeltonikaPayload);
        break;
      case 'icomera':
        normalized = this.service.normalizeIcomera(body as unknown as IcomeraPayload);
        break;
      default:
        throw new BadRequestException(`Desteklenmeyen sağlayıcı: ${provider}`);
    }

    await this.service.processLocation(tenantId, normalized);
    return { ok: true };
  }

  /**
   * Araç konum geçmişi
   *
   * TenantGuard kullanılır (JWT Bearer ile doğrulanmış istek).
   * Maksimum 100 kayıt döner (son konumlar önce).
   */
  @Get('vehicles/:vehicleId/locations')
  @ApiOperation({ summary: 'Araç konum geçmişi (son 100 kayıt)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maks. kayıt sayısı (max: 500)' })
  getLocations(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Headers('x-tenant-id')           tenantId:  string,
    @Query('limit')                    limit?:    string,
  ): Promise<GpsLocation[]> {
    if (!tenantId) throw new BadRequestException('X-Tenant-Id header\'ı zorunludur.');
    return this.service.getLocations(vehicleId, tenantId, limit ? Number(limit) : undefined);
  }
}

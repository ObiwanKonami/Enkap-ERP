import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformSettingsService } from './platform-settings.service';

/** Platform ayarları güncelleme DTO */
interface UpdatePlatformSettingsDto {
  trialDays?:     number;
  dunningDelays?: number[];
}

/**
 * Platform genelinde geçerli ayarları yönetir.
 * TenantGuard kullanılmaz — platform admin erişimi.
 */
@ApiTags('Platform Ayarları')
@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  /** Mevcut platform ayarlarını döndürür */
  @Get()
  @ApiOperation({ summary: 'Platform ayarlarını getir' })
  async getAll() {
    const trialDays     = await this.settings.get<number>('trial_days', 14);
    const dunningDelays = await this.settings.get<number[]>('dunning_delays', [3, 7, 14]);
    return { trialDays, dunningDelays };
  }

  /** Platform ayarlarını günceller */
  @Put()
  @ApiOperation({ summary: 'Platform ayarlarını güncelle' })
  async updateAll(@Body() dto: UpdatePlatformSettingsDto) {
    if (dto.trialDays !== undefined) {
      await this.settings.set('trial_days', dto.trialDays);
    }
    if (dto.dunningDelays !== undefined) {
      await this.settings.set('dunning_delays', dto.dunningDelays);
    }
    return { ok: true };
  }
}

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
  ApiProperty,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import { EdEfterService } from './edefter.service';
import { DonemDto } from './dto/donem.dto';

// ─── DTO — controller'dan önce tanımlanmalı (emitDecoratorMetadata zorunluluğu) ──

class GonderDto {
  @ApiProperty({ description: 'Dönem yılı (2020-2099)', example: 2026 })
  yil!: number;

  @ApiProperty({ description: 'Dönem ayı (1-12)', example: 3 })
  ay!: number;

  /** 10 haneli Vergi Kimlik Numarası */
  @ApiProperty({ description: '10 haneli Vergi Kimlik Numarası (VKN)', example: '1234567890' })
  vkn!: string;

  /** Şirket ticaret unvanı */
  @ApiProperty({ description: 'Şirket ticaret unvanı', example: 'Örnek A.Ş.' })
  unvan!: string;
}

/**
 * e-Defter API endpoint'leri.
 *
 * Tüm endpoint'ler TenantGuard + RolesGuard koruması altında.
 * Muhasebeci rolü gerektirir.
 */
@ApiTags('edefter')
@ApiBearerAuth('JWT')
@Controller('edefter')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.MUHASEBECI)
export class EdEfterController {
  constructor(private readonly edEfterService: EdEfterService) {}

  /**
   * Dönem için e-Defter XML önizlemesi üretir.
   * GİB'e göndermez — doğrulama ve kontrol için.
   *
   * GET /edefter/onizle?yil=2024&ay=6
   */
  @ApiOperation({ summary: 'e-Defter XML önizleme', description: 'Dönem için e-Defter XML önizlemesi üretir. GİB\'e göndermez — doğrulama ve kontrol amaçlıdır' })
  @ApiQuery({ name: 'yil', required: true, description: 'Dönem yılı (2020-2099)', example: '2026' })
  @ApiQuery({ name: 'ay', required: true, description: 'Dönem ayı (1-12)', example: '3' })
  @ApiResponse({ status: 200, description: 'Başarılı — XML önizleme ve mizan özeti döner' })
  @ApiResponse({ status: 400, description: 'Geçersiz yıl veya ay değeri' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Get('onizle')
  async onizle(
    @Query('yil') yil: string,
    @Query('ay') ay: string,
  ) {
    const donem = this.parseDonem(yil, ay);

    const vkn   = 'PLACEHOLDER_VKN';   // TODO: tenant profilinden al
    const unvan = 'PLACEHOLDER_UNVAN'; // TODO: tenant profilinden al

    const result = await this.edEfterService.processEdEfter(
      donem,
      vkn,
      unvan,
      false, // submit = false
    );

    return {
      donem:          result.donem,
      mizan:          result.mizan,
      yevmiyeXmlSize: result.yevmiyeXml.length,
      buyukDefterXmlSize: result.buyukDefterXml.length,
      // XML içeriği büyük olabilir — production'da storage'a yaz, URL dön
      yevmiyeXml:     result.yevmiyeXml.slice(0, 500) + '... [kısaltıldı]',
    };
  }

  /**
   * Dönem e-Defterini GİB'e gönderir.
   * Mizan dengeli değilse 400 döner.
   *
   * POST /edefter/gonder
   * Body: { yil: number, ay: number, vkn: string, unvan: string }
   */
  @ApiOperation({ summary: 'e-Defter GİB\'e gönder', description: 'Dönem e-Defterini GİB\'e gönderir. Mizan dengeli değilse 400 döner. VKN 10 haneli ve şirket ünvanı zorunludur' })
  @ApiResponse({ status: 200, description: 'e-Defter başarıyla GİB\'e gönderildi' })
  @ApiResponse({ status: 400, description: 'Geçersiz VKN, eksik ünvan veya dengesiz mizan' })
  @ApiResponse({ status: 401, description: 'Yetkisiz erişim' })
  @Post('gonder')
  @HttpCode(HttpStatus.OK)
  async gonder(
    @Body() body: GonderDto,
  ) {
    const donem = this.parseDonem(
      String(body.yil),
      String(body.ay),
    );

    if (!body.vkn || body.vkn.length !== 10) {
      throw new BadRequestException('VKN 10 haneli olmalıdır.');
    }

    if (!body.unvan?.trim()) {
      throw new BadRequestException('Şirket ünvanı zorunludur.');
    }

    const result = await this.edEfterService.processEdEfter(
      donem,
      body.vkn,
      body.unvan,
      true, // submit = true → GİB'e gönder
    );

    return {
      success:     result.submitted,
      donem:       result.donem,
      submittedAt: result.submittedAt,
      mizan:       result.mizan,
      gibResponse: result.gibResponse,
    };
  }

  // ─── Özel yardımcılar ──────────────────────────────────────────────────

  private parseDonem(yilStr: string, ayStr: string): DonemDto {
    const yil = parseInt(yilStr, 10);
    const ay  = parseInt(ayStr, 10);

    if (isNaN(yil) || yil < 2020 || yil > 2099) {
      throw new BadRequestException('Geçersiz yıl. 2020-2099 arasında olmalıdır.');
    }
    if (isNaN(ay) || ay < 1 || ay > 12) {
      throw new BadRequestException('Geçersiz ay. 1-12 arasında olmalıdır.');
    }

    const dto = new DonemDto();
    dto.yil = yil;
    dto.ay  = ay;
    return dto;
  }
}

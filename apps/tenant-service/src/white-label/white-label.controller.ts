import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { WhiteLabelService } from './white-label.service';

// ── DTO Sınıfları ────────────────────────────────────────────────────────────

class UpsertWhiteLabelBodyDto {
  @ApiPropertyOptional({
    example: 'acme',
    description: 'Özel subdomain (acme.enkap.com.tr). 3-63 küçük harf/rakam/tire.',
  })
  subdomain?: string | null;

  @ApiPropertyOptional({
    example: 'erp.acmecorp.com.tr',
    description: 'Tam özel domain. CNAME → api.enkap.com.tr kurulumu gerekir.',
  })
  customDomain?: string | null;

  @ApiPropertyOptional({ example: 'Acme ERP', description: 'Uygulamada görünen marka adı' })
  brandName?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.acme.com/logo.png', description: 'Logo URL' })
  logoUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.acme.com/favicon.ico', description: 'Favicon URL' })
  faviconUrl?: string | null;

  @ApiPropertyOptional({ example: '#1a73e8', description: 'Ana renk (hex)' })
  primaryColor?: string;

  @ApiPropertyOptional({ example: '#ea4335', description: 'İkincil renk (hex)' })
  secondaryColor?: string;

  @ApiPropertyOptional({ example: 'destek@acmecorp.com.tr', description: 'Destek e-postası' })
  supportEmail?: string | null;

  @ApiPropertyOptional({ example: '+90 212 000 00 00', description: 'Destek telefonu' })
  supportPhone?: string | null;
}

/**
 * White Label konfigürasyon endpointleri.
 *
 * JWT doğrulaması Kong seviyesinde yapılır — bu servis Bearer token'ı
 * doğrulamaz, routing bilgisi olarak kullanır.
 * Domain çözümleme endpointleri (/resolve/*) public — Kong Lua script'i kullanır.
 */
@ApiTags('white-label')
@Controller('white-label')
export class WhiteLabelController {
  constructor(private readonly whiteLabelService: WhiteLabelService) {}

  // ── Tenant konfigürasyon yönetimi (Bearer JWT gerekli — Kong doğrular) ──

  @Get('config/:tenantId')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'White label konfigürasyonunu getir' })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Konfigürasyon' })
  @ApiResponse({ status: 401, description: 'JWT gerekli' })
  @ApiResponse({ status: 404, description: 'Konfigürasyon bulunamadı' })
  async getConfig(@Param('tenantId') tenantId: string) {
    return this.whiteLabelService.getConfig(tenantId);
  }

  @Put('config/:tenantId')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'White label konfigürasyonunu güncelle (upsert)',
    description: 'Konfigürasyon yoksa oluşturur, varsa günceller.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Konfigürasyon güncellendi' })
  @ApiResponse({ status: 400, description: 'Geçersiz subdomain/domain/renk' })
  @ApiResponse({ status: 401, description: 'JWT gerekli' })
  @ApiResponse({ status: 409, description: 'Subdomain veya domain başka tenant tarafından kullanılıyor' })
  async upsertConfig(
    @Param('tenantId') tenantId: string,
    @Body() body: UpsertWhiteLabelBodyDto,
  ) {
    return this.whiteLabelService.upsertConfig(tenantId, body);
  }

  @Post('config/:tenantId/verify-domain')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Özel domain DNS doğrulamasını başlat',
    description:
      'DNS TXT kaydı talimatlarını döner. ' +
      'Kayıt eklendikten sonra tekrar çağırınca doğrulama yapılır.',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        verified: false,
        message: 'DNS TXT kaydı ekleyin: _enkap-verify.erp.acme.com = abc123...',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Özel domain tanımlı değil' })
  @ApiResponse({ status: 401, description: 'JWT gerekli' })
  async verifyDomain(@Param('tenantId') tenantId: string) {
    return this.whiteLabelService.verifyDomain(tenantId);
  }

  // ── Domain çözümleme (Kong / Frontend için — public) ────────────────────

  @Get('resolve/subdomain')
  @ApiOperation({
    summary: 'Subdomain\'den tenant bul',
    description:
      'Kong pre-function Lua script veya web frontend tarafından kullanılır. ' +
      'Gelen istek hangi tenant\'a ait olduğunu belirler.',
  })
  @ApiQuery({ name: 'subdomain', description: 'Subdomain değeri (örn: acme)', required: true })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        tenantId:       'uuid',
        brandName:      'Acme ERP',
        logoUrl:        'https://cdn.acme.com/logo.png',
        primaryColor:   '#1a73e8',
        secondaryColor: '#ea4335',
      },
    },
  })
  async resolveSubdomain(@Query('subdomain') subdomain: string) {
    return this.whiteLabelService.findBySubdomain(subdomain);
  }

  @Get('resolve/domain')
  @ApiOperation({
    summary: 'Özel domain\'den tenant bul',
    description: 'Yalnızca DNS doğrulaması tamamlanmış domainler döner.',
  })
  @ApiQuery({ name: 'domain', description: 'Tam domain (örn: erp.acmecorp.com.tr)', required: true })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        tenantId:       'uuid',
        brandName:      'Acme ERP',
        logoUrl:        null,
        primaryColor:   '#0f172a',
        secondaryColor: '#3b82f6',
      },
    },
  })
  async resolveDomain(@Query('domain') domain: string) {
    return this.whiteLabelService.findByCustomDomain(domain);
  }
}

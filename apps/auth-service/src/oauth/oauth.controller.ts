import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { OAuthService, VALID_SCOPES } from './oauth.service';
import type { JwtPayload } from '@enkap/shared-types';
import { CurrentUser } from './current-user.decorator';

// ── DTO Sınıfları ────────────────────────────────────────────────────────────

class CreateApiClientDto {
  @ApiProperty({ example: 'Trendyol Entegrasyonu', description: 'API istemcisi görünen adı' })
  name!: string;

  @ApiProperty({
    example: ['invoices:read', 'stock:read'],
    description: `Talep edilen yetkiler. İzin verilenler: ${VALID_SCOPES.join(', ')}`,
    isArray: true,
    type: String,
  })
  scopes!: string[];
}

class TokenRequestDto {
  @ApiProperty({ example: 'client_credentials', description: 'OAuth2 grant type' })
  grant_type!: string;

  @ApiProperty({ example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'API İstemci ID' })
  client_id!: string;

  @ApiProperty({ example: 'supersecret...', description: 'API İstemci Secret (oluşturma anında verilen)' })
  client_secret!: string;

  @ApiPropertyOptional({ example: 'invoices:read stock:read', description: 'Boşlukla ayrılmış scope listesi (opsiyonel)' })
  scope?: string;
}

/**
 * OAuth2 / API Marketplace endpointleri.
 *
 * İki grup:
 *  1. /token — Herkese açık, client credentials ile token alır
 *  2. /clients — JWT korumalı, insan kullanıcı kendi API istemcilerini yönetir
 */
@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  // ── Token endpoint (public) ─────────────────────────────────────────────

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'API erişim tokeni al (client_credentials)',
    description:
      'Otomasyon araçları ve entegrasyonlar için OAuth2 client credentials grant. ' +
      'Verilen token 24 saat geçerlidir.',
  })
  @ApiBody({ type: TokenRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Token başarıyla verildi',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        token_type: 'Bearer',
        expires_in: 86400,
        scope: 'invoices:read stock:read',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Geçersiz grant_type veya parametre eksik' })
  @ApiResponse({ status: 401, description: 'Geçersiz client_id veya client_secret' })
  async token(@Body() body: TokenRequestDto) {
    return this.oauthService.issueToken({
      grantType:    body.grant_type,
      clientId:     body.client_id,
      clientSecret: body.client_secret,
      scope:        body.scope,
    });
  }

  // ── API İstemci Yönetimi (JWT gerekli) ─────────────────────────────────

  @Post('clients')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Yeni API istemcisi oluştur',
    description:
      'client_secret yalnızca bu yanıtta gösterilir — sonra erişilemez. ' +
      'Tenant başına en fazla 10 aktif API istemcisi oluşturulabilir.',
  })
  @ApiBody({ type: CreateApiClientDto })
  @ApiResponse({
    status: 201,
    description: 'API istemcisi oluşturuldu',
    schema: {
      example: {
        clientId:     'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        clientSecret: 'a3b4c5d6...ONCE_ONLY',
        name:         'Trendyol Entegrasyonu',
        scopes:       ['invoices:read', 'stock:read'],
        createdAt:    '2026-03-19T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Geçersiz scope' })
  @ApiResponse({ status: 401, description: 'JWT gerekli' })
  @ApiResponse({ status: 409, description: 'Maks. istemci sayısına ulaşıldı (10)' })
  async createClient(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateApiClientDto,
  ) {
    return this.oauthService.createApiClient({
      tenantId: user.tenant_id,
      name:     body.name,
      scopes:   body.scopes,
    });
  }

  @Get('clients')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Tenant API istemcilerini listele' })
  @ApiResponse({
    status: 200,
    description: 'API istemcisi listesi',
    schema: {
      example: [
        {
          id:           'uuid',
          client_id:    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          name:         'Trendyol Entegrasyonu',
          scopes:       ['invoices:read'],
          status:       'active',
          last_used_at: '2026-03-19T08:30:00.000Z',
          created_at:   '2026-03-01T00:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'JWT gerekli' })
  async listClients(@CurrentUser() user: JwtPayload) {
    return this.oauthService.listApiClients(user.tenant_id);
  }

  @Delete('clients/:clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'API istemcisini iptal et' })
  @ApiParam({ name: 'clientId', description: 'API İstemci UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'API istemcisi iptal edildi' })
  @ApiResponse({ status: 401, description: 'JWT gerekli' })
  @ApiResponse({ status: 404, description: 'İstemci bulunamadı' })
  async revokeClient(
    @CurrentUser() user: JwtPayload,
    @Param('clientId') clientId: string,
  ) {
    await this.oauthService.revokeApiClient(user.tenant_id, clientId);
  }
}

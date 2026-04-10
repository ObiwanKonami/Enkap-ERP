import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import type { FastifyRequest } from 'fastify';
import type { PlatformJwtPayload } from '@enkap/shared-types';
import { PlatformAdminService } from './platform-admin.service';
import type { ValidatedPlatformAdmin } from './platform-local.strategy';

class PlatformLoginDto {
  /** @example platform@enkap.com.tr */
  @IsEmail()
  email!: string;

  /** @example ••••••••  */
  @IsNotEmpty()
  @IsString()
  password!: string;
}

class PlatformRefreshDto {
  @IsNotEmpty()
  @IsString()
  refreshToken!: string;
}

/**
 * Platform (SaaS) admin kimlik doğrulama endpoint'leri.
 *
 * Tenant endpoint'lerinden ayrı tutulur:
 *  - tenantSlug gerektirmez
 *  - Üretilen token'lar `aud: 'platform-api'` taşır
 *  - Yalnızca `platform_admins` tablosundaki kullanıcılar giriş yapabilir
 */
@ApiTags('platform-auth')
@Controller('auth/platform')
export class PlatformAdminController {
  constructor(private readonly platformService: PlatformAdminService) {}

  @ApiOperation({ summary: 'Platform admin girişi' })
  @ApiBody({ type: PlatformLoginDto })
  @ApiResponse({ status: 200, description: 'Platform admin token çifti.' })
  @ApiResponse({ status: 401, description: 'Geçersiz kimlik bilgileri.' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('platform-local'))
  async login(
    @Request() req: FastifyRequest & { user: ValidatedPlatformAdmin },
    @Body() _dto: PlatformLoginDto,
  ) {
    const result = await this.platformService.login(req.user);

    return {
      accessToken:  result.tokenPair.accessToken,
      refreshToken: result.tokenPair.refreshToken,
      expiresIn:    result.tokenPair.expiresIn,
      tokenType:    'Bearer',
      adminId:      result.adminId,
      email:        result.email,
      platformRole: result.platformRole,
    };
  }

  @ApiOperation({ summary: 'Platform admin token yenileme' })
  @ApiBody({ type: PlatformRefreshDto })
  @ApiResponse({ status: 200, description: 'Yeni token çifti.' })
  @ApiResponse({ status: 401, description: 'Refresh token geçersiz.' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: PlatformRefreshDto) {
    if (!dto.refreshToken) {
      throw new UnauthorizedException('refreshToken zorunludur.');
    }

    const tokenPair = await this.platformService.refresh(dto.refreshToken);

    return {
      accessToken:  tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn:    tokenPair.expiresIn,
      tokenType:    'Bearer',
    };
  }

  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Platform admin çıkışı' })
  @ApiResponse({ status: 204, description: 'Çıkış başarılı.' })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('platform-jwt'))
  async logout(
    @Request() req: FastifyRequest & { user: PlatformJwtPayload },
  ) {
    await this.platformService.logout(req.user.jti, req.user.session_id);
  }
}

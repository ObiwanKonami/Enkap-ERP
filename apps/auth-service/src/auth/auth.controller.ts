import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import type { JwtPayload } from '@enkap/shared-types';
import { AuthService }              from './auth.service';
import { PasswordResetService }     from './password-reset.service';
import { EmailVerificationService } from './email-verification.service';

class LoginDto {
  /** @example admin@sirket.com */
  @IsEmail()
  email!: string;
  /** @example ••••••••  */
  @IsString()
  password!: string;
  /** @example acme-corp */
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

class RefreshDto {
  /** Mevcut refresh token */
  @IsString()
  refreshToken!: string;
  /** Tenant UUID'si */
  @IsString()
  tenantId!: string;
}

class LogoutDto {
  /** Tenant UUID'si */
  @IsString()
  tenantId!: string;
}

class ForgotPasswordDto {
  /** @example admin@sirket.com */
  @IsEmail()
  email!: string;
  /** @example acme-corp */
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

class ResetPasswordDto {
  /** Şifre sıfırlama e-postasındaki token */
  @IsString()
  token!: string;
  /** Yeni şifre (en az 8 karakter) */
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

class ResendVerificationDto {
  /** @example admin@sirket.com */
  @IsEmail()
  email!: string;
  /** @example acme-corp */
  @IsOptional()
  @IsString()
  tenantSlug?: string;
}

/**
 * Kimlik doğrulama REST endpoint'leri.
 *
 * Endpoint'ler:
 *  POST /api/v1/auth/login    → Giriş (access + refresh token)
 *  POST /api/v1/auth/refresh  → Token yenileme (rotasyon)
 *  POST /api/v1/auth/logout   → Çıkış (token'ları geçersiz kıl)
 *
 * Güvenlik notları:
 *  - Refresh token response body'de dönüyor (mobil uygulama için).
 *    Web için HttpOnly cookie tercih edilmeli (ayrı web endpoint'i).
 *  - Rate limiting: Kong API Gateway seviyesinde uygulanır
 *    (5 login denemesi / dakika / IP)
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:              AuthService,
    private readonly passwordResetService:     PasswordResetService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  /**
   * Kullanıcı girişi.
   * LocalStrategy kimlik bilgilerini doğrular, ardından token çifti üretilir.
   */
  @ApiOperation({ summary: 'Kullanıcı girişi', description: 'E-posta ve şifre ile JWT access + refresh token çifti alır.' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Giriş başarılı — access + refresh token döner.' })
  @ApiResponse({ status: 401, description: 'Geçersiz e-posta, şifre veya tenant.' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  async login(
    @Request() req: FastifyRequest & { user: Parameters<AuthService['login']>[0] },
    @Body() _dto: LoginDto, // Passport zaten işledi, body'ye dokunma
  ) {
    const result = await this.authService.login(req.user);

    return {
      accessToken:  result.tokenPair.accessToken,
      refreshToken: result.tokenPair.refreshToken,
      expiresIn:    result.tokenPair.expiresIn,
      tokenType:    'Bearer',
      userId:       result.userId,
      tenantId:     result.tenantId,
      tenantTier:   result.tenantTier,
      roles:        result.roles,
    };
  }

  /**
   * Refresh token ile access token yenileme.
   * Eski refresh token geçersiz olur, yeni çift döner.
   */
  @ApiOperation({ summary: 'Token yenileme', description: 'Refresh token rotasyonu — eski token geçersiz olur, yeni access + refresh çifti döner.' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, description: 'Yeni token çifti döndü.' })
  @ApiResponse({ status: 401, description: 'Refresh token geçersiz veya süresi dolmuş.' })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto) {
    if (!dto.refreshToken || !dto.tenantId) {
      throw new UnauthorizedException('refreshToken ve tenantId zorunludur.');
    }

    const tokenPair = await this.authService.refresh(
      dto.refreshToken,
      dto.tenantId,
    );

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * Çıkış: mevcut oturumu ve tüm token'ları geçersiz kılar.
   */
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Çıkış yap', description: 'Mevcut JWT oturumunu ve tüm token\'ları geçersiz kılar.' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 204, description: 'Çıkış başarılı.' })
  @ApiResponse({ status: 401, description: 'Geçersiz veya eksik JWT token.' })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Request()
    req: FastifyRequest & { user: JwtPayload },
    @Body() _dto: LogoutDto,
  ) {
    await this.authService.logout(
      req.user.jti,
      req.user.tenant_id,
      req.user.session_id,
    );
    // 204 No Content — body yok
  }

  /**
   * Şifre sıfırlama e-postası gönderir.
   *
   * Güvenlik: kullanıcı bulunsun ya da bulunmasın 200 döner
   * (bilgi sızdırmama prensibi).
   */
  @ApiTags('password')
  @ApiOperation({ summary: 'Şifre sıfırlama isteği', description: 'Kayıtlı e-postaya şifre sıfırlama bağlantısı gönderir. Bilgi sızdırmama prensibi gereği kullanıcı bulunsun ya da bulunmasın 200 döner.' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Şifre sıfırlama e-postası gönderildi (ya da sessizce yok sayıldı).' })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.passwordResetService.requestReset(dto.email, dto.tenantSlug ?? '');
    return { message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.' };
  }

  /**
   * Yeni şifreyi kaydeder.
   * Token 15 dakika geçerlidir ve tek kullanımlıktır.
   */
  @ApiTags('password')
  @ApiOperation({ summary: 'Şifre sıfırlama onayı', description: 'E-postadan gelen tek kullanımlık token (15 dk geçerli) ile yeni şifreyi kaydeder.' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Şifre başarıyla güncellendi.' })
  @ApiResponse({ status: 401, description: 'Token geçersiz veya süresi dolmuş.' })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.passwordResetService.confirmReset(dto.token, dto.newPassword);
    return { message: 'Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.' };
  }

  // ─── E-posta doğrulama ─────────────────────────────────────────────────────

  /**
   * E-posta doğrulama bağlantısını onaylar.
   * Token 24 saat geçerlidir, tek kullanımlıktır.
   *
   * Kullanım: GET /auth/verify-email?token=abc123...
   */
  @ApiOperation({ summary: 'E-posta doğrulama', description: 'E-postadaki bağlantıdaki token ile hesabı doğrular. Token 24 saat geçerlidir ve tek kullanımlıktır.' })
  @ApiQuery({ name: 'token', type: 'string', description: 'Doğrulama e-postasındaki tek kullanımlık token' })
  @ApiResponse({ status: 200, description: 'E-posta başarıyla doğrulandı.' })
  @ApiResponse({ status: 401, description: 'Token geçersiz veya süresi dolmuş.' })
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Doğrulama token\'ı gereklidir.');
    }
    return this.emailVerificationService.verifyEmail(token);
  }

  /**
   * Yeni doğrulama e-postası gönderir.
   * E-posta zaten doğrulanmışsa 400 döner.
   */
  @ApiOperation({ summary: 'Doğrulama e-postasını yeniden gönder', description: 'Hesap doğrulama e-postasını yeniden gönderir. E-posta zaten doğrulanmışsa 400 döner.' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Doğrulama e-postası gönderildi.' })
  @ApiResponse({ status: 400, description: 'E-posta zaten doğrulanmış.' })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.emailVerificationService.resendVerification(dto.email, dto.tenantSlug ?? '');
    return { message: 'Doğrulama e-postası gönderildi.' };
  }
}

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcryptjs';
import type { ValidatedUser } from '../auth.service';
import { UserRepository } from '../../user/user.repository';

/**
 * E-posta + şifre doğrulama stratejisi.
 *
 * Passport 'local' stratejisini genişletir.
 * AuthController'daki login endpoint'i bu stratejiyi tetikler.
 *
 * Doğrulama akışı:
 *  1. tenantSlug → tenant_id (control_plane sorgusu)
 *  2. tenant DB'den kullanıcıyı e-posta ile bul
 *  3. bcrypt.compare ile şifre doğrula
 *  4. Başarısız girişleri logla (5 deneme kilidi: TODO)
 *
 * Güvenlik notları:
 *  - Şifre bcrypt ile hash'lenmiş olarak saklanır (cost factor: 12)
 *  - Hata mesajı kasıtlı olarak belirsiz: "E-posta veya şifre hatalı"
 *    (e-posta varlığını veya firma kodunu ifşa etmemek için)
 *  - Timing saldırısına karşı: kullanıcı bulunamazsa sahte bcrypt compare
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  private readonly logger = new Logger(LocalStrategy.name);

  // Zamanlama saldırısı koruması için sahte hash (kullanıcı bulunamazsa)
  private static readonly DUMMY_HASH =
    '$2b$12$placeholderHashForTimingAttackProtection.xxxxxxxxxxxxxxx';

  constructor(private readonly userRepository: UserRepository) {
    super({
      usernameField: 'email',     // default 'username' yerine 'email'
      passwordField: 'password',
      passReqToCallback: true,    // tenantSlug için request nesnesine erişim
    });
  }

  async validate(
    request: { body: { tenantSlug?: string } },
    email: string,
    password: string,
  ): Promise<ValidatedUser> {
    const tenantSlug = request.body.tenantSlug ?? '';

    this.logger.log(
      `Giriş denemesi: email=${email} tenantSlug=${tenantSlug}`,
    );

    // 1. tenantSlug → tenant_id çözümle
    //    Slug verilmemişse e-posta ile tenant otomatik aranır (tek eşleşme gerekir)
    const tenantInfo = tenantSlug
      ? await this.userRepository.resolveTenantSlug(tenantSlug)
      : await this.userRepository.resolveTenantByEmail(email);

    // Kullanıcıyı yükle (tenant bulunamazsa null)
    const user = tenantInfo
      ? await this.userRepository.findByEmail(tenantInfo.tenantId, email)
      : null;

    // Zamanlama saldırısına karşı: kullanıcı yoksa bile bcrypt çalıştır
    const hashToCompare = user?.passwordHash ?? LocalStrategy.DUMMY_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCompare);

    // Kimlik doğrulama başarısız — kasıtlı olarak belirsiz hata
    if (!tenantInfo || !user || !passwordValid) {
      this.logger.warn(
        `Başarısız giriş: email=${email} tenantSlug=${tenantSlug} ` +
        `neden=${!tenantInfo ? 'tenant_yok' : !user ? 'kullanici_yok' : 'yanlis_sifre'}`,
      );
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    // Hesap askıya alınmış
    if (!user.isActive) {
      this.logger.warn(`Devre dışı hesap giriş denemesi: userId=${user.id}`);
      throw new UnauthorizedException(
        'Hesabınız devre dışı bırakılmış. Yöneticinizle iletişime geçin.',
      );
    }

    // Başarılı giriş — last_login güncelle (arka planda, yanıtı bloke etme)
    void this.userRepository.updateLastLogin(tenantInfo.tenantId, user.id);

    this.logger.log(
      `Giriş başarılı: userId=${user.id} tenant=${tenantInfo.tenantId}`,
    );

    return {
      id: user.id,
      email: user.email,
      tenantId: tenantInfo.tenantId,
      tenantTier: tenantInfo.tenantTier as 'starter' | 'business' | 'enterprise',
      roles: user.roles,
    };
  }
}

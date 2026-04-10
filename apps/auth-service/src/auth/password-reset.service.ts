import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MailerService } from '@enkap/mailer';
import { validatePassword } from '@enkap/shared-types';
import { UserRepository } from '../user/user.repository';

/** Şifre sıfırlama token geçerlilik süresi (saniye) — 15 dakika */
const RESET_TOKEN_TTL = 60 * 15;

/** Redis anahtar şablonu */
const resetKey = (token: string) => `pwd_reset:${token}`;

interface ResetPayload {
  userId:   string;
  tenantId: string;
  email:    string;
}

/**
 * Şifre sıfırlama akışı.
 *
 * Güvenlik tasarımı:
 *  - Kullanıcı bulunamazsa sessizce döner (bilgi sızdırma önleme)
 *  - Token: cryptographically secure 32-byte hex string
 *  - Redis TTL: 15 dakika — token tek kullanımlık
 *  - Kullanılan token Redis'ten silinir
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly redis:  Redis;

  constructor(
    private readonly userRepo:  UserRepository,
    private readonly mailer:    MailerService,
    private readonly config:    ConfigService,
  ) {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Şifre sıfırlama e-postası gönderir.
   * Kullanıcı bulunamazsa sessiz dönüş — timing attack önlemi.
   */
  async requestReset(email: string, tenantSlug: string): Promise<void> {
    // Tenant ve kullanıcıyı çöz
    const tenant = await this.userRepo.resolveTenantSlug(tenantSlug);
    if (!tenant) {
      this.logger.debug(`Bilinmeyen slug: ${tenantSlug}`);
      return; // Bilgi sızdırma
    }

    const user = await this.userRepo.findByEmail(tenant.tenantId, email);
    if (!user || !user.isActive) {
      this.logger.debug(`Kullanıcı bulunamadı: ${email}`);
      return;
    }

    // Güvenli token üret
    const token = randomBytes(32).toString('hex');

    const payload: ResetPayload = {
      userId:   user.id,
      tenantId: tenant.tenantId,
      email:    user.email,
    };

    // Redis'e yaz (TTL: 15 dakika)
    await this.redis.set(resetKey(token), JSON.stringify(payload), 'EX', RESET_TOKEN_TTL);

    // Sıfırlama URL'i
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://app.enkap.com.tr');
    const resetUrl    = `${frontendUrl}/sifre-sifirla?token=${token}&tenant=${tenantSlug}`;

    await this.mailer.sendPasswordReset(user.email, {
      name:     user.name,
      resetUrl,
    });

    this.logger.log(`Şifre sıfırlama e-postası gönderildi: userId=${user.id}`);
  }

  /**
   * Yeni şifreyi uygular.
   *
   * @throws {BadRequestException} Token geçersiz veya süresi dolmuş
   */
  async confirmReset(token: string, newPassword: string): Promise<void> {
    // Şifre politikası kontrolü — token geçerliliğinden önce (gereksiz Redis sorgusu önlenir)
    const { valid, errors } = validatePassword(newPassword);
    if (!valid) {
      throw new BadRequestException({ message: 'Şifre politikasına uygun değil', errors });
    }

    const raw = await this.redis.get(resetKey(token));
    if (!raw) {
      throw new BadRequestException('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.');
    }

    const payload: ResetPayload = JSON.parse(raw) as ResetPayload;

    // Şifreyi hash'le ve güncelle
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.userRepo.updatePassword(payload.tenantId, payload.userId, passwordHash);

    // Token'ı sil (tek kullanımlık)
    await this.redis.del(resetKey(token));

    this.logger.log(`Şifre güncellendi: userId=${payload.userId}`);
  }
}

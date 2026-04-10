import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomBytes } from 'crypto';
import { MailerService } from '@enkap/mailer';
import { UserRepository } from '../user/user.repository';

/** Doğrulama token geçerlilik süresi: 24 saat */
const VERIFY_TOKEN_TTL = 60 * 60 * 24;

/** Redis anahtar şablonu */
const verifyKey = (token: string) => `email_verify:${token}`;

interface VerifyPayload {
  userId:   string;
  tenantId: string;
  email:    string;
}

/**
 * E-posta Doğrulama Servisi.
 *
 * Kayıt sonrası kullanıcıya doğrulama e-postası gönderir.
 * Kullanıcı bağlantıya tıkladığında hesabı aktifleşir.
 *
 * Güvenlik tasarımı:
 *  - Token: cryptographically secure 32-byte hex string
 *  - Redis TTL: 24 saat — token tek kullanımlık
 *  - Kullanılan token Redis'ten silinir
 *  - Kullanıcı bulunamazsa sessiz dönüş (bilgi sızdırma önleme)
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly redis:  Redis;

  constructor(
    private readonly userRepo: UserRepository,
    private readonly mailer:   MailerService,
    private readonly config:   ConfigService,
  ) {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect:          true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Kullanıcıya e-posta doğrulama bağlantısı gönderir.
   * Kayıt servisi tarafından kayıt sonrası çağrılır.
   *
   * Kullanıcı zaten doğrulanmışsa sessizce atlar.
   */
  async sendVerificationEmail(tenantId: string, userId: string): Promise<void> {
    const user = await this.userRepo.findById(tenantId, userId);

    if (!user) {
      this.logger.debug(`Kullanıcı bulunamadı: tenantId=${tenantId} userId=${userId}`);
      return;
    }

    if (user.emailVerified) {
      this.logger.debug(`E-posta zaten doğrulanmış: userId=${userId}`);
      return;
    }

    const token   = randomBytes(32).toString('hex');
    const payload: VerifyPayload = {
      userId,
      tenantId,
      email: user.email,
    };

    await this.redis.set(verifyKey(token), JSON.stringify(payload), 'EX', VERIFY_TOKEN_TTL);

    const frontendUrl  = this.config.get<string>('FRONTEND_URL', 'https://app.enkap.com.tr');
    const verifyUrl    = `${frontendUrl}/e-posta-dogrula?token=${token}`;

    // E-postayı fire-and-forget gönder — kayıt akışını durdurma
    this.mailer.sendEmailVerification(user.email, {
      name:      user.name,
      verifyUrl,
    }).catch((err: Error) =>
      this.logger.warn(`E-posta doğrulama gönderilemedi: userId=${userId} hata=${err.message}`),
    );

    this.logger.log(`E-posta doğrulama bağlantısı oluşturuldu: userId=${userId}`);
  }

  /**
   * Token'ı doğrular ve kullanıcının e-posta adresini aktifleştirir.
   *
   * @throws {BadRequestException} Token geçersiz veya süresi dolmuş
   */
  async verifyEmail(token: string): Promise<{ message: string }> {
    const raw = await this.redis.get(verifyKey(token));

    if (!raw) {
      throw new BadRequestException(
        'E-posta doğrulama bağlantısı geçersiz veya süresi dolmuş. Yeni bağlantı talep edin.',
      );
    }

    const payload: VerifyPayload = JSON.parse(raw) as VerifyPayload;

    // Kullanıcıyı doğrulanmış olarak işaretle
    await this.userRepo.markEmailVerified(payload.tenantId, payload.userId);

    // Token'ı sil (tek kullanımlık)
    await this.redis.del(verifyKey(token));

    this.logger.log(`E-posta doğrulandı: userId=${payload.userId}`);

    return { message: 'E-posta adresiniz başarıyla doğrulandı. Giriş yapabilirsiniz.' };
  }

  /**
   * Yeni doğrulama e-postası gönderir (kullanıcı isteğiyle).
   * E-posta zaten doğrulanmışsa 400 fırlatır.
   */
  async resendVerification(email: string, tenantSlug: string): Promise<void> {
    const tenant = await this.userRepo.resolveTenantSlug(tenantSlug);
    if (!tenant) {
      this.logger.debug(`Bilinmeyen tenant: ${tenantSlug}`);
      return; // Bilgi sızdırma
    }

    const user = await this.userRepo.findByEmail(tenant.tenantId, email);
    if (!user || !user.isActive) {
      this.logger.debug(`Kullanıcı bulunamadı: ${email}`);
      return; // Bilgi sızdırma
    }

    if (user.emailVerified) {
      throw new BadRequestException('E-posta adresiniz zaten doğrulanmış.');
    }

    await this.sendVerificationEmail(tenant.tenantId, user.id);
  }
}

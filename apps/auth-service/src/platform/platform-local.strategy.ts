import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import * as bcrypt from 'bcryptjs';
import type { PlatformRole } from '@enkap/shared-types';
import { PlatformAdminRepository } from './platform-admin.repository';

export interface ValidatedPlatformAdmin {
  id: string;
  email: string;
  role: PlatformRole;
}

/**
 * Platform admin e-posta + şifre doğrulama stratejisi.
 *
 * Tenant LocalStrategy'den farkı:
 *  - tenantSlug gerektirmez
 *  - `platform_admins` tablosundan sorgular (control_plane DB)
 *  - Başarılı doğrulama → `ValidatedPlatformAdmin` döner
 */
@Injectable()
export class PlatformLocalStrategy extends PassportStrategy(Strategy, 'platform-local') {
  private readonly logger = new Logger(PlatformLocalStrategy.name);

  private static readonly DUMMY_HASH =
    '$2b$12$placeholderHashForTimingAttackProtection.xxxxxxxxxxxxxxx';

  constructor(private readonly adminRepo: PlatformAdminRepository) {
    super({ usernameField: 'email', passwordField: 'password' });
  }

  async validate(email: string, password: string): Promise<ValidatedPlatformAdmin> {
    const admin = await this.adminRepo.findByEmail(email);

    // Zamanlama saldırısına karşı: admin yoksa da bcrypt çalıştır
    const hashToCompare = admin?.passwordHash ?? PlatformLocalStrategy.DUMMY_HASH;
    const passwordValid = await bcrypt.compare(password, hashToCompare);

    if (!admin || !passwordValid) {
      this.logger.warn(`Başarısız platform admin girişi: email=${email}`);
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Platform admin hesabı devre dışı bırakılmış.');
    }

    this.logger.log(`Platform admin doğrulandı: adminId=${admin.id}`);

    return { id: admin.id, email: admin.email, role: admin.role as PlatformRole };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PlatformRole } from '@enkap/shared-types';

export interface PlatformAdmin {
  id: string;
  email: string;
  passwordHash: string;
  role: PlatformRole;
  isActive: boolean;
}

/**
 * Control plane'deki `platform_admins` tablosunu yönetir.
 *
 * Tablo CP007 control plane migration'ı tarafından oluşturulur.
 * Uygulama kodu DDL çalıştırmaz.
 */
@Injectable()
export class PlatformAdminRepository {
  private readonly logger = new Logger(PlatformAdminRepository.name);

  constructor(
    @InjectDataSource('control_plane')
    private readonly db: DataSource,
  ) {}

  async findByEmail(email: string): Promise<PlatformAdmin | null> {
    const rows = await this.db.query<PlatformAdmin[]>(
      `SELECT id, email, password_hash AS "passwordHash", role, is_active AS "isActive"
       FROM platform_admins
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<PlatformAdmin | null> {
    const rows = await this.db.query<PlatformAdmin[]>(
      `SELECT id, email, password_hash AS "passwordHash", role, is_active AS "isActive"
       FROM platform_admins
       WHERE id = $1
       LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.db.query(
      `UPDATE platform_admins SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }
}

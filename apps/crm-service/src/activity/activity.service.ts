import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Activity, type ActivityType } from './activity.entity';

export interface CreateActivityDto {
  contactId:    string;
  leadId?:      string;
  type:         ActivityType;
  subject:      string;
  body?:        string;
  scheduledAt?: string;  // ISO datetime
  ownerUserId?: string;
}

/** Swagger şema belgesi için DTO sınıfı */
export class CreateActivityDtoDoc implements CreateActivityDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid', description: 'İlgili kişi UUID' })
  contactId!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', format: 'uuid', description: 'İlgili fırsat UUID (opsiyonel)' })
  leadId?: string;

  @ApiProperty({ enum: ['call', 'meeting', 'email', 'task', 'note'], example: 'call', description: 'Aktivite türü' })
  type!: ActivityType;

  @ApiProperty({ example: 'Demo toplantısı planlandı', description: 'Aktivite konusu' })
  subject!: string;

  @ApiPropertyOptional({ example: 'Müşteri ürün demo talep etti. Zoom linki gönderildi.', description: 'Aktivite detay notları' })
  body?: string;

  @ApiPropertyOptional({ example: '2026-04-01T10:00:00+03:00', description: 'Planlanan zaman (ISO 8601)' })
  scheduledAt?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002', format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  ownerUserId?: string;
}

export interface ActivityFilter {
  contactId?:   string;
  leadId?:      string;
  ownerUserId?: string;
  /** true → sadece bekleyenler, false → sadece tamamlananlar */
  pending?:     boolean;
  page?:        number;
  limit?:       number;
}

/**
 * CRM aktivite servisi.
 *
 * Görev durumu:
 *  - pending:   completed_at IS NULL
 *  - overdue:   pending + scheduled_at < NOW()
 *  - completed: completed_at IS NOT NULL
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async ds() {
    const { tenantId } = getTenantContext();
    return this.dsManager.getDataSource(tenantId);
  }

  async findAll(filter: ActivityFilter = {}): Promise<{ items: Activity[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const conditions: string[] = ['a.tenant_id = $1'];
    const params: unknown[]    = [tenantId];
    let   idx                  = 2;

    if (filter.contactId) {
      conditions.push(`a.contact_id = $${idx++}`);
      params.push(filter.contactId);
    }
    if (filter.leadId) {
      conditions.push(`a.lead_id = $${idx++}`);
      params.push(filter.leadId);
    }
    if (filter.ownerUserId) {
      conditions.push(`a.owner_user_id = $${idx++}`);
      params.push(filter.ownerUserId);
    }
    if (filter.pending === true) {
      conditions.push('a.completed_at IS NULL');
    } else if (filter.pending === false) {
      conditions.push('a.completed_at IS NOT NULL');
    }

    const where  = conditions.join(' AND ');
    const page   = filter.page   ?? 1;
    const limit  = filter.limit  ?? 50;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      ds.query<Activity[]>(
        `SELECT * FROM crm_activities a WHERE ${where}
         ORDER BY a.scheduled_at ASC NULLS LAST, a.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      ds.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt FROM crm_activities a WHERE ${where}`,
        params,
      ),
    ]);

    return { items: rows, total: parseInt(countResult[0]?.cnt ?? '0', 10), page, limit };
  }

  async findOne(id: string): Promise<Activity> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Activity[]>(
      'SELECT * FROM crm_activities WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException(`Aktivite bulunamadı: ${id}`);
    return rows[0];
  }

  async create(dto: CreateActivityDto): Promise<Activity> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Activity[]>(
      `INSERT INTO crm_activities
         (tenant_id, contact_id, lead_id, type, subject, body, scheduled_at, owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId,
        dto.contactId,
        dto.leadId      ?? null,
        dto.type,
        dto.subject,
        dto.body        ?? null,
        dto.scheduledAt ?? null,
        dto.ownerUserId ?? null,
      ],
    );

    this.logger.log(
      `Aktivite oluşturuldu: ${rows[0].id} type=${dto.type} tenant=${tenantId}`,
    );
    return rows[0];
  }

  /** Aktiviteyi tamamlandı olarak işaretle */
  async complete(id: string): Promise<Activity> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Activity[]>(
      `UPDATE crm_activities
       SET completed_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND completed_at IS NULL
       RETURNING *`,
      [id, tenantId],
    );

    if (!rows.length) {
      throw new NotFoundException(`Aktivite bulunamadı veya zaten tamamlandı: ${id}`);
    }

    this.logger.log(`Aktivite tamamlandı: ${id} tenant=${tenantId}`);
    return rows[0];
  }

  /**
   * Vadesi geçmiş bekleyen aktivite sayısı.
   * Dashboard widget için kullanılır.
   */
  async overdueCount(): Promise<number> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt FROM crm_activities
       WHERE tenant_id = $1
         AND completed_at IS NULL
         AND scheduled_at < NOW()`,
      [tenantId],
    );

    return parseInt(rows[0]?.cnt ?? '0', 10);
  }
}

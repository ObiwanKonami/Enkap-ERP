import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Lead, type LeadStage } from './lead.entity';

export interface CreateLeadDto {
  contactId:          string;
  title:              string;
  valueKurus?:        number;
  stage?:             LeadStage;
  probability?:       number;
  expectedCloseDate?: string;  // ISO date: 'YYYY-MM-DD'
  ownerUserId?:       string;
  notes?:             string;
}

export type UpdateLeadDto = Partial<CreateLeadDto> & {
  lostReason?: string;
};

/** Swagger şema belgesi için DTO sınıfı */
export class CreateLeadDtoDoc implements CreateLeadDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid', description: 'İlgili kişi UUID' })
  contactId!: string;

  @ApiProperty({ example: 'ERP Yazılım Satışı', description: 'Fırsat başlığı' })
  title!: string;

  @ApiPropertyOptional({ example: 5000000, description: 'Fırsat değeri (kuruş cinsinden — ör. 50.000 TL = 5000000)' })
  valueKurus?: number;

  @ApiPropertyOptional({ enum: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'], description: 'Fırsat aşaması (varsayılan: new)' })
  stage?: LeadStage;

  @ApiPropertyOptional({ example: 60, minimum: 0, maximum: 100, description: 'Kazanma olasılığı % (varsayılan: 20)' })
  probability?: number;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'Beklenen kapanma tarihi (YYYY-MM-DD)' })
  expectedCloseDate?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  ownerUserId?: string;

  @ApiPropertyOptional({ example: 'Müşteri teklife olumlu baktı.', description: 'Serbest notlar' })
  notes?: string;
}

/** Swagger şema belgesi için DTO sınıfı */
export class UpdateLeadDtoDoc implements UpdateLeadDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid', description: 'İlgili kişi UUID' })
  contactId?: string;

  @ApiPropertyOptional({ example: 'ERP Yazılım Satışı', description: 'Fırsat başlığı' })
  title?: string;

  @ApiPropertyOptional({ example: 5000000, description: 'Fırsat değeri (kuruş cinsinden)' })
  valueKurus?: number;

  @ApiPropertyOptional({ enum: ['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost'], description: 'Yeni aşama — geçiş matrisi uygulanır' })
  stage?: LeadStage;

  @ApiPropertyOptional({ example: 80, minimum: 0, maximum: 100, description: 'Kazanma olasılığı %' })
  probability?: number;

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Beklenen kapanma tarihi (YYYY-MM-DD)' })
  expectedCloseDate?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  ownerUserId?: string;

  @ApiPropertyOptional({ example: 'Güncellenen not.', description: 'Serbest notlar' })
  notes?: string;

  @ApiPropertyOptional({ example: 'Rakip firma daha uygun fiyat teklif etti.', description: 'Kaybetme nedeni (stage=lost ise zorunlu)' })
  lostReason?: string;
}

export interface LeadFilter {
  stage?:       LeadStage;
  ownerUserId?: string;
  contactId?:   string;
  page?:        number;
  limit?:       number;
}

export interface PipelineSummary {
  stage:            LeadStage;
  count:            number;
  totalValueKurus:  number;
  weightedKurus:    number;
}

/**
 * CRM fırsat servisi.
 *
 * Pipeline iş mantığı:
 * - Aşama geçişi won/lost → closedAt otomatik doldurulur
 * - lost → lostReason zorunlu
 * - Özet: stage bazında toplam + ağırlıklı boru hattı değeri
 */
@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  // Geçerli aşama geçiş matrisi (kaynak → hedef)
  private static readonly VALID_TRANSITIONS: Partial<Record<LeadStage, LeadStage[]>> = {
    new:         ['qualified', 'lost'],
    qualified:   ['proposal', 'lost'],
    proposal:    ['negotiation', 'won', 'lost'],
    negotiation: ['won', 'lost'],
    won:         [],
    lost:        [],
  };

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async ds() {
    const { tenantId } = getTenantContext();
    return this.dsManager.getDataSource(tenantId);
  }

  async findAll(filter: LeadFilter = {}): Promise<{ items: Lead[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const conditions: string[] = ['l.tenant_id = $1'];
    const params: unknown[]    = [tenantId];
    let   idx                  = 2;

    if (filter.stage) {
      conditions.push(`l.stage = $${idx++}`);
      params.push(filter.stage);
    }
    if (filter.ownerUserId) {
      conditions.push(`l.owner_user_id = $${idx++}`);
      params.push(filter.ownerUserId);
    }
    if (filter.contactId) {
      conditions.push(`l.contact_id = $${idx++}`);
      params.push(filter.contactId);
    }

    const where  = conditions.join(' AND ');
    const page   = filter.page ?? 1;
    const limit  = filter.limit  ?? 50;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      ds.query<Lead[]>(
        `SELECT * FROM crm_leads l WHERE ${where}
         ORDER BY l.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      ds.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt FROM crm_leads l WHERE ${where}`,
        params,
      ),
    ]);

    return { items: rows, total: parseInt(countResult[0]?.cnt ?? '0', 10), page, limit };
  }

  async findOne(id: string): Promise<Lead> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Lead[]>(
      'SELECT * FROM crm_leads WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (!rows.length) throw new NotFoundException(`Fırsat bulunamadı: ${id}`);
    return rows[0];
  }

  async create(dto: CreateLeadDto): Promise<Lead> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Lead[]>(
      `INSERT INTO crm_leads
         (tenant_id, contact_id, title, value_kurus, stage, probability,
          expected_close_date, owner_user_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        tenantId,
        dto.contactId,
        dto.title,
        dto.valueKurus        ?? 0,
        dto.stage             ?? 'new',
        dto.probability       ?? 20,
        dto.expectedCloseDate ?? null,
        dto.ownerUserId       ?? null,
        dto.notes             ?? null,
      ],
    );

    this.logger.log(`Fırsat oluşturuldu: ${rows[0].id} tenant=${tenantId}`);
    return rows[0];
  }

  async update(id: string, dto: UpdateLeadDto): Promise<Lead> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const existing = await this.findOne(id);

    // Aşama geçiş doğrulaması
    if (dto.stage && dto.stage !== existing.stage) {
      const allowed = LeadService.VALID_TRANSITIONS[existing.stage] ?? [];
      if (!allowed.includes(dto.stage)) {
        throw new BadRequestException(
          `Geçersiz aşama geçişi: ${existing.stage} → ${dto.stage}`,
        );
      }
      if (dto.stage === 'lost' && !dto.lostReason) {
        throw new BadRequestException('Kaybetme nedenini belirtiniz.');
      }
    }

    const sets:   string[]  = ['updated_at = NOW()'];
    const params: unknown[] = [id, tenantId];
    let   idx               = 3;

    const fieldMap: Record<string, string> = {
      title:              'title',
      valueKurus:         'value_kurus',
      stage:              'stage',
      probability:        'probability',
      expectedCloseDate:  'expected_close_date',
      ownerUserId:        'owner_user_id',
      notes:              'notes',
      lostReason:         'lost_reason',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (dto as Record<string, unknown>)[key];
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val ?? null);
      }
    }

    // Kapanma zamanını otomatik doldur
    if (dto.stage === 'won' || dto.stage === 'lost') {
      sets.push(`closed_at = $${idx++}`);
      params.push(new Date());
    }

    const rows = await ds.query<Lead[]>(
      `UPDATE crm_leads SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      params,
    );

    if (!rows.length) throw new NotFoundException(`Fırsat bulunamadı: ${id}`);
    return rows[0];
  }

  /**
   * Pipeline özeti — Kanban kartları için.
   * Her aşama için: fırsat sayısı, toplam değer, ağırlıklı değer.
   */
  async getPipelineSummary(): Promise<PipelineSummary[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<{
      stage:           string;
      count:           string;
      total_value:     string;
      weighted_value:  string;
    }[]>(
      `SELECT
         stage,
         COUNT(*)                                        AS count,
         COALESCE(SUM(value_kurus), 0)                  AS total_value,
         COALESCE(SUM(value_kurus * probability / 100), 0) AS weighted_value
       FROM crm_leads
       WHERE tenant_id = $1 AND stage NOT IN ('won', 'lost')
       GROUP BY stage
       ORDER BY CASE stage
         WHEN 'new'         THEN 1
         WHEN 'qualified'   THEN 2
         WHEN 'proposal'    THEN 3
         WHEN 'negotiation' THEN 4
         ELSE 5
       END`,
      [tenantId],
    );

    return rows.map((r) => ({
      stage:           r.stage as LeadStage,
      count:           parseInt(r.count, 10),
      totalValueKurus: parseInt(r.total_value, 10),
      weightedKurus:   parseInt(r.weighted_value, 10),
    }));
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Contact, type ContactSource, type ContactType } from './contact.entity';

export interface CreateContactDto {
  /** Firma adı (B2B) veya kişi adı soyadı (B2C) */
  name:         string;
  type?:        ContactType;
  email?:       string;
  phone?:       string;
  vkn?:         string;
  tckn?:        string;
  address?:     string;
  city?:        string;
  district?:    string;
  taxOffice?:   string;
  mersisNo?:    string;
  companyName?: string;
  jobTitle?:    string;
  source?:      ContactSource;
  tags?:        string[];
  notes?:       string;
  ownerUserId?: string;
  isActive?:    boolean;
}

export type UpdateContactDto = Partial<CreateContactDto>;

/** Swagger şema belgesi için DTO sınıfı */
export class CreateContactDtoDoc implements CreateContactDto {
  @ApiProperty({ example: 'ABC Teknoloji A.Ş.', description: 'Firma veya kişi adı' })
  name!: string;

  @ApiPropertyOptional({ enum: ['customer', 'vendor', 'both', 'prospect'], description: 'Kişi türü' })
  type?: ContactType;

  @ApiPropertyOptional({ example: 'ahmet@firma.com.tr', description: 'E-posta adresi' })
  email?: string;

  @ApiPropertyOptional({ example: '+90 532 000 00 00', description: 'Telefon numarası' })
  phone?: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'Vergi Kimlik Numarası (10 hane)' })
  vkn?: string;

  @ApiPropertyOptional({ example: '12345678901', description: 'TC Kimlik Numarası (11 hane)' })
  tckn?: string;

  @ApiPropertyOptional({ example: 'Atatürk Cad. No:1', description: 'Adres' })
  address?: string;

  @ApiPropertyOptional({ example: 'İstanbul', description: 'Şehir' })
  city?: string;

  @ApiPropertyOptional({ example: 'ABC Teknoloji A.Ş.', description: 'Şirket adı' })
  companyName?: string;

  @ApiPropertyOptional({ example: 'Satın Alma Müdürü', description: 'Pozisyon' })
  jobTitle?: string;

  @ApiPropertyOptional({ enum: ['referral', 'web', 'social', 'cold_call', 'other'], description: 'Kişi kaynağı' })
  source?: ContactSource;

  @ApiPropertyOptional({ type: [String], example: ['vip', 'e-ticaret'], description: 'Etiketler' })
  tags?: string[];

  @ApiPropertyOptional({ example: 'Yıllık görüşme planlandı.', description: 'Serbest notlar' })
  notes?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  ownerUserId?: string;

  @ApiPropertyOptional({ example: true, description: 'Aktif mi?' })
  isActive?: boolean;
}

/** Swagger şema belgesi için DTO sınıfı */
export class UpdateContactDtoDoc implements UpdateContactDto {
  @ApiPropertyOptional({ example: 'Ahmet', description: 'Kişi adı' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Yılmaz', description: 'Kişi soyadı' })
  lastName?: string;

  @ApiPropertyOptional({ example: 'ahmet@firma.com.tr', description: 'E-posta adresi' })
  email?: string;

  @ApiPropertyOptional({ example: '+90 532 000 00 00', description: 'Telefon numarası' })
  phone?: string;

  @ApiPropertyOptional({ example: 'ABC Teknoloji A.Ş.', description: 'Şirket adı' })
  companyName?: string;

  @ApiPropertyOptional({ example: 'Satın Alma Müdürü', description: 'Pozisyon' })
  jobTitle?: string;

  @ApiPropertyOptional({ enum: ['referral', 'web', 'social', 'cold_call', 'other'], description: 'Kişi kaynağı' })
  source?: ContactSource;

  @ApiPropertyOptional({ type: [String], example: ['vip'], description: 'Etiketler' })
  tags?: string[];

  @ApiPropertyOptional({ example: 'Güncellenen not.', description: 'Serbest notlar' })
  notes?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid', description: 'Sorumlu kullanıcı UUID' })
  ownerUserId?: string;
}

export interface ContactFilter {
  ownerUserId?: string;
  source?:      ContactSource;
  type?:        ContactType;
  search?:      string;  // ad, e-posta, şirket araması
  page?:        number;
  limit?:       number;
}

/**
 * Raw SQL SELECT için camelCase alias listesi.
 * contact_type → type, first_name → name (firma adı veya kişi adı) dönüşümü burada yapılır.
 */
const CONTACT_SELECT = `
  id,
  tenant_id            AS "tenantId",
  COALESCE(company_name, first_name) AS name,
  contact_type         AS type,
  email,
  phone,
  company_name         AS "companyName",
  vkn,
  tckn,
  address,
  city,
  district,
  job_title            AS "jobTitle",
  source,
  tags,
  notes,
  tax_office           AS "taxOffice",
  mersis_no            AS "mersisNo",
  owner_user_id        AS "ownerUserId",
  is_active            AS "isActive",
  created_at           AS "createdAt",
  updated_at           AS "updatedAt"
`;

/**
 * CRM kişi servisi.
 *
 * Tenant izolasyonu: TenantDataSourceManager ile her istek kendi şemasına gider.
 * TypeORM Repository API yerine ham SQL — daha öngörülebilir query planları.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  private async ds() {
    const { tenantId } = getTenantContext();
    return this.dsManager.getDataSource(tenantId);
  }

  async findAll(filter: ContactFilter = {}): Promise<{ items: Contact[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const conditions: string[] = ['c.tenant_id = $1', 'c.is_active = true'];
    const params: unknown[]    = [tenantId];
    let   idx                  = 2;

    if (filter.ownerUserId) {
      conditions.push(`c.owner_user_id = $${idx++}`);
      params.push(filter.ownerUserId);
    }
    if (filter.source) {
      conditions.push(`c.source = $${idx++}`);
      params.push(filter.source);
    }
    if (filter.type) {
      conditions.push(`c.contact_type = $${idx++}`);
      params.push(filter.type);
    }
    if (filter.search) {
      const like = `%${filter.search}%`;
      conditions.push(
        `(c.first_name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.company_name ILIKE $${idx})`,
      );
      params.push(like);
      idx++;
    }

    const where   = conditions.join(' AND ');
    const page    = filter.page ?? 1;
    const limit   = filter.limit  ?? 50;
    const offset  = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      ds.query<Contact[]>(
        `SELECT ${CONTACT_SELECT} FROM crm_contacts c WHERE ${where}
         ORDER BY c.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset],
      ),
      ds.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt FROM crm_contacts c WHERE ${where}`,
        params,
      ),
    ]);

    return { items: rows, total: parseInt(countResult[0]?.cnt ?? '0', 10), page, limit };
  }

  async findOne(id: string): Promise<Contact> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Contact[]>(
      `SELECT ${CONTACT_SELECT} FROM crm_contacts WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    if (!rows.length) {
      throw new NotFoundException(`Kişi bulunamadı: ${id}`);
    }
    return rows[0];
  }

  async create(dto: CreateContactDto): Promise<Contact> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<Contact[]>(
      `INSERT INTO crm_contacts
         (tenant_id, first_name, last_name, contact_type, email, phone,
          company_name, vkn, tckn, address, city, district, tax_office, mersis_no,
          job_title, source, tags, notes, owner_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING ${CONTACT_SELECT}`,
      [
        tenantId,
        dto.name,
        null,
        dto.type        ?? 'customer',
        dto.email       ?? null,
        dto.phone       ?? null,
        dto.companyName ?? dto.name,
        dto.vkn         ?? null,
        dto.tckn        ?? null,
        dto.address     ?? null,
        dto.city        ?? null,
        dto.district    ?? null,
        dto.taxOffice   ?? null,
        dto.mersisNo    ?? null,
        dto.jobTitle    ?? null,
        dto.source      ?? null,
        JSON.stringify(dto.tags ?? []),
        dto.notes       ?? null,
        dto.ownerUserId ?? null,
      ],
    );

    this.logger.log(`Kişi oluşturuldu: ${rows[0].id} tenant=${tenantId}`);
    return rows[0];
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const sets:   string[]  = ['updated_at = NOW()'];
    const params: unknown[] = [id, tenantId];
    let   idx               = 3;

    const fieldMap: Record<string, string> = {
      name:        'first_name',
      type:        'contact_type',
      email:       'email',
      phone:       'phone',
      companyName: 'company_name',
      vkn:         'vkn',
      tckn:        'tckn',
      address:     'address',
      city:        'city',
      district:    'district',
      taxOffice:   'tax_office',
      mersisNo:    'mersis_no',
      jobTitle:    'job_title',
      source:      'source',
      notes:       'notes',
      ownerUserId: 'owner_user_id',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      const val = (dto as Record<string, unknown>)[key];
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val ?? null);
      }
    }

    if (dto.tags !== undefined) {
      sets.push(`tags = $${idx++}`);
      params.push(JSON.stringify(dto.tags));
    }

    const rows = await ds.query<Contact[]>(
      `UPDATE crm_contacts SET ${sets.join(', ')}
       WHERE id = $1 AND tenant_id = $2 RETURNING ${CONTACT_SELECT}`,
      params,
    );

    if (!rows.length) {
      throw new NotFoundException(`Kişi bulunamadı: ${id}`);
    }
    return rows[0];
  }

  /** Soft delete */
  async remove(id: string): Promise<void> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    await ds.query(
      'UPDATE crm_contacts SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );

    this.logger.log(`Kişi silindi: ${id} tenant=${tenantId}`);
  }
}

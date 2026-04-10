import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TenantProfile, type OnboardingStep } from './tenant-profile.entity';

export interface CreateProfileDto {
  tenantId:       string;
  companyName:    string;
  tradeName?:     string;
  vkn?:           string;
  tckn?:          string;
  taxOffice?:     string;
  sgkEmployerNo?: string;
  mersisNo?:      string;
  phone?:         string;
  email?:         string;
  address?:       string;
  district?:      string;
  city?:          string;
  postalCode?:    string;
  iban?:          string;
  invoicePrefix?: string;
  logoUrl?:       string;
  // Finans varsayılanları
  defaultKdvRate?:          number;
  defaultPaymentTermDays?:  number;
  arReminderDays?:          number[];
  defaultCurrency?:         string;
  maxDiscountRate?:         number;
  defaultMinStockQty?:      number;
}

export type UpdateProfileDto = Partial<Omit<CreateProfileDto, 'tenantId'>>;

/**
 * Tenant şirket profilini yöneten servis.
 *
 * Profil; e-Fatura, bordro, muhasebe raporlama gibi modüller tarafından
 * şirket kimliğini çekmek için kullanılan tek kaynak (single source of truth).
 */
@Injectable()
export class TenantProfileService {
  private readonly logger = new Logger(TenantProfileService.name);

  constructor(
    @InjectRepository(TenantProfile, 'control_plane')
    private readonly profileRepo: Repository<TenantProfile>,
    @InjectDataSource('control_plane')
    private readonly dataSource: DataSource,
  ) {}

  /** Tenant profilini getir (yoksa NotFoundException) */
  async findByTenant(tenantId: string): Promise<TenantProfile> {
    const profile = await this.profileRepo.findOne({ where: { tenantId } });
    if (!profile) {
      throw new NotFoundException(`Tenant profili bulunamadı: ${tenantId}`);
    }
    return profile;
  }

  /** Tenant profilini getir (yoksa null) */
  async findByTenantOrNull(tenantId: string): Promise<TenantProfile | null> {
    return this.profileRepo.findOne({ where: { tenantId } });
  }

  /** Yeni profil oluştur */
  async create(dto: CreateProfileDto): Promise<TenantProfile> {
    const existing = await this.findByTenantOrNull(dto.tenantId);
    if (existing) {
      throw new ConflictException(
        `Tenant profili zaten mevcut: ${dto.tenantId}`,
      );
    }

    // Telefon numarası benzersizlik kontrolü (opsiyonel alan)
    if (dto.phone) {
      const phoneExists = await this.profileRepo.findOne({
        where: { phone: dto.phone },
      });
      if (phoneExists) {
        throw new ConflictException(`Telefon numarası zaten kullanımda: ${dto.phone}`);
      }
    }

    const profile = this.profileRepo.create({
      tenantId:     dto.tenantId,
      companyName:  dto.companyName,
      tradeName:    dto.tradeName    ?? null,
      vkn:          dto.vkn          ?? null,
      tckn:         dto.tckn         ?? null,
      taxOffice:    dto.taxOffice    ?? null,
      phone:        dto.phone        ?? null,
      email:        dto.email        ?? null,
      address:      dto.address      ?? null,
      district:     dto.district     ?? null,
      city:         dto.city         ?? null,
      postalCode:   dto.postalCode   ?? null,
      iban:         dto.iban         ?? null,
      invoicePrefix: dto.invoicePrefix ?? 'ENK',
      onboardingStep: 'profile',
      onboardingDone: false,
    });

    const saved = await this.profileRepo.save(profile);
    this.logger.log(`Profil oluşturuldu: tenant=${dto.tenantId}`);
    return saved;
  }

  /** Profil güncelle */
  async update(tenantId: string, dto: UpdateProfileDto): Promise<TenantProfile> {
    const profile = await this.findByTenant(tenantId);

    if (dto.companyName !== undefined) profile.companyName  = dto.companyName;
    if (dto.tradeName   !== undefined) profile.tradeName    = dto.tradeName   ?? null;
    if (dto.vkn         !== undefined) profile.vkn          = dto.vkn         ?? null;
    if (dto.tckn        !== undefined) profile.tckn         = dto.tckn        ?? null;
    if (dto.taxOffice   !== undefined) profile.taxOffice    = dto.taxOffice   ?? null;
    if (dto.phone       !== undefined) profile.phone        = dto.phone       ?? null;
    if (dto.email       !== undefined) profile.email        = dto.email       ?? null;
    if (dto.address     !== undefined) profile.address      = dto.address     ?? null;
    if (dto.district    !== undefined) profile.district     = dto.district    ?? null;
    if (dto.city        !== undefined) profile.city         = dto.city        ?? null;
    if (dto.postalCode  !== undefined) profile.postalCode   = dto.postalCode  ?? null;
    if (dto.iban        !== undefined) profile.iban         = dto.iban        ?? null;
    if (dto.invoicePrefix  !== undefined) profile.invoicePrefix  = dto.invoicePrefix;
    if (dto.sgkEmployerNo  !== undefined) profile.sgkEmployerNo = dto.sgkEmployerNo ?? null;
    if (dto.mersisNo       !== undefined) profile.mersisNo       = dto.mersisNo      ?? null;
    if (dto.logoUrl        !== undefined) profile.logoUrl        = dto.logoUrl       ?? null;

    // Finans varsayılanları
    if (dto.defaultKdvRate         !== undefined) profile.defaultKdvRate         = dto.defaultKdvRate;
    if (dto.defaultPaymentTermDays !== undefined) profile.defaultPaymentTermDays = dto.defaultPaymentTermDays;
    if (dto.arReminderDays         !== undefined) profile.arReminderDays         = dto.arReminderDays;
    if (dto.defaultCurrency        !== undefined) profile.defaultCurrency        = dto.defaultCurrency;
    if (dto.maxDiscountRate        !== undefined) profile.maxDiscountRate        = dto.maxDiscountRate;
    if (dto.defaultMinStockQty     !== undefined) profile.defaultMinStockQty     = dto.defaultMinStockQty;

    return this.profileRepo.save(profile);
  }

  /** Onboarding adımını ilerlet */
  async advanceOnboardingStep(
    tenantId: string,
    step: OnboardingStep,
  ): Promise<TenantProfile> {
    const profile = await this.findByTenant(tenantId);
    profile.onboardingStep = step;
    if (step === 'completed') {
      profile.onboardingDone = true;
    }
    return this.profileRepo.save(profile);
  }

  /**
   * Sonraki fatura numarasını atomik olarak üret.
   * PostgreSQL UPDATE ... RETURNING garanti eder — çakışma olmaz.
   */
  async nextInvoiceNumber(tenantId: string): Promise<string> {
    const result = await this.dataSource.query<{ seq: number; prefix: string }[]>(
      `UPDATE tenant_profiles
       SET next_invoice_seq = next_invoice_seq + 1
       WHERE tenant_id = $1
       RETURNING next_invoice_seq AS seq, invoice_prefix AS prefix`,
      [tenantId],
    );

    if (!result.length) {
      throw new NotFoundException(`Tenant profili bulunamadı: ${tenantId}`);
    }

    const { seq, prefix } = result[0];
    const year    = new Date().getFullYear();
    const seqStr  = String(seq).padStart(6, '0');
    return `${prefix}-${year}-${seqStr}`;
  }
}

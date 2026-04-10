import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { randomBytes }      from 'crypto';
import { WhiteLabelConfig } from './white-label-config.entity';

export interface UpsertWhiteLabelDto {
  subdomain?:     string | null;
  customDomain?:  string | null;
  brandName?:     string | null;
  logoUrl?:       string | null;
  faviconUrl?:    string | null;
  primaryColor?:  string;
  secondaryColor?: string;
  supportEmail?:  string | null;
  supportPhone?:  string | null;
}

/**
 * White Label konfigürasyon servisi.
 *
 * Yetki modeli:
 *  - Okuma: herkese açık (subdomain/domain çözümleme Kong/frontend'den yapılır)
 *  - Yazma: JWT korumalı + tenant ownership kontrolü
 *
 * Subdomain kuralı: sadece a-z, 0-9, tire; 3-63 karakter; tire ile başlayamaz/bitemez.
 * Custom domain: CNAME `{custom_domain}` → `api.enkap.com.tr` kurulumu müşteriye aittir.
 * Domain doğrulama: DNS TXT kaydı `_enkap-verify.{custom_domain}` = token
 */
@Injectable()
export class WhiteLabelService {
  private readonly logger = new Logger(WhiteLabelService.name);

  constructor(
    @InjectRepository(WhiteLabelConfig, 'control_plane')
    private readonly repo: Repository<WhiteLabelConfig>,
  ) {}

  /** Tenant'ın white label konfigürasyonunu getir */
  async getConfig(tenantId: string): Promise<WhiteLabelConfig> {
    const config = await this.repo.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException(`White label konfigürasyonu bulunamadı: tenant=${tenantId}`);
    }
    return config;
  }

  /** White label konfigürasyonu oluştur veya güncelle (upsert) */
  async upsertConfig(
    tenantId: string,
    dto: UpsertWhiteLabelDto,
  ): Promise<WhiteLabelConfig> {
    // Subdomain doğrulama
    if (dto.subdomain !== undefined && dto.subdomain !== null) {
      this.validateSubdomain(dto.subdomain);
      // Başka tenant kullanıyor mu?
      const existing = await this.repo.findOne({
        where: { subdomain: dto.subdomain },
      });
      if (existing && existing.tenantId !== tenantId) {
        throw new ConflictException(`Bu subdomain zaten kullanımda: ${dto.subdomain}`);
      }
    }

    // Custom domain doğrulama
    if (dto.customDomain !== undefined && dto.customDomain !== null) {
      this.validateDomain(dto.customDomain);
      const existing = await this.repo.findOne({
        where: { customDomain: dto.customDomain },
      });
      if (existing && existing.tenantId !== tenantId) {
        throw new ConflictException(`Bu domain zaten kullanımda: ${dto.customDomain}`);
      }
    }

    // Hex renk doğrulama
    if (dto.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(dto.primaryColor)) {
      throw new BadRequestException('primaryColor geçerli bir hex renk kodu olmalıdır (#RRGGBB)');
    }
    if (dto.secondaryColor && !/^#[0-9A-Fa-f]{6}$/.test(dto.secondaryColor)) {
      throw new BadRequestException('secondaryColor geçerli bir hex renk kodu olmalıdır (#RRGGBB)');
    }

    let config = await this.repo.findOne({ where: { tenantId } });

    if (!config) {
      // Yeni kayıt — domain doğrulama token'ı üret
      config = this.repo.create({
        tenantId,
        domainVerificationToken: dto.customDomain
          ? randomBytes(24).toString('hex')
          : null,
      });
      this.logger.log(`White label konfigürasyonu oluşturuluyor: tenant=${tenantId}`);
    } else if (
      dto.customDomain !== undefined &&
      dto.customDomain !== config.customDomain &&
      dto.customDomain !== null
    ) {
      // Custom domain değişti → yeniden doğrulama gerekli
      config.domainVerified = false;
      config.domainVerificationToken = randomBytes(24).toString('hex');
    }

    // Güncelle
    if (dto.subdomain !== undefined)     config.subdomain     = dto.subdomain;
    if (dto.customDomain !== undefined)  config.customDomain  = dto.customDomain;
    if (dto.brandName !== undefined)     config.brandName     = dto.brandName;
    if (dto.logoUrl !== undefined)       config.logoUrl       = dto.logoUrl;
    if (dto.faviconUrl !== undefined)    config.faviconUrl    = dto.faviconUrl;
    if (dto.primaryColor)                config.primaryColor  = dto.primaryColor;
    if (dto.secondaryColor)              config.secondaryColor = dto.secondaryColor;
    if (dto.supportEmail !== undefined)  config.supportEmail  = dto.supportEmail;
    if (dto.supportPhone !== undefined)  config.supportPhone  = dto.supportPhone;

    const saved = await this.repo.save(config);
    this.logger.log(`White label konfigürasyonu güncellendi: tenant=${tenantId}`);
    return saved;
  }

  /**
   * Custom domain'i doğrula.
   * DNS TXT kaydı kontrolü yaptıktan sonra domainVerified=true set eder.
   * NOT: Gerçek DNS kontrolü için bir DNS lookup servisi gerekir (doh.cloudflare.com vb.).
   *      Bu implementasyon DNS kontrolü simüle eder — production'da gerçek kontrol eklenmeli.
   */
  async verifyDomain(tenantId: string): Promise<{ verified: boolean; message: string }> {
    const config = await this.repo.findOne({ where: { tenantId } });
    if (!config) {
      throw new NotFoundException(`White label konfigürasyonu bulunamadı: tenant=${tenantId}`);
    }
    if (!config.customDomain) {
      throw new BadRequestException('Özel domain tanımlı değil.');
    }
    if (config.domainVerified) {
      return { verified: true, message: 'Domain zaten doğrulanmış.' };
    }

    // TODO: Gerçek DNS TXT kaydı kontrolü
    // DNS lookup: `_enkap-verify.{config.customDomain}` TXT = config.domainVerificationToken
    // Bu adım production'da doh.cloudflare.com veya Node dns.resolve() ile yapılır.
    this.logger.log(
      `Domain doğrulama isteği: tenant=${tenantId} domain=${config.customDomain} ` +
      `token=${config.domainVerificationToken ?? ''}`,
    );

    return {
      verified: false,
      message:
        `DNS TXT kaydı ekleyin: _enkap-verify.${config.customDomain} = ${config.domainVerificationToken ?? ''}. ` +
        `Kayıt yayıldıktan sonra (genellikle 5-60 dk) tekrar deneyin.`,
    };
  }

  /**
   * Subdomain'den tenant bul (Kong pre-function veya frontend çözümleme için).
   * Örn: `acme.enkap.com.tr` → subdomain='acme' → tenant_id
   */
  async findBySubdomain(
    subdomain: string,
  ): Promise<Pick<WhiteLabelConfig, 'tenantId' | 'brandName' | 'logoUrl' | 'primaryColor' | 'secondaryColor'> | null> {
    const config = await this.repo.findOne({
      where: { subdomain: subdomain.toLowerCase(), isActive: true },
      select: ['tenantId', 'brandName', 'logoUrl', 'primaryColor', 'secondaryColor'],
    });
    return config ?? null;
  }

  /**
   * Custom domain'den tenant bul.
   * Örn: `erp.acmecorp.com.tr` → tenant_id
   */
  async findByCustomDomain(
    domain: string,
  ): Promise<Pick<WhiteLabelConfig, 'tenantId' | 'brandName' | 'logoUrl' | 'primaryColor' | 'secondaryColor'> | null> {
    const config = await this.repo.findOne({
      where: { customDomain: domain.toLowerCase(), isActive: true, domainVerified: true },
      select: ['tenantId', 'brandName', 'logoUrl', 'primaryColor', 'secondaryColor'],
    });
    return config ?? null;
  }

  // ── Doğrulama yardımcıları ─────────────────────────────────────────────────

  private validateSubdomain(subdomain: string): void {
    const re = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
    if (!re.test(subdomain)) {
      throw new BadRequestException(
        'Subdomain yalnızca küçük harf, rakam ve tire içerebilir; ' +
        '3-63 karakter uzunluğunda olmalı ve tire ile başlayıp bitmemelidir.',
      );
    }
    // Rezerve subdomainler
    const reserved = ['www', 'api', 'app', 'mail', 'smtp', 'admin', 'enkap', 'support'];
    if (reserved.includes(subdomain)) {
      throw new BadRequestException(`Rezerve subdomain kullanılamaz: ${subdomain}`);
    }
  }

  private validateDomain(domain: string): void {
    const re = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!re.test(domain)) {
      throw new BadRequestException(`Geçersiz domain formatı: ${domain}`);
    }
    // enkap.com.tr subdomainlerini özel domain olarak kaydetme
    if (domain.endsWith('.enkap.com.tr')) {
      throw new BadRequestException(
        'enkap.com.tr altdomain\'leri custom_domain olarak kullanılamaz. ' +
        'Bunun yerine subdomain alanını kullanın.',
      );
    }
  }
}

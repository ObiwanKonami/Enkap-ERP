import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * White Label konfigürasyonu — tenant başına özelleştirilmiş görünüm.
 *
 * Subdomain yönlendirmesi: `{subdomain}.enkap.com.tr` → tenant
 * Özel domain:             `erp.musteri.com.tr` → tenant
 *
 * Kong, subdomain veya custom_domain'e gelen istekleri tenant-service'e iletir.
 * Tenant-service X-Tenant-ID header'ını set eder — downstream servisler TenantGuard ile kullanır.
 */
@Entity('white_label_configs')
export class WhiteLabelConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;

  /**
   * Özel subdomain: `acme` → `acme.enkap.com.tr`
   * Boşsa tenant_slug kullanılır.
   */
  @Column({ type: 'varchar', length: 63, nullable: true, unique: true })
  subdomain!: string | null;

  /**
   * Tam özel domain (CNAME kurulumu gerektir): `erp.acmecorp.com.tr`
   * Kong wildcard SSL sertifikası yönetir.
   */
  @Column({ name: 'custom_domain', type: 'varchar', length: 253, nullable: true, unique: true })
  customDomain!: string | null;

  /** Uygulamada görünen marka adı (şirket adı yerine) */
  @Column({ name: 'brand_name', type: 'varchar', length: 100, nullable: true })
  brandName!: string | null;

  /** Logo URL'si (CDN/S3 — tenant kendi sunucusuna yükler) */
  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  /** Favicon URL'si */
  @Column({ name: 'favicon_url', type: 'text', nullable: true })
  faviconUrl!: string | null;

  /** Ana renk — hex (#1a73e8) */
  @Column({ name: 'primary_color', type: 'char', length: 7, default: '#0f172a' })
  primaryColor!: string;

  /** İkincil/vurgu rengi — hex */
  @Column({ name: 'secondary_color', type: 'char', length: 7, default: '#3b82f6' })
  secondaryColor!: string;

  /** Destek e-posta adresi (giriş ekranında gösterilir) */
  @Column({ name: 'support_email', type: 'varchar', length: 200, nullable: true })
  supportEmail!: string | null;

  /** Destek telefonu */
  @Column({ name: 'support_phone', type: 'varchar', length: 20, nullable: true })
  supportPhone!: string | null;

  /** Konfigürasyon aktif mi */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** DNS doğrulaması yapıldı mı (custom_domain için) */
  @Column({ name: 'domain_verified', type: 'boolean', default: false })
  domainVerified!: boolean;

  /** Domain doğrulama için DNS TXT kaydı değeri */
  @Column({ name: 'domain_verification_token', type: 'varchar', length: 64, nullable: true })
  domainVerificationToken!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

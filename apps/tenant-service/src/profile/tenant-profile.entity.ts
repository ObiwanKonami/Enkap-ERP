import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type OnboardingStep = 'profile' | 'plan' | 'card' | 'completed';

/**
 * Tenant şirket profili.
 *
 * Control plane veritabanında tutulur — e-Fatura (GİB), bordro, raporlama
 * gibi servisler buradan şirket kimliğini çeker.
 *
 * Fatura seri no üretimi: invoice_prefix + next_invoice_seq (atomik PostgreSQL sequence)
 */
@Entity('tenant_profiles')
export class TenantProfile {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'company_name', type: 'varchar', length: 200 })
  companyName!: string;

  @Column({ name: 'trade_name', type: 'varchar', length: 100, nullable: true })
  tradeName!: string | null;

  /** B2B için VKN (10 hane), B2C için null */
  @Column({ type: 'char', length: 10, nullable: true })
  vkn!: string | null;

  /** Şahıs işletmesi için TCKN (11 hane) */
  @Column({ type: 'char', length: 11, nullable: true })
  tckn!: string | null;

  @Column({ name: 'tax_office', type: 'varchar', length: 100, nullable: true })
  taxOffice!: string | null;

  /** İşyeri SGK numarası (bordro başlığında gösterilir) */
  @Column({ name: 'sgk_employer_no', type: 'varchar', length: 20, nullable: true })
  sgkEmployerNo!: string | null;

  /** MERSİS numarası (16 hane — fatura ve resmi belgeler) */
  @Column({ name: 'mersis_no', type: 'varchar', length: 16, nullable: true })
  mersisNo!: string | null;

  @Index('idx_phone_unique', { unique: true, where: '"phone" IS NOT NULL' })
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 10, nullable: true })
  postalCode!: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Türkiye' })
  country!: string;

  /** IBAN — TR formatı (26 hane) */
  @Column({ type: 'varchar', length: 34, nullable: true })
  iban!: string | null;

  /** Fatura seri kodu (örn: 'ENK', 'ACM') — GİB fatura standardı */
  @Column({ name: 'invoice_prefix', type: 'varchar', length: 10, default: 'ENK' })
  invoicePrefix!: string;

  /** Bir sonraki fatura sıra numarası */
  @Column({ name: 'next_invoice_seq', type: 'int', default: 1 })
  nextInvoiceSeq!: number;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl!: string | null;

  /** Onboarding wizard adımı */
  @Column({ name: 'onboarding_step', type: 'varchar', length: 30, default: 'profile' })
  onboardingStep!: OnboardingStep;

  @Column({ name: 'onboarding_done', type: 'boolean', default: false })
  onboardingDone!: boolean;

  // ─── Finans Varsayılanları ─────────────────────────────────────────────────

  /** Varsayılan KDV oranı: 0, 1, 10, 20 (2023 sonrası Türkiye oranları) */
  @Column({ name: 'default_kdv_rate', type: 'smallint', default: 20 })
  defaultKdvRate!: number;

  /** Varsayılan ödeme vadesi (gün) — fatura ve sipariş oluştururken ön doldurma */
  @Column({ name: 'default_payment_term_days', type: 'smallint', default: 30 })
  defaultPaymentTermDays!: number;

  /**
   * AR/AP hatırlatma günleri.
   * Negatif = vadeden X gün önce (upcoming), Pozitif = X gün gecikmede (overdue_X)
   * Örn: [-3, 1, 7, 30]
   */
  @Column({ name: 'ar_reminder_days', type: 'int', array: true, default: () => "'{-3,1,7,30}'" })
  arReminderDays!: number[];

  /** Varsayılan para birimi (ISO 4217: TRY, USD, EUR, GBP) */
  @Column({ name: 'default_currency', type: 'varchar', length: 3, default: 'TRY' })
  defaultCurrency!: string;

  /** Maksimum izin verilen iskonto oranı (0-100) */
  @Column({ name: 'max_discount_rate', type: 'numeric', precision: 5, scale: 2, default: 100 })
  maxDiscountRate!: number;

  /** Varsayılan minimum stok miktarı — stok uyarı eşiği */
  @Column({ name: 'default_min_stock_qty', type: 'numeric', precision: 15, scale: 4, default: 0 })
  defaultMinStockQty!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** VKN veya TCKN (GİB'e gönderilecek vergi kimliği) */
  get taxId(): string {
    return this.vkn ?? this.tckn ?? '';
  }

  /** Fatura seri+sıra no üretici: ENK-2026-000001 */
  buildInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const seq  = String(this.nextInvoiceSeq).padStart(6, '0');
    return `${this.invoicePrefix}-${year}-${seq}`;
  }
}

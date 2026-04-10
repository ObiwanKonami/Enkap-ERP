import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

/**
 * Abonelik Planı.
 * Control plane'de saklanır — tüm tenant'lar için ortaktır.
 */
@Entity('billing_plans')
export class BillingPlan {
  /** 'starter' | 'business' | 'enterprise' */
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id!: string;

  @Column({ type: 'varchar', length: 50 })
  name!: string;

  /** Aylık fiyat — kuruş (0 = özel fiyat, enterprise) */
  @Column({ name: 'price_kurus', type: 'bigint' })
  priceKurus!: number;

  @Column({ name: 'max_users', type: 'smallint' })
  maxUsers!: number;

  /** 0 = sınırsız */
  @Column({ name: 'max_invoices_month', type: 'int' })
  maxInvoicesMonth!: number;

  @Column({ name: 'has_ml', default: false })
  hasMl!: boolean;

  @Column({ name: 'has_marketplace', default: false })
  hasMarketplace!: boolean;

  @Column({ name: 'has_hr', default: false })
  hasHr!: boolean;

  /**
   * Yıllık fiyat — kuruş (0 = yıllık seçenek yok)
   * Genellikle aylık fiyatın ~10 katı (2 ay bedava)
   */
  @Column({ name: 'annual_price_kurus', type: 'bigint', default: 0 })
  annualPriceKurus!: number;

  /**
   * Plan özellikleri — görüntüleme için string listesi
   * Örn: ["5 kullanıcı", "Fatura + Stok", "E-posta desteği"]
   */
  @Column({ type: 'jsonb', default: '[]' })
  features!: string[];

  /** iyzico pricingPlanReferenceCode */
  @Column({ name: 'iyzico_plan_ref', type: 'varchar', length: 100, nullable: true })
  iyzicoplanRef!: string | null;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  AfterLoad,
} from 'typeorm';

export type ContactSource = 'referral' | 'web' | 'social' | 'cold_call' | 'other';
export type ContactType   = 'customer' | 'vendor' | 'both' | 'prospect';

/**
 * CRM kişi / müşteri adayı.
 *
 * Bir kişi birden fazla fırsatla (crm_leads) ilişkili olabilir.
 * owner_user_id → kişiyi yöneten satış temsilcisi (users tablosuna soft FK).
 */
@Entity('crm_contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Ad (B2C) veya firma adı (B2B) — tam isim burada saklanır */
  @Column({ name: 'first_name', type: 'varchar', length: 200 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  /** Kişi türü: müşteri / tedarikçi / her ikisi / aday */
  @Column({ name: 'contact_type', type: 'varchar', length: 20, default: 'customer' })
  type!: ContactType;

  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 200, nullable: true })
  companyName!: string | null;

  /** Vergi Kimlik Numarası (10 hane, B2B) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  vkn!: string | null;

  /** TC Kimlik Numarası (11 hane, B2C) */
  @Column({ type: 'varchar', length: 11, nullable: true })
  tckn!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  district!: string | null;

  /** Vergi Dairesi (B2B) */
  @Column({ name: 'tax_office', type: 'varchar', length: 100, nullable: true })
  taxOffice!: string | null;

  /** MERSİS Numarası (16 hane, B2B) */
  @Column({ name: 'mersis_no', type: 'varchar', length: 16, nullable: true })
  mersisNo!: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  source!: ContactSource | null;

  /** Etiketler: ["vip", "e-ticaret"] */
  @Column({ type: 'jsonb', default: [] })
  tags!: string[];

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Frontend'e tek 'name' alanı olarak dön */
  name!: string;

  @AfterLoad()
  setName() {
    this.name = this.companyName ?? this.firstName;
  }
}

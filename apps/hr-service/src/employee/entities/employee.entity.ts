import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SalaryType    = 'monthly' | 'hourly';
export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

/**
 * Çalışan Kaydı.
 *
 * KVKK: TCKN ve banka bilgisi hassas kişisel veri (özel nitelikli).
 * Maskeleme: API yanıtlarında TCKN son 4 hane gösterilir.
 * Saklama: AES-256 (Vault) — TODO: Faz 3 hardening
 */
@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** İç sicil numarası — tenant içinde benzersiz */
  @Column({ name: 'sicil_no', type: 'varchar', length: 30 })
  sicilNo!: string;

  /** TC Kimlik Numarası — 11 hane */
  @Column({ type: 'varchar', length: 11 })
  tckn!: string;

  /** SGK Sicil / Sigorta Numarası */
  @Column({ name: 'sgk_no', type: 'varchar', length: 20, nullable: true })
  sgkNo!: string | null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  surname!: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gender!: 'male' | 'female' | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate!: Date | null;

  @Column({ name: 'hire_date', type: 'date' })
  hireDate!: Date;

  @Column({ name: 'termination_date', type: 'date', nullable: true })
  terminationDate!: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title!: string | null;

  /** Aylık/saatlik brüt ücret — kuruş cinsinden */
  @Column({ name: 'gross_salary_kurus', type: 'bigint' })
  grossSalaryKurus!: number;

  @Column({ name: 'salary_type', type: 'varchar', length: 10, default: 'monthly' })
  salaryType!: SalaryType;

  /** Kurumsal e-posta — bordro pusulası gönderimi için */
  @Column({ type: 'varchar', length: 200, nullable: true })
  email!: string | null;

  /** IBAN — ödeme için */
  @Column({ name: 'bank_iban', type: 'varchar', length: 34, nullable: true })
  bankIban!: string | null;

  /**
   * Engelli indirimi derecesi (0 = yok, 1/2/3 = birinci/ikinci/üçüncü derece).
   * Gelir vergisi hesaplamasını etkiler.
   */
  @Column({ name: 'disability_degree', type: 'smallint', default: 0 })
  disabilityDegree!: 0 | 1 | 2 | 3;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: EmployeeStatus;

  /** Cep / iş telefonu */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  /**
   * Ehliyet sınıfı — yalnızca sürücü olarak çalışan personelde dolu.
   * Fleet servisine otomatik senkronizasyon bu alan üzerinden tetiklenir.
   */
  @Column({ name: 'license_class', type: 'varchar', length: 5, nullable: true })
  licenseClass!: string | null;

  @Column({ name: 'license_number', type: 'varchar', length: 50, nullable: true })
  licenseNumber!: string | null;

  /** Ehliyet son geçerlilik tarihi */
  @Column({ name: 'license_expires', type: 'date', nullable: true })
  licenseExpires!: string | null;

  // ─── V059: BES & İcra ────────────────────────────────────────────────────
  /** BES otomatik katılım — çalışan opt-out yaptıysa true */
  @Column({ name: 'bes_opt_out', type: 'boolean', default: false })
  besOptOut!: boolean;

  /** İcra (maaş haczi) var mı */
  @Column({ name: 'has_icra', type: 'boolean', default: false })
  hasIcra!: boolean;

  /** İcra kesinti oranı (net maaş üzerinden, 0.00–1.00) */
  @Column({ name: 'icra_rate', type: 'numeric', precision: 5, scale: 4, nullable: true })
  icraRate!: number | null;

  /** İcra sabit kesinti tutarı (kuruş) — oran yerine sabit tutar uygulanıyorsa */
  @Column({ name: 'icra_fixed_kurus', type: 'bigint', nullable: true })
  icraFixedKurus!: number | null;

  // ─── V060: SGK İşten Çıkış Kodu ─────────────────────────────────────────
  /** SGK işten çıkış kodu (01–34) */
  @Column({ name: 'sgk_termination_code', type: 'varchar', length: 2, nullable: true })
  sgkTerminationCode!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** Tam ad */
  get fullName(): string {
    return `${this.name} ${this.surname}`;
  }
}

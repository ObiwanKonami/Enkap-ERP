import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AuditAction =
  | 'READ'       // Kişisel veriye erişim
  | 'CREATE'     // Kayıt oluşturma
  | 'UPDATE'     // Kayıt güncelleme
  | 'DELETE'     // Kayıt silme
  | 'EXPORT'     // Veri dışa aktarma (PDF, Excel)
  | 'AUTH'       // Kimlik doğrulama olayı
  | 'PERMISSION'; // Yetki değişikliği

export type AuditResource =
  | 'employee.tckn'       // Çalışan TCKN erişimi
  | 'employee.iban'       // Çalışan banka bilgisi
  | 'customer.identity'   // Müşteri TC/pasaport
  | 'user.password'       // Şifre değişikliği
  | 'user.roles'          // Rol değişikliği
  | 'payroll'             // Bordro verisi
  | 'invoice'             // Fatura
  | 'auth.login'          // Giriş
  | 'auth.logout'         // Çıkış
  | 'auth.failed_login';  // Başarısız giriş

/**
 * KVKK Denetim İzi Kaydı.
 *
 * KVKK Madde 12 gereği kişisel verilere erişim kayıt altına alınmalıdır.
 * Bu entity, denetim amacıyla her erişimi loglar.
 *
 * Saklama:
 *  - KVKK: Minimum 3 yıl
 *  - Bu kayıtlar DELETİON'a tabi değildir (soft delete bile olmamalı)
 *  - Partition by month için: audit_logs_YYYY_MM
 *
 * Notlar:
 *  - IP adresi KVKK kapsamında kişisel veri sayılabilir;
 *    ancak güvenlik amaçlı saklama KVKK'nın 5/2-f maddesi
 *    (meşru menfaat) kapsamında değerlendirilebilir.
 *  - `details` JSONB'de kişisel veri saklanmaz; yalnızca ID/referans saklanır.
 */
@Entity('audit_logs')
@Index(['tenantId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['resource', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** İşlemi yapan kullanıcı */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  /** Kullanıcı e-postası (log anında snapshot — sonradan değişebilir) */
  @Column({ name: 'user_email', type: 'varchar', length: 200, nullable: true })
  userEmail!: string | null;

  /** Gerçekleştirilen eylem */
  @Column({ type: 'varchar', length: 20 })
  action!: AuditAction;

  /** Erişilen kaynak / veri türü */
  @Column({ type: 'varchar', length: 50 })
  resource!: AuditResource | string;

  /** Erişilen kaydın ID'si (fatura ID, çalışan ID vb.) */
  @Column({ name: 'resource_id', type: 'varchar', length: 100, nullable: true })
  resourceId!: string | null;

  /** HTTP metodu (GET, POST, PATCH, DELETE) */
  @Column({ name: 'http_method', type: 'varchar', length: 10, nullable: true })
  httpMethod!: string | null;

  /** İstek yolu (/api/employees/xxx) */
  @Column({ name: 'request_path', type: 'varchar', length: 500, nullable: true })
  requestPath!: string | null;

  /** İstemci IP adresi */
  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress!: string | null;

  /** Sonuç: başarılı mı? */
  @Column({ name: 'is_success', type: 'boolean', default: true })
  isSuccess!: boolean;

  /** Ek bağlam (ID referansları, hata kodu — kişisel veri OLMAZ) */
  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

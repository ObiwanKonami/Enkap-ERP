export type AuditAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'AUTH' | 'PERMISSION';
export type AuditResource = 'employee.tckn' | 'employee.iban' | 'customer.identity' | 'user.password' | 'user.roles' | 'payroll' | 'invoice' | 'auth.login' | 'auth.logout' | 'auth.failed_login';
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
export declare class AuditLog {
    id: string;
    tenantId: string;
    /** İşlemi yapan kullanıcı */
    userId: string | null;
    /** Kullanıcı e-postası (log anında snapshot — sonradan değişebilir) */
    userEmail: string | null;
    /** Gerçekleştirilen eylem */
    action: AuditAction;
    /** Erişilen kaynak / veri türü */
    resource: AuditResource | string;
    /** Erişilen kaydın ID'si (fatura ID, çalışan ID vb.) */
    resourceId: string | null;
    /** HTTP metodu (GET, POST, PATCH, DELETE) */
    httpMethod: string | null;
    /** İstek yolu (/api/employees/xxx) */
    requestPath: string | null;
    /** İstemci IP adresi */
    ipAddress: string | null;
    /** Sonuç: başarılı mı? */
    isSuccess: boolean;
    /** Ek bağlam (ID referansları, hata kodu — kişisel veri OLMAZ) */
    details: Record<string, unknown> | null;
    createdAt: Date;
}

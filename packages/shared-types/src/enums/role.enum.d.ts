/**
 * Sistem rolleri — tenant bazında atanır.
 * JWT payload'ındaki user_roles dizisiyle eşleşir.
 *
 * Roller tenant-seeder.ts'de oluşturulur ve roles tablosunda saklanır.
 * Her rol permissions (JSONB) dizisiyle ilişkilendirilir.
 */
export declare enum Role {
    /** Tüm modüllere tam erişim — tüm kısıtlamaları geçer */
    SISTEM_ADMIN = "sistem_admin",
    /** Finans, muhasebe, fatura, hesaplar */
    MUHASEBECI = "muhasebeci",
    /** Stok, depo, ürün yönetimi */
    DEPO_SORUMLUSU = "depo_sorumlusu",
    /** Tedarikçi, satın alma siparişleri, stok görüntüleme */
    SATIN_ALMA = "satin_alma",
    /** İK: çalışan, izin, devam, bordro */
    IK_YONETICISI = "ik_yoneticisi",
    /** CRM: kişi, fırsat, aktivite yönetimi */
    SATIS_TEMSILCISI = "satis_temsilcisi",
    /** Yalnızca görüntüleme — hiçbir yazma işlemi yapamaz */
    SALT_OKUNUR = "salt_okunur"
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Role = void 0;
/**
 * Sistem rolleri — tenant bazında atanır.
 * JWT payload'ındaki user_roles dizisiyle eşleşir.
 *
 * Roller tenant-seeder.ts'de oluşturulur ve roles tablosunda saklanır.
 * Her rol permissions (JSONB) dizisiyle ilişkilendirilir.
 */
var Role;
(function (Role) {
    /** Tüm modüllere tam erişim — tüm kısıtlamaları geçer */
    Role["SISTEM_ADMIN"] = "sistem_admin";
    /** Finans, muhasebe, fatura, hesaplar */
    Role["MUHASEBECI"] = "muhasebeci";
    /** Stok, depo, ürün yönetimi */
    Role["DEPO_SORUMLUSU"] = "depo_sorumlusu";
    /** Tedarikçi, satın alma siparişleri, stok görüntüleme */
    Role["SATIN_ALMA"] = "satin_alma";
    /** İK: çalışan, izin, devam, bordro */
    Role["IK_YONETICISI"] = "ik_yoneticisi";
    /** CRM: kişi, fırsat, aktivite yönetimi */
    Role["SATIS_TEMSILCISI"] = "satis_temsilcisi";
    /** Yalnızca görüntüleme — hiçbir yazma işlemi yapamaz */
    Role["SALT_OKUNUR"] = "salt_okunur";
})(Role || (exports.Role = Role = {}));

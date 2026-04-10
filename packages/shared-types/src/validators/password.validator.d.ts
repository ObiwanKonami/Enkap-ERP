/**
 * Şifre Politikası Doğrulama
 *
 * Minimum gereksinimler:
 *  - 8 karakter minimum uzunluk
 *  - En az 1 büyük harf (A-Z)
 *  - En az 1 küçük harf (a-z)
 *  - En az 1 rakam (0-9)
 *  - En az 1 özel karakter (!@#$%^&*...)
 *  - 72 karakter maksimum (bcrypt sınırı)
 *
 * Aşırı kısıtlayıcı olmamak için:
 *  - Türkçe karakterler (ğ, ü, ş, ı, ö, ç) kabul edilir
 *  - Boşluk içerebilir (passphrase desteği)
 *
 * Kullanım:
 *   const errors = validatePassword(newPassword);
 *   if (errors.length > 0) throw new BadRequestException({ errors });
 */
export interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validatePassword(password: string): PasswordValidationResult;

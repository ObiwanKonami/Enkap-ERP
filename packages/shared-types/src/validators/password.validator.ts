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

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Şifre boş olamaz'] };
  }

  if (password.length < 8) {
    errors.push('Şifre en az 8 karakter olmalıdır');
  }

  if (password.length > 72) {
    errors.push('Şifre 72 karakteri geçemez');
  }

  // En az 1 büyük harf
  if (!/[A-ZÇĞİÖŞÜ]/.test(password)) {
    errors.push('Şifre en az bir büyük harf içermelidir (A-Z)');
  }

  // En az 1 küçük harf
  if (!/[a-zçğışöü]/.test(password)) {
    errors.push('Şifre en az bir küçük harf içermelidir (a-z)');
  }

  // En az 1 rakam
  if (!/\d/.test(password)) {
    errors.push('Şifre en az bir rakam içermelidir (0-9)');
  }

  // En az 1 özel karakter
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
    errors.push('Şifre en az bir özel karakter içermelidir (!@#$%^&* vb.)');
  }

  // Yaygın zayıf şifreler
  const WEAK_PATTERNS = ['password', 'şifre', '12345678', 'qwerty', 'admin'];
  const lowerPass = password.toLowerCase();
  if (WEAK_PATTERNS.some((w) => lowerPass.includes(w))) {
    errors.push('Şifre çok yaygın bir örüntü içeriyor — daha güçlü bir şifre seçin');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

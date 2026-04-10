/**
 * Başlangıç Ortam Değişkeni Doğrulama
 *
 * Her servisin main.ts'inde, NestFactory.create'ten önce çağrılır.
 * Eksik veya zayıf kritik env var'lar tespit edilirse servis başlamaz.
 *
 * Kullanım:
 *   validateEnv(['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL']);
 *   validateEnv(['IYZICO_API_KEY'], { service: 'billing-service' });
 */

export interface ValidateEnvOptions {
  /** Hata mesajlarında gösterilecek servis adı */
  service?: string;
}

/**
 * Belirtilen env var'ların varlığını ve minimum güvenlik gereksinimlerini kontrol eder.
 * Herhangi bir sorun tespit edilirse process.exit(1) ile sonlandırır.
 */
export function validateEnv(
  requiredVars: string[],
  options: ValidateEnvOptions = {},
): void {
  const serviceName = options.service ?? 'Service';
  const errors: string[] = [];

  for (const varName of requiredVars) {
    const value = process.env[varName];

    if (!value || value.trim() === '') {
      errors.push(`${varName} tanımlanmamış veya boş`);
      continue;
    }

    // JWT_SECRET için minimum güvenlik kontrolü
    if (varName === 'JWT_SECRET') {
      if (value.length < 32) {
        errors.push(
          `JWT_SECRET çok kısa (${value.length} karakter) — minimum 32 karakter gerekli`,
        );
      }
      // Basit ve yaygın zayıf değer kontrolü
      const weakValues = ['secret', 'jwt_secret', 'changeme', 'your_jwt_secret', '12345678901234567890123456789012'];
      if (weakValues.some((w) => value.toLowerCase().includes(w))) {
        errors.push('JWT_SECRET güvensiz bir değer içeriyor — rastgele 64+ karakter kullanın');
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n[${serviceName}] Başlatma hatası — ortam değişkeni sorunları:\n`);
    for (const err of errors) {
      console.error(`  ✗ ${err}`);
    }
    console.error('\nServis başlatılmıyor. Ortam değişkenlerini düzeltin.\n');
    process.exit(1);
  }
}

/** Auth servisine özgü zorunlu değişkenler */
export const AUTH_REQUIRED_ENV = [
  'JWT_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_REFRESH_SECRET',
];

/** Finansal servise özgü zorunlu değişkenler */
export const FINANCIAL_REQUIRED_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
  'GIB_USERNAME',
  'GIB_PASSWORD',
  'GIB_SIGNER_ENDPOINT',
];

/** Billing servisine özgü zorunlu değişkenler */
export const BILLING_REQUIRED_ENV = [
  'DATABASE_URL',
  'IYZICO_API_KEY',
  'IYZICO_SECRET_KEY',
];

/** Tüm NestJS servisler için ortak zorunlu değişkenler */
export const COMMON_REQUIRED_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
];

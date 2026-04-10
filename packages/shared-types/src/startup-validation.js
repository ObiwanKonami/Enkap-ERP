"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMON_REQUIRED_ENV = exports.BILLING_REQUIRED_ENV = exports.FINANCIAL_REQUIRED_ENV = exports.AUTH_REQUIRED_ENV = void 0;
exports.validateEnv = validateEnv;
/**
 * Belirtilen env var'ların varlığını ve minimum güvenlik gereksinimlerini kontrol eder.
 * Herhangi bir sorun tespit edilirse process.exit(1) ile sonlandırır.
 */
function validateEnv(requiredVars, options = {}) {
    const serviceName = options.service ?? 'Service';
    const errors = [];
    for (const varName of requiredVars) {
        const value = process.env[varName];
        if (!value || value.trim() === '') {
            errors.push(`${varName} tanımlanmamış veya boş`);
            continue;
        }
        // JWT_SECRET için minimum güvenlik kontrolü
        if (varName === 'JWT_SECRET') {
            if (value.length < 32) {
                errors.push(`JWT_SECRET çok kısa (${value.length} karakter) — minimum 32 karakter gerekli`);
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
exports.AUTH_REQUIRED_ENV = [
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_REFRESH_SECRET',
];
/** Finansal servise özgü zorunlu değişkenler */
exports.FINANCIAL_REQUIRED_ENV = [
    'DATABASE_URL',
    'REDIS_URL',
    'GIB_USERNAME',
    'GIB_PASSWORD',
    'GIB_SIGNER_ENDPOINT',
];
/** Billing servisine özgü zorunlu değişkenler */
exports.BILLING_REQUIRED_ENV = [
    'DATABASE_URL',
    'IYZICO_API_KEY',
    'IYZICO_SECRET_KEY',
];
/** Tüm NestJS servisler için ortak zorunlu değişkenler */
exports.COMMON_REQUIRED_ENV = [
    'DATABASE_URL',
    'REDIS_URL',
];

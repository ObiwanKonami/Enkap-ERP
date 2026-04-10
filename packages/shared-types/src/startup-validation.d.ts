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
export declare function validateEnv(requiredVars: string[], options?: ValidateEnvOptions): void;
/** Auth servisine özgü zorunlu değişkenler */
export declare const AUTH_REQUIRED_ENV: string[];
/** Finansal servise özgü zorunlu değişkenler */
export declare const FINANCIAL_REQUIRED_ENV: string[];
/** Billing servisine özgü zorunlu değişkenler */
export declare const BILLING_REQUIRED_ENV: string[];
/** Tüm NestJS servisler için ortak zorunlu değişkenler */
export declare const COMMON_REQUIRED_ENV: string[];

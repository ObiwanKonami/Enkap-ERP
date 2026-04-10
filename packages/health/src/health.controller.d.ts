import { HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator, type HealthCheckResult } from '@nestjs/terminus';
/**
 * Kubernetes sağlık probe'ları.
 *
 * GET /health       → Liveness probe (servis çalışıyor mu?)
 * GET /health/ready → Readiness probe (istek almaya hazır mı?)
 *
 * Liveness:  bellek tükenmesi / process donması tespiti
 * Readiness: veritabanı bağlantısı hazır mı?
 *
 * K8s konfigürasyonu:
 *   livenessProbe → /health
 *   readinessProbe → /health/ready
 */
export declare class HealthController {
    private readonly health;
    private readonly db;
    private readonly memory;
    constructor(health: HealthCheckService, db: TypeOrmHealthIndicator, memory: MemoryHealthIndicator);
    /**
     * Liveness probe.
     * Sadece bellek kontrolü — DB bağlantısı liveness'ı etkilememeli
     * (geçici DB kopması pod'u restart etmemeli).
     */
    liveness(): Promise<HealthCheckResult>;
    /**
     * Readiness probe.
     * Veritabanı ping + bellek kontrolü.
     * Bu başarısız olursa K8s trafiği başka pod'a yönlendirir.
     */
    readiness(): Promise<HealthCheckResult>;
}

import { HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator, type HealthCheckResult } from '@nestjs/terminus';
/**
 * control_plane named DataSource kullanan servisler için sağlık kontrol'ü.
 * (tenant-service, billing-service, analytics-service)
 */
export declare class ControlPlaneHealthController {
    private readonly health;
    private readonly db;
    private readonly memory;
    constructor(health: HealthCheckService, db: TypeOrmHealthIndicator, memory: MemoryHealthIndicator);
    liveness(): Promise<HealthCheckResult>;
    readiness(): Promise<HealthCheckResult>;
}

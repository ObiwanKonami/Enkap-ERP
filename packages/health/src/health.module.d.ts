/**
 * Paylaşılan sağlık kontrol modülü.
 *
 * Kullanım — her NestJS servisinde:
 *   import { HealthModule } from '@enkap/health';
 *   @Module({ imports: [..., HealthModule] })
 *
 * Otomatik olarak şu endpoint'leri ekler:
 *   GET /health        (liveness — bellek)
 *   GET /health/ready  (readiness — DB ping + bellek)
 *
 * Not: TypeOrmModule en az bir DataSource sağlamalı.
 * control_plane DataSource olan servislerde DB adı belirtilmeli:
 *   TypeOrmHealthIndicator.pingCheck('database', { connection: 'control_plane' })
 * Bunun için ControlPlaneHealthModule kullanın (bu dosyanın altında).
 */
export declare class HealthModule {
}

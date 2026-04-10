import { Controller, Get } from '@nestjs/common';

/**
 * Kubernetes sağlık probe'ları.
 *
 * GET /health       → Liveness probe (servis çalışıyor mu?)
 * GET /health/ready → Readiness probe (istek almaya hazır mı?)
 *
 * @nestjs/terminus kaldırıldı — reflect-metadata çakışma sorunu önlemek için.
 * K8s probe'ları için HTTP 200 yeterli.
 */
@Controller('health')
export class HealthController {
  @Get()
  liveness() {
    const heapUsed = process.memoryUsage().heapUsed;
    return { status: 'ok', heapUsedMb: Math.round(heapUsed / 1024 / 1024) };
  }

  @Get('ready')
  readiness() {
    return { status: 'ok' };
  }
}

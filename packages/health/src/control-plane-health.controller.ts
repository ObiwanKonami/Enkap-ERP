import { Controller, Get } from '@nestjs/common';

/**
 * control_plane named DataSource kullanan servisler için sağlık kontrol'ü.
 * (tenant-service, billing-service, analytics-service)
 *
 * @nestjs/terminus kaldırıldı — reflect-metadata çakışma sorunu önlemek için.
 */
@Controller('health')
export class ControlPlaneHealthController {
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

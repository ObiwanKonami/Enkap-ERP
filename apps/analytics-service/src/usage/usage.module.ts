import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '@enkap/database';
import { TenantUsageMetric }      from './tenant-usage.entity';
import { PlatformMetricsSnapshot } from '../platform/platform-metrics.entity';
import { UsageCollectorService }  from './usage-collector.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantUsageMetric, PlatformMetricsSnapshot], 'control_plane'),
    TenantModule,
  ],
  providers: [UsageCollectorService],
  exports:   [UsageCollectorService],
})
export class UsageModule {}

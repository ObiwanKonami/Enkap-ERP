import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformMetricsSnapshot } from './platform-metrics.entity';
import { PlatformMetricsService }  from './platform-metrics.service';
import { PlatformMetricsController } from './platform-metrics.controller';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformMetricsSnapshot], 'control_plane'),
    UsageModule,
  ],
  controllers: [PlatformMetricsController],
  providers:   [PlatformMetricsService],
})
export class PlatformMetricsModule {}

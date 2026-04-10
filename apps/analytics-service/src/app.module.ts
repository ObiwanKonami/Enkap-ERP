import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ControlPlaneHealthModule, MetricsMiddleware } from '@enkap/health';
import { TenantContextMiddleware } from '@enkap/database';
import { PlatformMetricsSnapshot } from './platform/platform-metrics.entity';
import { TenantUsageMetric }       from './usage/tenant-usage.entity';
import { ReportDefinition }        from './bi/entities/report-definition.entity';
import { Dashboard }               from './bi/entities/dashboard.entity';
import { Widget }                  from './bi/entities/widget.entity';
import { PlatformMetricsModule }   from './platform/platform-metrics.module';
import { BIModule }                from './bi/bi.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // Control plane bağlantısı (tenant_routing, subscriptions, analytics, BI tabloları)
    TypeOrmModule.forRootAsync({
      name: 'control_plane',
      imports:        [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:     'postgres',
        url:      (config.get('DATABASE_URL') as string | undefined),
        schema:   'public',
        entities: [
          PlatformMetricsSnapshot,
          TenantUsageMetric,
          // Sprint 6B: BI modülü entity'leri
          ReportDefinition,
          Dashboard,
          Widget,
        ],
        synchronize: false,
        ssl: config.get('NODE_ENV') === 'production'
          ? { rejectUnauthorized: true }
          : false,
        applicationName: 'enkap_analytics',
      }),
      inject: [ConfigService],
    }),

    PlatformMetricsModule,
    ControlPlaneHealthModule,

    // Sprint 6B: BI / Özel Raporlama modülü
    BIModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    // Tenant context propagasyonu — getTenantContext() için zorunlu
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

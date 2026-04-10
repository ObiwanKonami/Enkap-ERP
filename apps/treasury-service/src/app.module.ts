import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { TenantModule, TenantContextMiddleware } from '@enkap/database';
import { AccountModule }    from './account/account.module';
import { HrEventsConsumer } from './events/hr-events.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Tenant şeması üzerinde çalışan ana DataSource
    TypeOrmModule.forRootAsync({
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:               'postgres',
        url:                config.get('DATABASE_URL'),
        schema:             'public',
        entities:           [],
        autoLoadEntities:   true,
        synchronize:        config.get('NODE_ENV') !== 'production',
        ssl:                false,
        applicationName:    'enkap_treasury_service',
      }),
      inject: [ConfigService],
    }),

    // TenantRoutingService için control_plane DataSource
    TypeOrmModule.forRootAsync({
      name:       'control_plane',
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:               'postgres',
        url:                config.get('DATABASE_URL'),
        schema:             'public',
        entities:           [],
        synchronize:        false,
        ssl:                false,
        applicationName:    'enkap_treasury_service_cp',
      }),
      inject: [ConfigService],
    }),

    TenantModule,
    AccountModule,
    HealthModule,
  ],
  providers: [HrEventsConsumer],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

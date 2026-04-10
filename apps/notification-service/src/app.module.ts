import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { TenantModule, TenantContextMiddleware } from '@enkap/database';
import { NotificationModule }  from './notification/notification.module';
import { NotificationConsumer } from './events/notification-consumer';
import { NotificationService }  from './notification/notification.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:            'postgres',
        url:             config.get<string>('DATABASE_URL'),
        schema:          'public',
        entities:        [],
        synchronize:     false,
        ssl:             false,
        applicationName: 'enkap_notification_service',
      }),
      inject: [ConfigService],
    }),

    TypeOrmModule.forRootAsync({
      name:       'control_plane',
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:            'postgres',
        url:             config.get('CONTROL_PLANE_DATABASE_URL') ?? config.get('DATABASE_URL'),
        schema:          'public',
        entities:        [],
        synchronize:     false,
        ssl:             false,
        applicationName: 'enkap_notification_service_cp',
      }),
      inject: [ConfigService],
    }),

    TenantModule,
    NotificationModule,
    HealthModule,
  ],
  providers: [NotificationConsumer],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

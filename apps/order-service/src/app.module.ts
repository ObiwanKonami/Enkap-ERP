import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TenantModule,
  TenantContextMiddleware,
} from '@enkap/database';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { SalesOrderModule } from './sales-order/sales-order.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Varsayılan DataSource — TenantDataSourceManager metadata için gerekli
    // Entity CRUD işlemleri TenantDataSourceManager.getDataSource() üzerinden yapılır
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type:        'postgres',
        url:          (cfg.get('DATABASE_URL') as string) ?? 'postgresql://enkap_admin:localdev_only@localhost:5432/enkap_control_plane',
        entities:    [],
        synchronize: false,
        logging:     false,
      }),
    }),

    TypeOrmModule.forRootAsync({
      name: 'control_plane',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        name:        'control_plane',
        type:        'postgres',
        url:          (cfg.get('CONTROL_PLANE_DATABASE_URL') ?? cfg.get('DATABASE_URL') ?? 'postgresql://enkap_admin:localdev_only@localhost:5432/enkap_control_plane') as string,
        entities:    [],
        synchronize: false,
        logging:     false,
      }),
    }),

    TenantModule,
    HealthModule,
    SalesOrderModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

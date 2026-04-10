import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TenantModule,
  TenantContextMiddleware,
} from '@enkap/database';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { BomModule }       from './bom/bom.module';
import { WorkOrderModule } from './work-order/work-order.module';
import { MrpModule }       from './mrp/mrp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Control Plane bağlantısı — yalnızca tenant yönlendirme kayıtları için
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type:        'postgres',
        url:          cfg.get('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/enkap'),
        entities:    [],          // Tenant verileri TenantDataSourceManager üzerinden erişilir
        synchronize: false,
        logging:     false,
        applicationName: 'enkap_manufacturing_service',
      }),
    }),

    TypeOrmModule.forRootAsync({
      name: 'control_plane',
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        name:        'control_plane',
        type:        'postgres',
        url:          (cfg.get('CONTROL_PLANE_DATABASE_URL') ?? cfg.get('DATABASE_URL') ?? 'postgresql://postgres:postgres@localhost:5432/enkap') as string,
        entities:    [],
        synchronize: false,
        logging:     false,
        applicationName: 'enkap_manufacturing_service_cp',
      }),
    }),

    TenantModule,
    HealthModule,
    BomModule,
    WorkOrderModule,
    MrpModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

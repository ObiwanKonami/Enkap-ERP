import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule }  from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { TenantModule, TenantContextMiddleware } from '@enkap/database';
import { ProductModule }       from './product/product.module';
import { WarehouseModule }     from './warehouse/warehouse.module';
import { MovementModule }      from './movement/movement.module';
import { IrsaliyeModule }      from './irsaliye/irsaliye.module';
import { MarketplaceModule }   from './marketplace/marketplace.module';
import { EcommerceModule }     from './ecommerce/ecommerce.module';
import { StockReportingModule } from './reporting/reporting.module';
import { LogisticsModule }     from './logistics/logistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Cron job'lar için (lojistik polling, marketplace sync)
    ScheduleModule.forRoot(),

    // Varsayılan DataSource: TenantDataSourceManager'ın ihtiyaç duyduğu metadata için
    // (entity CRUD → TenantDataSourceManager.getDataSource(tenantId) üzerinden yapılır)
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: 'public',
      entities: [],
      autoLoadEntities: true,
      // Tenant entity'leri her zaman migration ile yönetilir — asla synchronize
      synchronize: false,
      ssl: false,
      applicationName: 'enkap_stock_service',
    }),

    // TenantRoutingService için control_plane DataSource (TenantModule bağımlılığı)
    TypeOrmModule.forRoot({
      name: 'control_plane',
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: 'public',
      entities: [],
      synchronize: false,
      ssl: false,
      applicationName: 'enkap_stock_service_cp',
    }),

    TenantModule,
    ProductModule,
    WarehouseModule,
    MovementModule,
    IrsaliyeModule,
    MarketplaceModule,
    EcommerceModule,
    StockReportingModule,
    LogisticsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

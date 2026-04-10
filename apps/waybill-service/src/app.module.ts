import { Module, MiddlewareConsumer, NestModule, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TenantModule,
  TenantContextMiddleware,
  TenantRoutingService,
} from '@enkap/database';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { WaybillModule }           from './waybill/waybill.module';
import { OutboxService }           from './outbox/outbox.service';
import { WaybillEventsConsumer }   from './events/waybill-events.consumer';

/**
 * Waybill Service App Module
 *
 * Outbox cron: setInterval 30sn — bekleyen GİB gönderimlerini işler.
 * TenantRoutingService: aktif tenant listesi → her tenant için outbox tarar.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

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
    WaybillModule,
  ],
  providers: [WaybillEventsConsumer],
})
export class AppModule implements NestModule, OnApplicationBootstrap {
  private readonly logger = new Logger(AppModule.name);

  constructor(
    private readonly outboxService:    OutboxService,
    private readonly tenantRouting:    TenantRoutingService,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }

  /**
   * Uygulama başladıktan sonra GİB outbox cron'unu başlat.
   * Her 30 saniyede bir tüm aktif tenant'ların bekleyen GİB kayıtlarını işler.
   */
  onApplicationBootstrap(): void {
    setInterval(async () => {
      try {
        const tenantIds = await this.tenantRouting.findAllActiveIds();
        await Promise.all(
          tenantIds.map(tid =>
            this.outboxService.processPending(tid).catch((err: unknown) =>
              this.logger.warn(`Outbox hata tenant=${tid}: ${(err as Error).message}`),
            ),
          ),
        );
      } catch (err: unknown) {
        this.logger.error(`Outbox cron hatası: ${(err as Error).message}`);
      }
    }, 30_000);

    this.logger.log('GİB outbox cron başlatıldı (30sn aralık)');
  }
}

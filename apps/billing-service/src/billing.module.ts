import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule }  from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { MailerModule } from '@enkap/mailer';

import { BillingPlan }       from './subscription/plan.entity';
import { Subscription }      from './subscription/subscription.entity';
import { PaymentAttempt }    from './payment/payment-attempt.entity';
import { BillingInvoice }    from './payment/billing-invoice.entity';

import { SubscriptionService }       from './subscription/subscription.service';
import { SubscriptionController }    from './subscription/subscription.controller';
import { RateLimitSyncService }      from './subscription/rate-limit-sync.service';
import { IyzicoClient }              from './payment/iyzico.client';
import { PaymentService }            from './payment/payment.service';
import { DunningService }            from './payment/dunning.service';
import { InvoicePdfService }         from './payment/invoice-pdf.service';
import { TenantEventsConsumer }      from './events/tenant-events.consumer';
import { PlatformSettingsService }   from './platform-settings.service';
import { PlatformSettingsController } from './platform-settings.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Ana billing DB (abonelikler, ödemeler, planlar)
    TypeOrmModule.forRootAsync({
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type:        'postgres',
        url:         config.get('DATABASE_URL')
          ?? 'postgresql://enkap_admin:enkap_pass@localhost:5432/enkap_control_plane',
        entities:    [BillingPlan, Subscription, PaymentAttempt, BillingInvoice],
        synchronize: false,
        ssl: config.get('DB_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),
    // Control Plane DB — platform_settings tablosu için
    TypeOrmModule.forRootAsync({
      name:       'control_plane',
      imports:    [ConfigModule],
      useFactory: (config: ConfigService) => ({
        name:        'control_plane',
        type:        'postgres',
        url:         config.get('CONTROL_PLANE_DATABASE_URL')
          ?? config.get('DATABASE_URL')
          ?? 'postgresql://enkap_admin:enkap_pass@localhost:5432/enkap_control_plane',
        entities:    [],
        synchronize: false,
        ssl: config.get('DB_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : false,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([
      BillingPlan,
      Subscription,
      PaymentAttempt,
      BillingInvoice,
    ]),
    HealthModule,
    MailerModule,
  ],
  controllers: [SubscriptionController, PlatformSettingsController],
  providers:   [
    SubscriptionService,
    IyzicoClient,
    PaymentService,
    DunningService,
    InvoicePdfService,
    RateLimitSyncService,
    TenantEventsConsumer,
    PlatformSettingsService,
  ],
})
export class BillingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}

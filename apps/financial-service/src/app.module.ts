import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule }  from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule, MetricsMiddleware } from '@enkap/health';
import { TenantModule, TenantContextMiddleware } from '@enkap/database';
import { InvoiceModule }   from './invoice/invoice.module';
import { KdvModule }       from './kdv/kdv.module';
import { AccountModule }   from './account/account.module';
import { GibModule }       from './gib/gib.module';
import { EdEfterModule }   from './edefter/edefter.module';
import { ReportingModule } from './reporting/reporting.module';
import { ArApModule }      from './ar-ap/ar-ap.module';
import { BaBsModule }      from './babs/babs.module';
import { AssetModule }     from './asset/asset.module';
import { ProjectModule }  from './project/project.module';
import { BudgetModule }   from './budget/budget.module';
import { CurrencyModule } from './currency/currency.module';
import { UaeModule }      from './uae/uae.module';
import { KsaModule }          from './ksa/ksa.module';
import { JournalEntryModule } from './journal-entry/journal-entry.module';
import { TreasuryEventsConsumer } from './events/treasury-events.consumer';
import { HrEventsConsumer }       from './events/hr-events.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // CurrencyService ExchangeRateService @Cron için gerekli
    ScheduleModule.forRoot(),

    // Varsayılan DataSource: @InjectRepository için (payment-plan, invoice entity'leri)
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: 'public',
      entities: [],
      autoLoadEntities: true,
      // Tenant entity'leri her zaman migration ile yönetilir — asla synchronize
      synchronize: false,
      ssl: false,
      applicationName: 'enkap_financial_service',
    }),

    // TenantRoutingService için control_plane DataSource
    TypeOrmModule.forRoot({
      name: 'control_plane',
      type: 'postgres',
      url: process.env.DATABASE_URL,
      schema: 'public',
      entities: [],
      synchronize: false,
      ssl: false,
      applicationName: 'enkap_financial_service_cp',
    }),

    TenantModule,
    InvoiceModule,
    KdvModule,
    AccountModule,
    GibModule,
    EdEfterModule,
    ReportingModule,
    ArApModule,
    BaBsModule,
    AssetModule,
    ProjectModule,
    BudgetModule,
    // Sprint 7: Uluslararası uyum modülleri
    CurrencyModule,   // 7A: Çoklu para birimi + TCMB kur yönetimi
    UaeModule,        // 7B: UAE FTA VAT + Peppol BIS 3.0
    KsaModule,           // 7C: ZATCA Phase 2 + Zakat
    JournalEntryModule,  // Harici servisler için yevmiye endpoint'i (fleet, HR vb.)
    HealthModule,
  ],
  providers: [TreasuryEventsConsumer, HrEventsConsumer],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}

import { Module } from '@nestjs/common';
import { TenantModule } from '@enkap/database';
import { ExchangeRateService } from '@enkap/shared-types';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';

/**
 * Çoklu Para Birimi Modülü (Sprint 7A).
 *
 * - TCMB günlük kur çekimi (ExchangeRateService via shared-types)
 * - Manuel kur girişi
 * - Dövizli tutar → TRY çevirme (bigint hassasiyet)
 * - Dönem sonu kur farkı hesaplama + yevmiye kaydı (VUK Md.280)
 *
 * Tüm DB işlemleri TenantDataSourceManager üzerinden ham SQL — @InjectRepository kullanılmaz.
 */
@Module({
  imports: [TenantModule],
  providers: [
    CurrencyService,
    ExchangeRateService,
  ],
  controllers: [CurrencyController],
  exports: [CurrencyService],
})
export class CurrencyModule {}

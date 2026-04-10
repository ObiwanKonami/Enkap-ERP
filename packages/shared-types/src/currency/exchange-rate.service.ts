import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import Redis from 'ioredis';
import type {
  SupportedCurrency,
  ExchangeRate,
  MoneyAmount,
} from './multi-currency.types';
import { TCMB_CURRENCY_CODES } from './multi-currency.types';

/** Redis'te kur verisinin saklandığı anahtar */
const rateKey = (currency: string) => `exchange_rate:${currency}:try`;

/** Kur geçerlilik süresi: 25 saat (TCMB günlük günceller, +1 saat buffer) */
const RATE_TTL_SECONDS = 25 * 3600;

/**
 * TCMB Döviz Kuru Servisi.
 *
 * TCMB Elektronik Veri Dağıtım Sistemi (EVDS) üzerinden
 * günlük olarak USD, EUR, GBP, SAR, AED kurlarını çeker.
 *
 * API: https://evds2.tcmb.gov.tr/service/evds/
 * Alternatif (XML): https://www.tcmb.gov.tr/kurlar/today.xml
 *
 * Redis cache stratejisi:
 *  - Her gün 09:30'da TCMB kurlarını günceller (iş günü)
 *  - Hafta sonu/tatil: son geçerli kur kullanılır
 *  - Fallback: Redis'te kur yoksa 1.0 döner ve uyarı loglanır
 *
 * Kullanım:
 *  const rate = await exchangeRateService.getRate('USD');
 *  const tryAmount = exchangeRateService.convert(100, 'USD', rate);
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly redis:  Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL!, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Her gün 09:30 İstanbul'da (TCMB kur ilanından sonra) kurları günceller.
   */
  @Cron('30 9 * * 1-5', { timeZone: 'Europe/Istanbul' })
  async refreshRates(): Promise<void> {
    this.logger.log('TCMB döviz kurları güncelleniyor...');

    try {
      const rates = await this.fetchFromTcmb();

      for (const rate of rates) {
        await this.redis.set(
          rateKey(rate.currency),
          JSON.stringify(rate),
          'EX',
          RATE_TTL_SECONDS,
        );
      }

      this.logger.log(
        `Döviz kurları güncellendi: ${rates.map((r) => `${r.currency}=${r.rateToTry}`).join(', ')}`,
      );
    } catch (err) {
      this.logger.error(
        `TCMB kur güncelleme hatası: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Belirtilen para biriminin TRY karşılığını döner.
   * Redis'te yoksa TCMB'den canlı çeker.
   */
  async getRate(currency: Exclude<SupportedCurrency, 'TRY'>): Promise<ExchangeRate> {
    const cached = await this.redis.get(rateKey(currency));

    if (cached) {
      return JSON.parse(cached) as ExchangeRate;
    }

    this.logger.warn(`Kur önbelleği yok (${currency}) — TCMB'den canlı çekiliyor`);

    try {
      const rates = await this.fetchFromTcmb();
      const rate  = rates.find((r) => r.currency === currency);

      if (rate) {
        await this.redis.set(rateKey(currency), JSON.stringify(rate), 'EX', RATE_TTL_SECONDS);
        return rate;
      }
    } catch (err) {
      this.logger.error(`Kur çekilemedi (${currency}): ${(err as Error).message}`);
    }

    // Fallback: bilinmeyen kur
    this.logger.warn(`Kur bulunamadı (${currency}) — 1.0 kullanılıyor`);
    return {
      currency,
      rateToTry: 1.0,
      source:    'MANUAL',
      date:      new Date().toISOString().slice(0, 10),
      fetchedAt: new Date(),
    };
  }

  /**
   * Yabancı para birimindeki tutarı TRY'ye çevirir.
   *
   * @param amount    Yabancı para birimindeki tutar (en küçük birimde, örn: cent)
   * @param currency  Kaynak para birimi
   * @param rate      Kur (getRate() ile elde edilir)
   * @returns         TRY kuruş cinsinden tutar
   */
  convert(amount: number, currency: SupportedCurrency, rate: ExchangeRate): MoneyAmount {
    if (currency === 'TRY') {
      return { amount, currency: 'TRY', amountTry: amount, rate: 1 };
    }

    const amountTry = Math.round(amount * rate.rateToTry);

    return {
      amount,
      currency,
      amountTry,
      rate: rate.rateToTry,
    };
  }

  /**
   * TRY tutarını yabancı para birimine çevirir (görüntüleme amaçlı).
   */
  convertFromTry(amountTry: number, targetCurrency: SupportedCurrency, rate: ExchangeRate): number {
    if (targetCurrency === 'TRY') return amountTry;
    return Math.round(amountTry / rate.rateToTry);
  }

  // ─── TCMB Entegrasyonu ────────────────────────────────────────────────────

  /**
   * TCMB XML kur servisinden güncel kurları çeker.
   * https://www.tcmb.gov.tr/kurlar/today.xml
   *
   * Not: Production'da TCMB EVDS API anahtarı ile daha güvenilir erişim sağlanır.
   */
  private async fetchFromTcmb(): Promise<ExchangeRate[]> {
    const today  = new Date().toISOString().slice(0, 10);
    const url    = 'https://www.tcmb.gov.tr/kurlar/today.xml';

    // Node.js 18+ built-in fetch kullanılır
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000), // 10 saniye zaman aşımı
    });

    if (!response.ok) {
      throw new Error(`TCMB HTTP ${response.status}: ${response.statusText}`);
    }

    const xml = await response.text();

    return this.parseTcmbXml(xml, today);
  }

  /**
   * TCMB XML yanıtını parse eder.
   * Format: <Currency Kod="USD"><BanknoteSelling>...</BanknoteSelling>...
   */
  private parseTcmbXml(xml: string, date: string): ExchangeRate[] {
    const rates: ExchangeRate[] = [];

    for (const [code] of Object.entries(TCMB_CURRENCY_CODES)) {
      const currency = code as Exclude<SupportedCurrency, 'TRY'>;

      // Basit regex parse (production'da xml2js kullanılmalı)
      const currencyBlock = xml.match(
        new RegExp(`<Currency[^>]*Kod="${code}"[^>]*>([\\s\\S]*?)</Currency>`),
      );

      if (!currencyBlock) continue;

      const sellMatch = currencyBlock[1]?.match(/<BanknoteSelling>([\d.]+)<\/BanknoteSelling>/);

      if (!sellMatch?.[1]) continue;

      const rateToTry = parseFloat(sellMatch[1]);

      if (isNaN(rateToTry) || rateToTry <= 0) continue;

      rates.push({
        currency,
        rateToTry,
        source:    'TCMB',
        date,
        fetchedAt: new Date(),
      });
    }

    return rates;
  }
}

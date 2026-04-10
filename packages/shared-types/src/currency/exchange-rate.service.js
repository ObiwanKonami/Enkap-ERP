"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ExchangeRateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeRateService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const ioredis_1 = __importDefault(require("ioredis"));
const multi_currency_types_1 = require("./multi-currency.types");
/** Redis'te kur verisinin saklandığı anahtar */
const rateKey = (currency) => `exchange_rate:${currency}:try`;
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
let ExchangeRateService = ExchangeRateService_1 = class ExchangeRateService {
    constructor() {
        this.logger = new common_1.Logger(ExchangeRateService_1.name);
        this.redis = new ioredis_1.default(process.env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 3,
        });
    }
    /**
     * Her gün 09:30 İstanbul'da (TCMB kur ilanından sonra) kurları günceller.
     */
    async refreshRates() {
        this.logger.log('TCMB döviz kurları güncelleniyor...');
        try {
            const rates = await this.fetchFromTcmb();
            for (const rate of rates) {
                await this.redis.set(rateKey(rate.currency), JSON.stringify(rate), 'EX', RATE_TTL_SECONDS);
            }
            this.logger.log(`Döviz kurları güncellendi: ${rates.map((r) => `${r.currency}=${r.rateToTry}`).join(', ')}`);
        }
        catch (err) {
            this.logger.error(`TCMB kur güncelleme hatası: ${err.message}`);
        }
    }
    /**
     * Belirtilen para biriminin TRY karşılığını döner.
     * Redis'te yoksa TCMB'den canlı çeker.
     */
    async getRate(currency) {
        const cached = await this.redis.get(rateKey(currency));
        if (cached) {
            return JSON.parse(cached);
        }
        this.logger.warn(`Kur önbelleği yok (${currency}) — TCMB'den canlı çekiliyor`);
        try {
            const rates = await this.fetchFromTcmb();
            const rate = rates.find((r) => r.currency === currency);
            if (rate) {
                await this.redis.set(rateKey(currency), JSON.stringify(rate), 'EX', RATE_TTL_SECONDS);
                return rate;
            }
        }
        catch (err) {
            this.logger.error(`Kur çekilemedi (${currency}): ${err.message}`);
        }
        // Fallback: bilinmeyen kur
        this.logger.warn(`Kur bulunamadı (${currency}) — 1.0 kullanılıyor`);
        return {
            currency,
            rateToTry: 1.0,
            source: 'MANUAL',
            date: new Date().toISOString().slice(0, 10),
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
    convert(amount, currency, rate) {
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
    convertFromTry(amountTry, targetCurrency, rate) {
        if (targetCurrency === 'TRY')
            return amountTry;
        return Math.round(amountTry / rate.rateToTry);
    }
    // ─── TCMB Entegrasyonu ────────────────────────────────────────────────────
    /**
     * TCMB XML kur servisinden güncel kurları çeker.
     * https://www.tcmb.gov.tr/kurlar/today.xml
     *
     * Not: Production'da TCMB EVDS API anahtarı ile daha güvenilir erişim sağlanır.
     */
    async fetchFromTcmb() {
        const today = new Date().toISOString().slice(0, 10);
        const url = 'https://www.tcmb.gov.tr/kurlar/today.xml';
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
    parseTcmbXml(xml, date) {
        const rates = [];
        for (const [code] of Object.entries(multi_currency_types_1.TCMB_CURRENCY_CODES)) {
            const currency = code;
            // Basit regex parse (production'da xml2js kullanılmalı)
            const currencyBlock = xml.match(new RegExp(`<Currency[^>]*Kod="${code}"[^>]*>([\\s\\S]*?)</Currency>`));
            if (!currencyBlock)
                continue;
            const sellMatch = currencyBlock[1]?.match(/<BanknoteSelling>([\d.]+)<\/BanknoteSelling>/);
            if (!sellMatch?.[1])
                continue;
            const rateToTry = parseFloat(sellMatch[1]);
            if (isNaN(rateToTry) || rateToTry <= 0)
                continue;
            rates.push({
                currency,
                rateToTry,
                source: 'TCMB',
                date,
                fetchedAt: new Date(),
            });
        }
        return rates;
    }
};
exports.ExchangeRateService = ExchangeRateService;
__decorate([
    (0, schedule_1.Cron)('30 9 * * 1-5', { timeZone: 'Europe/Istanbul' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExchangeRateService.prototype, "refreshRates", null);
exports.ExchangeRateService = ExchangeRateService = ExchangeRateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ExchangeRateService);

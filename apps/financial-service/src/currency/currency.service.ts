import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { ExchangeRateService } from '@enkap/shared-types';
import type { SupportedCurrency } from '@enkap/shared-types';

export interface ExchangeDiffResult {
  /** TRY cinsinden kur farkı tutarı (kuruş, mutlak değer) */
  diffTry: bigint;
  /** true → kur farkı kârı (646), false → kur farkı zararı (656) */
  isGain: boolean;
}

/** Ham DB satırı (V034 şeması) */
interface RateRow {
  id: string;
  tenant_id: string;
  from_currency: string;
  to_currency: string;
  rate: string;
  source: string;
  rate_date: string;
  created_by: string | null;
  created_at: Date;
}

/** Uygulama içi kur kaydı nesnesi */
export interface RateRecord {
  id: string;
  tenantId: string;
  currency: Exclude<SupportedCurrency, 'TRY'>;
  rateToTry: number;
  source: 'TCMB' | 'MANUAL';
  date: string;
  createdAt: Date;
}

function rowToRecord(r: RateRow): RateRecord {
  // pg DATE kolonu bazen Date nesnesi döner — yyyy-MM-dd'ye normalize et
  const dateStr = typeof r.rate_date === 'string'
    ? r.rate_date.slice(0, 10)
    : new Date(r.rate_date as unknown as string).toISOString().slice(0, 10);

  return {
    id:        r.id,
    tenantId:  r.tenant_id,
    currency:  r.from_currency as Exclude<SupportedCurrency, 'TRY'>,
    rateToTry: parseFloat(r.rate),
    source:    r.source as 'TCMB' | 'MANUAL',
    date:      dateStr,
    createdAt: new Date(r.created_at),
  };
}

/**
 * Çoklu para birimi ve kur yönetimi servisi.
 *
 * TCMB efektif satış kurları günlük olarak çekilir ve tenant DB'ye kaydedilir.
 * VUK Md.280: Dönem sonu dövizli alacak/borçlar, değerleme tarihindeki MB kuru ile değerlenir.
 *
 * Kur farkı muhasebesi:
 *  646 Kambiyo Kârları — lehine kur farkı
 *  656 Kambiyo Zararları — aleyhine kur farkı
 */
@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Belirtilen para biriminin bugünkü kurunu getirir.
   *
   * Öncelik:
   *  1. Bugünün DB kaydı
   *  2. TCMB'den canlı çekip kaydet
   *  3. DB'deki son geçerli kur (hafta sonu/tatil fallback)
   */
  async getCurrentRate(
    currency: Exclude<SupportedCurrency, 'TRY'>,
  ): Promise<RateRecord> {
    const { tenantId } = getTenantContext();
    const ds    = await this.dataSourceManager.getDataSource(tenantId);
    const today = new Date().toISOString().slice(0, 10);

    // [1] Bugünün kaydı var mı?
    const [existing] = await ds.query<RateRow[]>(
      `SELECT * FROM exchange_rates WHERE tenant_id=$1 AND from_currency=$2 AND to_currency='TRY' AND rate_date=$3 LIMIT 1`,
      [tenantId, currency, today],
    );
    if (existing) return rowToRecord(existing);

    // [2] TCMB'den canlı çek
    try {
      const rate = await this.exchangeRateService.getRate(currency);

      const [saved] = await ds.query<RateRow[]>(
        `INSERT INTO exchange_rates (tenant_id, from_currency, to_currency, rate, source, rate_date)
         VALUES ($1, $2, 'TRY', $3, 'TCMB', $4)
         ON CONFLICT (tenant_id, from_currency, to_currency, rate_date) DO UPDATE
           SET rate = EXCLUDED.rate, source = 'TCMB'
         RETURNING *`,
        [tenantId, currency, rate.rateToTry, today],
      );

      return rowToRecord(saved!);
    } catch (err) {
      this.logger.warn(
        `TCMB kur çekilemedi (${currency}): ${(err as Error).message} — son geçerli kur kullanılıyor`,
      );
    }

    // [3] Son geçerli kur (hafta sonu/tatil fallback)
    const [lastRow] = await ds.query<RateRow[]>(
      `SELECT * FROM exchange_rates WHERE tenant_id=$1 AND from_currency=$2 AND to_currency='TRY' ORDER BY rate_date DESC LIMIT 1`,
      [tenantId, currency],
    );

    if (!lastRow) {
      throw new NotFoundException(
        `${currency} kuru bulunamadı. Lütfen manuel kur girişi yapın.`,
      );
    }

    this.logger.warn(
      `${currency} için son geçerli kur kullanılıyor: tarih=${lastRow.rate_date} oran=${lastRow.rate}`,
    );

    return rowToRecord(lastRow);
  }

  /**
   * Tüm desteklenen para birimleri için güncel kurları getirir.
   */
  async getCurrentRates(): Promise<RateRecord[]> {
    const currencies: Exclude<SupportedCurrency, 'TRY'>[] = [
      'USD', 'EUR', 'GBP', 'SAR', 'AED',
    ];

    const results = await Promise.allSettled(
      currencies.map((c) => this.getCurrentRate(c)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<RateRecord> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Manuel kur girişi — aynı gün/para birimi varsa günceller (upsert).
   */
  async setManualRate(
    currency: Exclude<SupportedCurrency, 'TRY'>,
    rateToTry: number,
    date: string,
    userId: string,
  ): Promise<RateRecord> {
    const { tenantId } = getTenantContext();
    const ds = await this.dataSourceManager.getDataSource(tenantId);

    this.logger.log(
      `Manuel kur girişi: tenant=${tenantId} ${currency}=${rateToTry} tarih=${date} kullanıcı=${userId}`,
    );

    const [saved] = await ds.query<RateRow[]>(
      `INSERT INTO exchange_rates (tenant_id, from_currency, to_currency, rate, source, rate_date)
       VALUES ($1, $2, 'TRY', $3, 'MANUAL', $4)
       ON CONFLICT (tenant_id, from_currency, to_currency, rate_date) DO UPDATE
         SET rate = EXCLUDED.rate, source = 'MANUAL'
       RETURNING *`,
      [tenantId, currency, rateToTry, date],
    );

    return rowToRecord(saved!);
  }

  /**
   * Dövizli tutarı TRY'ye çevirir.
   */
  async convertToTry(
    amount: bigint,
    currency: SupportedCurrency,
    date: Date,
  ): Promise<bigint> {
    if (currency === 'TRY') return amount;

    const dateStr  = date.toISOString().slice(0, 10);
    const { tenantId } = getTenantContext();
    const ds = await this.dataSourceManager.getDataSource(tenantId);

    const [record] = await ds.query<RateRow[]>(
      `SELECT * FROM exchange_rates
       WHERE tenant_id=$1 AND from_currency=$2 AND to_currency='TRY' AND rate_date <= $3
       ORDER BY rate_date DESC LIMIT 1`,
      [tenantId, currency, dateStr],
    );

    if (!record) {
      throw new NotFoundException(
        `${dateStr} tarihi için ${currency} kuru bulunamadı.`,
      );
    }

    const rateToTry  = parseFloat(record.rate);
    const rateMicro  = BigInt(Math.round(rateToTry * 1_000_000));
    return (amount * rateMicro) / 1_000_000n;
  }

  /**
   * Dönem sonu kur farkı hesaplama (VUK Md.280).
   */
  calculateExchangeDiff(
    originalAmountForeign: bigint,
    originalRate: number,
    currentRate: number,
    currency: SupportedCurrency,
  ): ExchangeDiffResult {
    if (currency === 'TRY') {
      return { diffTry: 0n, isGain: false };
    }

    const originalRateMicro = BigInt(Math.round(originalRate * 1_000_000));
    const currentRateMicro  = BigInt(Math.round(currentRate  * 1_000_000));

    const originalTry = (originalAmountForeign * originalRateMicro) / 1_000_000n;
    const currentTry  = (originalAmountForeign * currentRateMicro)  / 1_000_000n;

    const diff    = currentTry - originalTry;
    const diffTry = diff < 0n ? -diff : diff;
    const isGain  = diff > 0n;

    return { diffTry, isGain };
  }

  /**
   * Belirli dönem için kur listesi.
   */
  async listRates(
    currency?: SupportedCurrency,
    startDate?: string,
    endDate?: string,
  ): Promise<RateRecord[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dataSourceManager.getDataSource(tenantId);

    const conditions: string[] = ['tenant_id=$1'];
    const params: unknown[]    = [tenantId];
    let i = 2;

    conditions.push(`to_currency='TRY'`);

    if (currency && currency !== 'TRY') {
      conditions.push(`from_currency=$${i++}`);
      params.push(currency);
    }

    if (startDate) {
      conditions.push(`rate_date >= $${i++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`rate_date <= $${i++}`);
      params.push(endDate);
    }

    const rows = await ds.query<RateRow[]>(
      `SELECT * FROM exchange_rates WHERE ${conditions.join(' AND ')} ORDER BY rate_date DESC, from_currency ASC`,
      params,
    );

    return rows.map(rowToRecord);
  }

  /**
   * TCMB'den tüm kurları canlı çeker ve tenant DB'ye kaydeder.
   */
  async refreshFromTcmb(): Promise<RateRecord[]> {
    const { tenantId } = getTenantContext();
    const ds    = await this.dataSourceManager.getDataSource(tenantId);
    const today = new Date().toISOString().slice(0, 10);

    const currencies: Exclude<SupportedCurrency, 'TRY'>[] = [
      'USD', 'EUR', 'GBP', 'SAR', 'AED',
    ];

    this.logger.log(`TCMB kur yenileme başlatıldı: tenant=${tenantId}`);

    const saved: RateRecord[] = [];

    for (const currency of currencies) {
      try {
        const rate = await this.exchangeRateService.getRate(currency);

        const [row] = await ds.query<RateRow[]>(
          `INSERT INTO exchange_rates (tenant_id, from_currency, to_currency, rate, source, rate_date)
           VALUES ($1, $2, 'TRY', $3, 'TCMB', $4)
           ON CONFLICT (tenant_id, from_currency, to_currency, rate_date) DO UPDATE
             SET rate = EXCLUDED.rate, source = 'TCMB'
           RETURNING *`,
          [tenantId, currency, rate.rateToTry, today],
        );

        saved.push(rowToRecord(row!));
      } catch (err) {
        this.logger.error(
          `TCMB ${currency} kur yenileme hatası: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `TCMB kur yenileme tamamlandı: ${saved.length}/${currencies.length} para birimi güncellendi`,
    );

    return saved;
  }

  /**
   * Kur farkı yevmiye kaydı oluşturur (VUK Md.280 değerleme).
   */
  async createExchangeDiffJournalEntry(
    invoiceId: string,
    originalAmount: bigint,
    originalRate: number,
    currentRate: number,
    currency: SupportedCurrency,
    isReceivable: boolean,
  ): Promise<void> {
    const { tenantId } = getTenantContext();
    const { diffTry, isGain } = this.calculateExchangeDiff(
      originalAmount,
      originalRate,
      currentRate,
      currency,
    );

    if (diffTry === 0n) {
      this.logger.debug(`Kur farkı sıfır — yevmiye kaydı oluşturulmadı: fatura=${invoiceId}`);
      return;
    }

    const diffAmount = Number(diffTry);

    let debitAccount: string;
    let creditAccount: string;

    if (isReceivable) {
      debitAccount  = isGain ? '120' : '656';
      creditAccount = isGain ? '646' : '120';
    } else {
      debitAccount  = isGain ? '320' : '656';
      creditAccount = isGain ? '646' : '320';
    }

    const description =
      `Kur farkı değerlemesi — Fatura: ${invoiceId} — ` +
      `${currency} ${isGain ? 'kâr' : 'zarar'} — ` +
      `${originalRate.toFixed(6)} → ${currentRate.toFixed(6)}`;

    try {
      const ds = await this.dataSourceManager.getDataSource(tenantId);

      const [entry] = await ds.query<Array<{ id: string }>>(
        `INSERT INTO journal_entries (tenant_id, entry_date, description, reference_type, reference_id)
         VALUES ($1, CURRENT_DATE, $2, 'EXCHANGE_DIFF', $3)
         RETURNING id`,
        [tenantId, description, invoiceId],
      );

      await ds.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, account_code, debit, credit)
         VALUES ($1, $2, $3, 0), ($1, $4, 0, $5)`,
        [entry?.id, debitAccount, diffAmount, creditAccount, diffAmount],
      );

      this.logger.log(
        `Kur farkı yevmiyesi oluşturuldu: tenant=${tenantId} fatura=${invoiceId} ` +
        `${debitAccount} BORÇ / ${creditAccount} ALACAK — ₺${(diffAmount / 100).toFixed(2)}`,
      );
    } catch (err) {
      this.logger.warn(
        `Kur farkı yevmiye kaydı yapılamadı: ${(err as Error).message}`,
      );
    }
  }
}

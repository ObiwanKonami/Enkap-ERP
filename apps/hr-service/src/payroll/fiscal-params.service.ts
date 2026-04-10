import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Bordro hesaplamasında kullanılan yasal parametreler.
 * Değerler DB'den yıllık olarak çekilir; bulunmazsa 2025 fallback değerleri kullanılır.
 */
export interface FiscalParams {
  year:                 number;
  minWageKurus:         number;           // Asgari ücret (kuruş)
  sgkCeilingKurus:      number;           // SGK tavan (kuruş)
  sgkWorkerRate:        number;           // İşçi SGK oranı (ör: 0.14)
  unemploymentWorker:   number;           // İşçi işsizlik oranı (ör: 0.01)
  sgkEmployerRate:      number;           // İşveren SGK oranı (ör: 0.185)
  unemploymentEmployer: number;           // İşveren işsizlik oranı (ör: 0.02)
  stampTaxRate:         number;           // Damga vergisi oranı (ör: 0.00759)
  gvBrackets:           Array<{ limitKurus: number; rate: number }>;
  disabilityDeductions: Record<1 | 2 | 3, number>;
}

/** 2025 hardcoded fallback — DB'ye ulaşılamazsa kullanılır */
const FALLBACK_2025: FiscalParams = {
  year:                 2025,
  minWageKurus:         2_210_467,
  sgkCeilingKurus:      16_578_503,
  sgkWorkerRate:        0.14,
  unemploymentWorker:   0.01,
  sgkEmployerRate:      0.185,
  unemploymentEmployer: 0.02,
  stampTaxRate:         0.00759,
  gvBrackets: [
    { limitKurus: 11_000_000,  rate: 0.15 },
    { limitKurus: 23_000_000,  rate: 0.20 },
    { limitKurus: 87_000_000,  rate: 0.27 },
    { limitKurus: 300_000_000, rate: 0.35 },
    { limitKurus: 9_999_999_999, rate: 0.40 },
  ],
  disabilityDeductions: { 1: 151_000, 2: 80_500, 3: 38_500 },
};

/** DB satırı ham tipi */
interface FiscalParamsRow {
  id:                   number;
  year:                 number;
  min_wage_kurus:       string;
  sgk_ceiling_kurus:    string;
  sgk_worker_rate:      string;
  unemployment_worker:  string;
  sgk_employer_rate:    string;
  unemployment_employer: string;
  stamp_tax_rate:       string;
  gv_brackets:          unknown;
  disability_deductions: unknown;
}

/**
 * Yasal bordro parametrelerini DB'den yönetir.
 * Control plane DB'sindeki `fiscal_params` tablosundan okur/yazar.
 */
@Injectable()
export class FiscalParamsService {
  private readonly logger = new Logger(FiscalParamsService.name);

  constructor(
    @InjectDataSource('control_plane') private readonly cp: DataSource,
  ) {}

  /**
   * Belirtilen yıl için yasal parametreleri döndürür.
   * Yıl bulunamazsa bir önceki yılı dener; o da bulunamazsa 2025 fallback döner.
   */
  async getForYear(year: number): Promise<FiscalParams> {
    try {
      // Önce tam yılı dene, bulunamazsa bir önceki yılı al
      const rows = await this.cp.query<FiscalParamsRow[]>(
        `SELECT * FROM public.fiscal_params WHERE year IN ($1, $2) ORDER BY year DESC LIMIT 1`,
        [year, year - 1],
      );

      if (rows.length === 0) {
        this.logger.warn(`Yasal parametreler bulunamadı: yıl=${year}, fallback 2025 kullanılıyor`);
        return FALLBACK_2025;
      }

      return this.mapRow(rows[0]);
    } catch (err) {
      this.logger.error(
        `Yasal parametreler DB'den alınamadı: ${(err as Error).message} — fallback kullanılıyor`,
      );
      return FALLBACK_2025;
    }
  }

  /**
   * Belirtilen yıl için parametreleri kaydeder veya günceller.
   * Platform admin tarafından çağrılır — tenant izolasyonu yoktur.
   */
  async upsert(year: number, dto: Omit<FiscalParams, 'year'>): Promise<FiscalParams> {
    const gvBracketsDb = dto.gvBrackets.map(b => ({
      limit_kurus: b.limitKurus,
      rate:        b.rate,
    }));

    const disabilityDb = {
      '1': dto.disabilityDeductions[1],
      '2': dto.disabilityDeductions[2],
      '3': dto.disabilityDeductions[3],
    };

    await this.cp.query(
      `INSERT INTO public.fiscal_params
         (year, min_wage_kurus, sgk_ceiling_kurus,
          sgk_worker_rate, unemployment_worker, sgk_employer_rate, unemployment_employer,
          stamp_tax_rate, gv_brackets, disability_deductions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (year) DO UPDATE SET
         min_wage_kurus         = EXCLUDED.min_wage_kurus,
         sgk_ceiling_kurus      = EXCLUDED.sgk_ceiling_kurus,
         sgk_worker_rate        = EXCLUDED.sgk_worker_rate,
         unemployment_worker    = EXCLUDED.unemployment_worker,
         sgk_employer_rate      = EXCLUDED.sgk_employer_rate,
         unemployment_employer  = EXCLUDED.unemployment_employer,
         stamp_tax_rate         = EXCLUDED.stamp_tax_rate,
         gv_brackets            = EXCLUDED.gv_brackets,
         disability_deductions  = EXCLUDED.disability_deductions,
         updated_at             = NOW()`,
      [
        year,
        dto.minWageKurus,
        dto.sgkCeilingKurus,
        dto.sgkWorkerRate,
        dto.unemploymentWorker,
        dto.sgkEmployerRate,
        dto.unemploymentEmployer,
        dto.stampTaxRate,
        JSON.stringify(gvBracketsDb),
        JSON.stringify(disabilityDb),
      ],
    );

    this.logger.log(`Yasal parametreler güncellendi: yıl=${year}`);
    return this.getForYear(year);
  }

  /** DB satırını FiscalParams interface'ine dönüştürür */
  private mapRow(row: FiscalParamsRow): FiscalParams {
    // JSONB alanı PostgreSQL sürücüsü tarafından otomatik parse edilir
    const brackets = row.gv_brackets as Array<{ limit_kurus: number; rate: number }>;
    const disability = row.disability_deductions as Record<string, number>;

    return {
      year:                 Number(row.year),
      minWageKurus:         Number(row.min_wage_kurus),
      sgkCeilingKurus:      Number(row.sgk_ceiling_kurus),
      sgkWorkerRate:        Number(row.sgk_worker_rate),
      unemploymentWorker:   Number(row.unemployment_worker),
      sgkEmployerRate:      Number(row.sgk_employer_rate),
      unemploymentEmployer: Number(row.unemployment_employer),
      stampTaxRate:         Number(row.stamp_tax_rate),
      gvBrackets:           brackets.map(b => ({
        limitKurus: Number(b.limit_kurus),
        rate:       Number(b.rate),
      })),
      disabilityDeductions: {
        1: Number(disability['1'] ?? 0),
        2: Number(disability['2'] ?? 0),
        3: Number(disability['3'] ?? 0),
      },
    };
  }
}

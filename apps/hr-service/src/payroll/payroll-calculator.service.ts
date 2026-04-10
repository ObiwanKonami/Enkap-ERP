import { Injectable, Logger } from '@nestjs/common';
import { FiscalParamsService, FiscalParams } from './fiscal-params.service';

/**
 * Türkiye Bordro Hesaplama Motoru
 *
 * Yasal dayanak:
 *   - 5510 Sayılı Kanun (SGK)
 *   - 193 Sayılı GVK (Gelir Vergisi Kanunu)
 *   - 488 Sayılı DVK (Damga Vergisi Kanunu)
 *   - 4447 Sayılı Kanun (İşsizlik Sigortası)
 *
 * Parametreler artık hardcoded sabit değil, `fiscal_params` tablosundan dinamik olarak gelir.
 * Yıl bulunamazsa 2025 fallback değerleri kullanılır.
 */

// ─── Hesaplama Tipleri ──────────────────────────────────────────────────────

export interface PayrollInput {
  /** Tam ay brüt ücret (kuruş) */
  grossKurus: number;
  /** Çalışılan gün / toplam iş günü (eksik gün varsa orantılama) */
  workingDays: number;
  totalDays: number;
  /** Önceki ayların kümülatif GV matrahı (kuruş, yıl başı = 0) */
  prevCumulativeBaseKurus: number;
  /** Engelli indirimi derecesi */
  disabilityDegree?: 0 | 1 | 2 | 3;
  /** BES otomatik katılım — opt-out yapmadıysa true */
  besEnabled?: boolean;
  /** İcra (maaş haczi) kesinti oranı (0.00–1.00, net üzerinden) */
  icraRate?: number;
  /** İcra sabit tutar (kuruş) — oran yerine sabit tutar */
  icraFixedKurus?: number;
  /** Fazla mesai ücreti (kuruş, önceden hesaplanmış) */
  overtimeKurus?: number;
  /** Bu ay düşülecek avans tutarı (kuruş) */
  advanceDeductionKurus?: number;
}

export interface PayrollResult {
  /** Orantılanmış brüt (eksik gün varsa düşülmüş) + fazla mesai */
  grossKurus: number;

  // ─── İşçi Kesintileri ─────────────────────────────────────────────
  sgkWorkerKurus:         number;  // SGK işçi payı
  unemploymentWorkerKurus: number; // İşsizlik işçi payı
  incomeTaxBaseKurus:     number;  // Brüt - SGK - İşsizlik
  incomeTaxKurus:         number;  // GV (muafiyet sonrası)
  stampTaxKurus:          number;  // Damga vergisi
  minWageExemptionKurus:  number;  // Uygulanan asgari ücret muafiyeti

  // ─── BES / İcra / Avans ───────────────────────────────────────────
  besKurus:              number;  // BES işçi katkı payı (%3 brüt)
  icraKurus:             number;  // İcra kesintisi
  advanceDeductionKurus: number;  // Avans düşümü
  overtimeKurus:         number;  // Fazla mesai ücreti

  // ─── Net ──────────────────────────────────────────────────────────
  netKurus: number;

  // ─── İşveren Maliyeti ─────────────────────────────────────────────
  sgkEmployerKurus:          number;
  unemploymentEmployerKurus: number;
  totalEmployerCostKurus:    number;

  // ─── Kümülatif Matrah (bir sonraki ay için) ───────────────────────
  cumulativeIncomeBaseKurus: number;
}

/**
 * Türkiye bordro hesaplama servisi.
 * Tüm hesaplamalar tam sayı (kuruş) üzerinde yapılır — float kayması olmaz.
 * Yasal parametreler `FiscalParamsService` üzerinden DB'den dinamik çekilir.
 */
@Injectable()
export class PayrollCalculatorService {
  private readonly logger = new Logger(PayrollCalculatorService.name);

  constructor(private readonly fiscalParams: FiscalParamsService) {}

  /**
   * Bordro hesaplar. Yıl parametresi alınmazsa mevcut yıl kullanılır.
   * Yasal parametreler önce DB'den çekilir, yoksa fallback uygulanır.
   */
  async calculate(input: PayrollInput, fiscalYear?: number): Promise<PayrollResult> {
    const year   = fiscalYear ?? new Date().getFullYear();
    const params = await this.fiscalParams.getForYear(year);

    return this.calculateWithParams(input, params);
  }

  /**
   * Verilen parametrelerle senkron hesaplama yapar.
   * `PayrollService.calculatePeriod()` tarafından çağrılır
   * (params bir kez çekilir, her çalışan için tekrar DB'ye gidilmez).
   */
  calculateWithParams(input: PayrollInput, params: FiscalParams): PayrollResult {
    const degree   = input.disabilityDegree ?? 0;
    const overtime = input.overtimeKurus ?? 0;

    // 1. Orantılı brüt (eksik gün varsa gün bazlı indirim) + fazla mesai
    const baseGross = input.workingDays < input.totalDays
      ? Math.round(input.grossKurus * input.workingDays / input.totalDays)
      : input.grossKurus;
    const gross = baseGross + overtime;

    // 2. SGK matrahı (tavan sınırlı) — fazla mesai dahil
    const sgkBase = Math.min(gross, params.sgkCeilingKurus);

    // 3. İşçi payları
    const sgkWorker          = Math.round(sgkBase * params.sgkWorkerRate);
    const unemploymentWorker = Math.round(sgkBase * params.unemploymentWorker);

    // 4. GV matrahı (bu ay)
    const disabilityDeduction = params.disabilityDeductions[degree as 1 | 2 | 3] ?? 0;
    const gvBaseThisMonth = Math.max(
      0,
      gross - sgkWorker - unemploymentWorker - disabilityDeduction,
    );

    // 5. Kümülatif GV matrahı
    const prevCumulative = input.prevCumulativeBaseKurus;
    const newCumulative  = prevCumulative + gvBaseThisMonth;

    // 6. Kümülatif GV (yıl başından bu aya kadar toplam)
    const gvCumulative  = this.calculateGv(newCumulative, params);
    const gvPrevious    = this.calculateGv(prevCumulative, params);
    const gvThisMonth   = gvCumulative - gvPrevious;

    // 7. Damga vergisi
    const stampTax = Math.round(gross * params.stampTaxRate);

    // 8. Asgari ücret muafiyeti
    const minWageExemption = this.calculateMinWageExemption(
      params,
      prevCumulative,
      gross,
      sgkWorker,
      unemploymentWorker,
    );

    const incomeTaxAfterExemption = Math.max(0, gvThisMonth - minWageExemption);

    // 9. BES — Otomatik katılım %3 brüt (4632 sayılı Kanun md.6)
    //    BES, GV ve SGK hesaplamasından sonra net'ten kesilir
    const besKurus = input.besEnabled
      ? Math.round(gross * 0.03)
      : 0;

    // 10. Net ücret (BES öncesi)
    const netBeforeDeductions = gross
      - sgkWorker
      - unemploymentWorker
      - incomeTaxAfterExemption
      - stampTax;

    // 11. İcra kesintisi — net maaşın 1/4'ünü aşamaz (İİK md.83)
    const maxIcra = Math.round(netBeforeDeductions * 0.25);
    let icraKurus = 0;
    if (input.icraFixedKurus) {
      icraKurus = Math.min(input.icraFixedKurus, maxIcra);
    } else if (input.icraRate) {
      icraKurus = Math.min(
        Math.round(netBeforeDeductions * input.icraRate),
        maxIcra,
      );
    }

    // 12. Avans düşümü
    const advanceDeduction = input.advanceDeductionKurus ?? 0;

    // 13. Final net ücret = net - BES - icra - avans
    const net = netBeforeDeductions - besKurus - icraKurus - advanceDeduction;

    // 14. İşveren maliyeti
    const sgkEmployer          = Math.round(sgkBase * params.sgkEmployerRate);
    const unemploymentEmployer = Math.round(sgkBase * params.unemploymentEmployer);
    const totalEmployerCost    = gross + sgkEmployer + unemploymentEmployer;

    return {
      grossKurus:               gross,
      sgkWorkerKurus:           sgkWorker,
      unemploymentWorkerKurus:  unemploymentWorker,
      incomeTaxBaseKurus:       gvBaseThisMonth,
      incomeTaxKurus:           incomeTaxAfterExemption,
      stampTaxKurus:            stampTax,
      minWageExemptionKurus:    minWageExemption,
      besKurus,
      icraKurus,
      advanceDeductionKurus:    advanceDeduction,
      overtimeKurus:            overtime,
      netKurus:                 Math.max(0, net),
      sgkEmployerKurus:         sgkEmployer,
      unemploymentEmployerKurus: unemploymentEmployer,
      totalEmployerCostKurus:   totalEmployerCost,
      cumulativeIncomeBaseKurus: newCumulative,
    };
  }

  /**
   * Yıllık kümülatif matrah üzerinden dilim bazlı GV hesaplar.
   * Sonuç yıllık GV toplamıdır; aylık GV = bu ay - önceki ay.
   */
  private calculateGv(annualBaseKurus: number, params: FiscalParams): number {
    let remaining = annualBaseKurus;
    let tax = 0;
    let prevLimit = 0;

    for (const bracket of params.gvBrackets) {
      if (remaining <= 0) break;
      const isLastBracket = bracket.limitKurus >= 9_000_000_000;
      const bracketWidth  = isLastBracket
        ? remaining
        : Math.min(remaining, bracket.limitKurus - prevLimit);
      tax       += Math.round(bracketWidth * bracket.rate);
      remaining -= bracketWidth;
      prevLimit  = bracket.limitKurus;
    }

    return tax;
  }

  /**
   * Asgari ücret GV + DV muafiyetini hesaplar.
   *
   * Kural: Asgari ücrete isabet eden GV ve DV tutarı,
   * çalışanın hesaplanan GV ve DV'sinden düşülür.
   * Muafiyet tutarı gerçek GV'yi aşamaz.
   */
  private calculateMinWageExemption(
    params: FiscalParams,
    prevCumulativeBaseKurus: number,
    actualGrossKurus: number,
    actualSgkWorker: number,
    actualUnemploymentWorker: number,
  ): number {
    // Asgari ücretin SGK payları
    const minWageSgkBase      = Math.min(params.minWageKurus, params.sgkCeilingKurus);
    const minWageSgkWorker    = Math.round(minWageSgkBase * params.sgkWorkerRate);
    const minWageUnemployment = Math.round(minWageSgkBase * params.unemploymentWorker);

    // Asgari ücretin GV matrahı
    const minWageGvBase = Math.max(0, params.minWageKurus - minWageSgkWorker - minWageUnemployment);

    // Asgari ücretin kümülatif GV hesabı (önceki aydan bağımsız — sabit muafiyet)
    const minWagePrevCumulative = Math.min(prevCumulativeBaseKurus, minWageGvBase);
    const minWageGv = this.calculateGv(minWageGvBase, params)
      - this.calculateGv(minWagePrevCumulative, params);

    // Asgari ücretin DV muafiyeti
    const minWageDv = Math.round(params.minWageKurus * params.stampTaxRate);

    // Gerçek brüt asgari ücretten az ise muafiyet orantılanır
    const ratio = Math.min(1, actualGrossKurus / params.minWageKurus);

    // actualSgkWorker ve actualUnemploymentWorker değerleri bu metotta şu an kullanılmıyor
    // (ileriki versiyonlar için parametre tutuldu)
    void actualSgkWorker;
    void actualUnemploymentWorker;

    return Math.round((minWageGv + minWageDv) * ratio);
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager, TenantRoutingService } from '@enkap/database';
import { MailerService } from '@enkap/mailer';
import { Employee } from '../employee/entities/employee.entity';
import { Payroll } from './entities/payroll.entity';
import { OvertimeEntry } from '../overtime/overtime.entity';
import { Advance } from '../advance/advance.entity';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { FiscalParamsService } from './fiscal-params.service';
import { PayslipBuilderService } from './payslip-builder.service';
import { HrEventsPublisher } from '../events/hr-events.publisher';

const MONTH_TR = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/**
 * Bordro Servisi.
 *
 * calculatePeriod() akışı:
 *  1. Aktif çalışanları çek
 *  2. Her çalışan için önceki ay kümülatif matrahı al
 *  3. PayrollCalculatorService ile hesapla
 *  4. DRAFT olarak kaydet (UNIQUE ON CONFLICT → varsa güncelle)
 */
@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly dsManager:       TenantDataSourceManager,
    private readonly calculator:      PayrollCalculatorService,
    private readonly fiscalParams:    FiscalParamsService,
    private readonly payslipBuilder:  PayslipBuilderService,
    private readonly mailer:          MailerService,
    private readonly routingService:  TenantRoutingService,
    private readonly hrEvents:        HrEventsPublisher,
  ) {}

  /**
   * Belirli dönem için tüm aktif çalışanların bordrosunu hesapla.
   * Sonuçlar DRAFT statüsünde kaydedilir.
   */
  async calculatePeriod(year: number, month: number): Promise<Payroll[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const employees = await ds.getRepository(Employee).find({
      where: { tenantId, status: 'active' },
    });

    if (employees.length === 0) {
      throw new BadRequestException('Aktif çalışan bulunamadı.');
    }

    this.logger.log(
      `Bordro hesaplama: ${year}/${month}, ${employees.length} çalışan — tenant=${tenantId}`,
    );

    // Yasal parametreleri bir kez çek — her çalışan için tekrar DB'ye gidilmez
    const params = await this.fiscalParams.getForYear(year);

    const results: Payroll[] = [];

    for (const emp of employees) {
      const prevCumulative = await this.getPrevCumulativeBase(
        tenantId,
        emp.id,
        year,
        month,
        ds,
      );

      // Fazla mesai: o ay onaylı kayıtların ücretini hesapla
      const overtimeKurus = await this.getOvertimeKurus(ds, tenantId, emp.id, year, month, Number(emp.grossSalaryKurus));

      // Avans: onaylı (APPROVED) avansları topla — bordroda düşülecek
      const advanceDeductionKurus = await this.getAdvanceDeduction(ds, tenantId, emp.id);

      const result = this.calculator.calculateWithParams({
        grossKurus:              Number(emp.grossSalaryKurus),
        workingDays:             30,  // TODO: devamsızlık/izin modülü entegrasyonu
        totalDays:               30,
        prevCumulativeBaseKurus: prevCumulative,
        disabilityDegree:        emp.disabilityDegree,
        besEnabled:              !emp.besOptOut,
        icraRate:                emp.icraRate ? Number(emp.icraRate) : undefined,
        icraFixedKurus:          emp.icraFixedKurus ? Number(emp.icraFixedKurus) : undefined,
        overtimeKurus,
        advanceDeductionKurus,
      }, params);

      // Bordro kaydını upsert
      const payroll = ds.getRepository(Payroll).create({
        tenantId,
        employeeId:               emp.id,
        periodYear:               year,
        periodMonth:              month,
        workingDays:              30,
        totalDays:                30,
        grossKurus:               result.grossKurus,
        sgkWorkerKurus:           result.sgkWorkerKurus,
        unemploymentWorkerKurus:  result.unemploymentWorkerKurus,
        incomeTaxBaseKurus:        result.incomeTaxBaseKurus,
        incomeTaxKurus:            result.incomeTaxKurus,
        stampTaxKurus:             result.stampTaxKurus,
        minWageExemptionKurus:     result.minWageExemptionKurus,
        besKurus:                  result.besKurus,
        icraKurus:                 result.icraKurus,
        advanceDeductionKurus:     result.advanceDeductionKurus,
        overtimeKurus:             result.overtimeKurus,
        netKurus:                  result.netKurus,
        sgkEmployerKurus:          result.sgkEmployerKurus,
        unemploymentEmployerKurus: result.unemploymentEmployerKurus,
        totalEmployerCostKurus:    result.totalEmployerCostKurus,
        cumulativeIncomeBaseKurus: result.cumulativeIncomeBaseKurus,
        status:                   'DRAFT',
      });

      const saved = await ds.getRepository(Payroll).save(payroll);
      results.push(saved);
    }

    this.logger.log(`Bordro hesaplama tamamlandı: ${results.length} kayıt`);
    return results;
  }

  /** Döneme ait bordro listesini döndürür — frontend beklediği alan adlarıyla */
  async findByPeriod(year: number, month: number): Promise<unknown[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const payrolls = await ds.getRepository(Payroll).find({
      where: { tenantId, periodYear: year, periodMonth: month },
      order: { createdAt: 'ASC' },
    });

    // Çalışan adlarını paralel çek
    const employeeIds = [...new Set(payrolls.map(p => p.employeeId))];
    const employees   = await ds.getRepository(Employee).find({
      where: employeeIds.map(id => ({ id, tenantId })),
      select: ['id', 'name', 'surname'],
    });
    const empMap = new Map(employees.map(e => [e.id, `${e.name} ${e.surname}`]));

    // Frontend'in beklediği alan adlarına map et
    return payrolls.map(p => ({
      id:               p.id,
      employeeId:       p.employeeId,
      employeeName:     empMap.get(p.employeeId) ?? 'Bilinmiyor',
      grossSalaryKurus: Number(p.grossKurus),
      netSalaryKurus:   Number(p.netKurus),
      sgkEmployeeKurus: Number(p.sgkWorkerKurus),
      sgkEmployerKurus: Number(p.sgkEmployerKurus),
      incomeTaxKurus:   Number(p.incomeTaxKurus),
      stampTaxKurus:    Number(p.stampTaxKurus),
      status:           p.status === 'DRAFT' ? 'PENDING' : p.status,
      year:             p.periodYear,
      month:            p.periodMonth,
    }));
  }

  /** Tek çalışanın bordrolarını döndürür */
  async findByEmployee(employeeId: string): Promise<Payroll[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    return ds.getRepository(Payroll).find({
      where: { tenantId, employeeId },
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
    });
  }

  /** Bordroyu onayla (DRAFT → APPROVED) */
  async approvePeriod(
    year: number,
    month: number,
    approvedBy: string,
  ): Promise<void> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const payrolls = await ds.getRepository(Payroll).find({
      where: { tenantId, periodYear: year, periodMonth: month, status: 'DRAFT' },
    });

    if (payrolls.length === 0) {
      throw new BadRequestException(
        `${year}/${month} dönemine ait DRAFT bordro bulunamadı.`,
      );
    }

    await ds.getRepository(Payroll).update(
      payrolls.map((p) => p.id),
      { status: 'APPROVED', approvedAt: new Date(), approvedBy },
    );

    // Avansları DEDUCTED olarak işaretle
    for (const p of payrolls) {
      if (Number(p.advanceDeductionKurus) > 0) {
        await ds.getRepository(Advance).update(
          { tenantId, employeeId: p.employeeId, status: 'APPROVED' as const },
          { status: 'DEDUCTED' as const },
        );
      }
    }

    // Çalışan isimlerini çek — event payload için
    const employeeIds = [...new Set(payrolls.map(p => p.employeeId))];
    const employees   = await ds.getRepository(Employee).find({
      where: employeeIds.map(id => ({ id, tenantId })),
      select: ['id', 'name', 'surname'],
    });
    const empMap = new Map(employees.map(e => [e.id, `${e.name} ${e.surname}`]));

    // hr.payroll.finalized → financial-service yevmiye kaydı oluşturur
    this.hrEvents.publishPayrollFinalized({
      tenantId,
      periodYear:                year,
      periodMonth:               month,
      employeeCount:             payrolls.length,
      totalGrossKurus:           payrolls.reduce((s, p) => s + Number(p.grossKurus), 0),
      totalNetKurus:             payrolls.reduce((s, p) => s + Number(p.netKurus), 0),
      totalSgkWorkerKurus:       payrolls.reduce((s, p) => s + Number(p.sgkWorkerKurus), 0),
      totalSgkEmployerKurus:     payrolls.reduce((s, p) => s + Number(p.sgkEmployerKurus), 0),
      totalIncomeTaxKurus:       payrolls.reduce((s, p) => s + Number(p.incomeTaxKurus), 0),
      totalStampTaxKurus:        payrolls.reduce((s, p) => s + Number(p.stampTaxKurus), 0),
      totalBesKurus:             payrolls.reduce((s, p) => s + Number(p.besKurus ?? 0), 0),
      totalIcraKurus:            payrolls.reduce((s, p) => s + Number(p.icraKurus ?? 0), 0),
      totalAdvanceDeductionKurus: payrolls.reduce((s, p) => s + Number(p.advanceDeductionKurus ?? 0), 0),
      approvedBy,
      payrolls: payrolls.map(p => ({
        payrollId:                p.id,
        employeeId:               p.employeeId,
        employeeName:             empMap.get(p.employeeId) ?? 'Bilinmiyor',
        grossKurus:               Number(p.grossKurus),
        netKurus:                 Number(p.netKurus),
        sgkWorkerKurus:           Number(p.sgkWorkerKurus),
        sgkEmployerKurus:         Number(p.sgkEmployerKurus),
        unemploymentWorkerKurus:  Number(p.unemploymentWorkerKurus),
        unemploymentEmployerKurus: Number(p.unemploymentEmployerKurus),
        incomeTaxKurus:           Number(p.incomeTaxKurus),
        stampTaxKurus:            Number(p.stampTaxKurus),
        besKurus:                 Number(p.besKurus ?? 0),
        icraKurus:                Number(p.icraKurus ?? 0),
        advanceDeductionKurus:    Number(p.advanceDeductionKurus ?? 0),
        overtimeKurus:            Number(p.overtimeKurus ?? 0),
      })),
    });

    this.logger.log(
      `Bordro onaylandı: ${year}/${month}, ${payrolls.length} kayıt — by=${approvedBy}`,
    );
  }

  /** Belirli çalışan ve dönem için bordro kaydını al */
  async findOne(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<Payroll> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const payroll = await ds.getRepository(Payroll).findOne({
      where: { tenantId, employeeId, periodYear: year, periodMonth: month },
    });

    if (!payroll) {
      throw new NotFoundException(
        `Bordro bulunamadı: çalışan=${employeeId}, dönem=${year}/${month}`,
      );
    }

    return payroll;
  }

  /**
   * Onaylanmış bordrolar için çalışanlara e-posta ile PDF pusulası gönderir.
   *
   * E-postası olmayan veya APPROVED olmayan çalışanlar atlanır.
   * Hata olan çalışanlar loglanır — diğer gönderimleri durdurmaz (fire-and-forget mantığı).
   *
   * @returns Gönderilen ve atlanan çalışan sayıları
   */
  async sendPayslips(
    year:  number,
    month: number,
  ): Promise<{ sent: number; skipped: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const payrolls = await ds.getRepository(Payroll).find({
      where: { tenantId, periodYear: year, periodMonth: month, status: 'APPROVED' },
    });

    if (payrolls.length === 0) {
      throw new BadRequestException(
        `${year}/${month} dönemine ait onaylanmış bordro bulunamadı.`,
      );
    }

    const profile     = await this.routingService.getProfileForDocument(tenantId);
    const period      = `${MONTH_TR[month] ?? ''} ${year}`;

    let sent    = 0;
    let skipped = 0;

    for (const payroll of payrolls) {
      const employee = await ds.getRepository(Employee).findOne({
        where: { id: payroll.employeeId, tenantId },
      });

      if (!employee?.email) {
        this.logger.debug(
          `Bordro e-postası atlandı: employee=${payroll.employeeId} — e-posta yok`,
        );
        skipped++;
        continue;
      }

      const netTl = new Intl.NumberFormat('tr-TR', {
        style: 'currency', currency: 'TRY',
      }).format(Number(payroll.netKurus) / 100);

      try {
        const pdfBuffer = await this.payslipBuilder.build(employee, payroll, profile);

        await this.mailer.sendPayslip(employee.email, {
          employeeName: employee.fullName,
          period,
          netAmount:    netTl,
          companyName:  profile.companyName,
        }, pdfBuffer);

        sent++;
      } catch (err) {
        this.logger.warn(
          `Bordro e-postası gönderilemedi: employee=${employee.id} — ${(err as Error).message}`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `Bordro pusulası gönderimi: ${year}/${month} — gönderildi=${sent}, atlandı=${skipped}`,
    );

    return { sent, skipped };
  }

  /**
   * Önceki ayların kümülatif GV matrahını döndürür.
   * Yıl değişince sıfırlanır (Ocak → 0).
   */
  private async getPrevCumulativeBase(
    tenantId: string,
    employeeId: string,
    year: number,
    month: number,
    ds: Awaited<ReturnType<TenantDataSourceManager['getDataSource']>>,
  ): Promise<number> {
    if (month === 1) return 0;  // Ocak: kümülatif sıfır

    const prevPayroll = await ds.getRepository(Payroll).findOne({
      where: {
        tenantId,
        employeeId,
        periodYear:  year,
        periodMonth: month - 1,
      },
    });

    // TypeORM bigint kolonları string döndürür — Number() ile dönüştür
    return Number(prevPayroll?.cumulativeIncomeBaseKurus ?? 0);
  }

  /**
   * Belirli dönem için onaylı fazla mesai ücretini hesaplar.
   *
   * Formül: hours × multiplier × (grossKurus / 225)
   *   225 = aylık 30 gün × 7.5 saat (4857/63: haftalık 45 saat → günlük 7.5)
   */
  private async getOvertimeKurus(
    ds: Awaited<ReturnType<TenantDataSourceManager['getDataSource']>>,
    tenantId: string,
    employeeId: string,
    year: number,
    month: number,
    grossSalaryKurus: number,
  ): Promise<number> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate   = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;

    const entries = await ds.getRepository(OvertimeEntry).find({
      where: {
        tenantId,
        employeeId,
        status: 'APPROVED',
      },
    });

    // Tarih filtresini JS tarafında uygula — TypeORM Between için date cast gerekebilir
    const monthEntries = entries.filter(e => {
      const d = typeof e.overtimeDate === 'string' ? e.overtimeDate : String(e.overtimeDate);
      return d >= startDate && d < endDate;
    });

    if (monthEntries.length === 0) return 0;

    // Saatlik ücret = brüt / 225 (4857/63)
    const hourlyKurus = grossSalaryKurus / 225;

    return monthEntries.reduce((sum, entry) => {
      const hours      = Number(entry.hours);
      const multiplier = Number(entry.multiplier);
      return sum + Math.round(hours * multiplier * hourlyKurus);
    }, 0);
  }

  /**
   * Çalışanın henüz düşülmemiş onaylı avanslarını toplar.
   * Bordro hesaplamasında net'ten düşülecek tutar.
   */
  private async getAdvanceDeduction(
    ds: Awaited<ReturnType<TenantDataSourceManager['getDataSource']>>,
    tenantId: string,
    employeeId: string,
  ): Promise<number> {
    const advances = await ds.getRepository(Advance).find({
      where: { tenantId, employeeId, status: 'APPROVED' },
    });

    return advances.reduce(
      (sum, adv) => sum + Number(adv.amountKurus),
      0,
    );
  }
}

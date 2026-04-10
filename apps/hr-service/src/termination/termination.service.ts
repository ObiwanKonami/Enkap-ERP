import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { TerminationDetails } from './termination-details.entity';
import { Employee } from '../employee/entities/employee.entity';
import { CreateTerminationDto } from './dto/create-termination.dto';
import { HrEventsPublisher } from '../events/hr-events.publisher';

// 2025 kıdem tazminatı tavanı (1 Ocak – 30 Haziran)
const SEVERANCE_CEILING_KURUS = 2_848_945; // 28.489,45 TL

/** İhbar süreleri (4857/17) — kıdem yılına göre hafta */
const NOTICE_WEEKS: { minYears: number; weeks: number }[] = [
  { minYears: 0,  weeks: 2 },
  { minYears: 0.5, weeks: 4 },
  { minYears: 1.5, weeks: 6 },
  { minYears: 3,   weeks: 8 },
];

/**
 * İşten Çıkış ve Tazminat Hesaplama Servisi.
 *
 * 4857 sayılı İş Kanunu:
 * - Kıdem Tazminatı: Her tam yıl için 30 günlük brüt ücret (tavanlı)
 * - İhbar Tazminatı: Kıdeme göre 2/4/6/8 haftalık brüt ücret
 * - Kullanılmayan Yıllık İzin: Günlük brüt ücret × gün sayısı
 *
 * SGK İşten Çıkış Kodları: 01–34 (shared-types'ta enum)
 */
@Injectable()
export class TerminationService {
  private readonly logger = new Logger(TerminationService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly hrEvents: HrEventsPublisher,
  ) {}

  /**
   * İşten çıkış hesaplaması yapar ve kaydeder.
   * Çalışanın durumunu 'terminated' yapar, sgkTerminationCode atar.
   */
  async calculate(dto: CreateTerminationDto): Promise<TerminationDetails> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    // Çalışanı getir
    const empRepo = ds.getRepository(Employee);
    const employee = await empRepo.findOne({ where: { id: dto.employeeId, tenantId } });
    if (!employee) {
      throw new NotFoundException(`Çalışan bulunamadı: ${dto.employeeId}`);
    }
    if (employee.status === 'terminated') {
      throw new ConflictException(`Çalışan zaten işten çıkarılmış: ${dto.employeeId}`);
    }

    // Kıdem hesapla
    const hireDate = new Date(employee.hireDate);
    const termDate = new Date(dto.terminationDate);
    const tenureMs = termDate.getTime() - hireDate.getTime();
    const tenureYears = tenureMs / (365.25 * 24 * 60 * 60 * 1000);
    const tenureMonths = Math.floor(tenureYears * 12);

    // Günlük brüt ücret (30 gün bazlı)
    const dailyGrossKurus = Math.round(Number(employee.grossSalaryKurus) / 30);

    // ─── Kıdem Tazminatı ────────────────────────────────────────────────
    let severanceKurus = 0;
    let severanceDays = 0;
    const severanceEligible = dto.severanceEligible ?? false;

    if (severanceEligible && tenureYears >= 1) {
      // Her tam yıl için 30 gün, kalan aylara orantılı
      severanceDays = Math.round(tenureYears * 30);
      const uncappedSeverance = severanceDays * dailyGrossKurus;
      // Yıl bazlı tavanlama: her yıl için max tavan
      const yearCount = Math.ceil(tenureYears);
      const maxSeverance = yearCount * SEVERANCE_CEILING_KURUS;
      severanceKurus = Math.min(uncappedSeverance, maxSeverance);
    }

    // ─── İhbar Tazminatı ────────────────────────────────────────────────
    let noticeKurus = 0;
    let noticeWeeks = 0;
    const noticeEligible = dto.noticeEligible ?? false;

    if (noticeEligible) {
      // En uygun ihbar süresini bul (büyükten küçüğe kontrol)
      for (let i = NOTICE_WEEKS.length - 1; i >= 0; i--) {
        if (tenureYears >= NOTICE_WEEKS[i].minYears) {
          noticeWeeks = NOTICE_WEEKS[i].weeks;
          break;
        }
      }
      noticeKurus = noticeWeeks * 7 * dailyGrossKurus;
    }

    // ─── Kullanılmayan Yıllık İzin ─────────────────────────────────────
    const unusedLeaveDays = dto.unusedLeaveDays ?? 0;
    const unusedLeaveKurus = Math.round(unusedLeaveDays * dailyGrossKurus);

    // Toplam ödeme
    const totalPayoutKurus = severanceKurus + noticeKurus + unusedLeaveKurus;

    // Termination details kaydet
    const detailsRepo = ds.getRepository(TerminationDetails);
    const details = detailsRepo.create({
      tenantId,
      employeeId:         dto.employeeId,
      terminationDate:    dto.terminationDate,
      sgkTerminationCode: dto.sgkTerminationCode,
      tenureYears:        Math.round(tenureYears * 100) / 100,
      tenureMonths,
      severanceEligible,
      severanceKurus,
      severanceDays,
      noticeEligible,
      noticeKurus,
      noticeWeeks,
      unusedLeaveDays,
      unusedLeaveKurus,
      totalPayoutKurus,
      calculatedAt: new Date(),
      calculatedBy: dto.calculatedBy ?? null,
      notes:        dto.notes ?? null,
    });
    const saved = await detailsRepo.save(details);

    // Çalışan durumunu güncelle
    employee.status              = 'terminated';
    employee.terminationDate     = termDate;
    employee.sgkTerminationCode  = dto.sgkTerminationCode;
    await empRepo.save(employee);

    this.logger.log(
      `İşten çıkış hesaplandı: employee=${dto.employeeId}, ` +
      `kıdem=${tenureYears.toFixed(2)} yıl, ` +
      `severance=${severanceKurus}, notice=${noticeKurus}, ` +
      `leave=${unusedLeaveKurus}, total=${totalPayoutKurus} kuruş`,
    );

    // hr.employee.terminated → auth-service hesap devre dışı, asset uyarısı
    this.hrEvents.publishEmployeeTerminated({
      tenantId,
      employeeId:         dto.employeeId,
      sicilNo:            employee.sicilNo,
      terminationDate:    dto.terminationDate,
      sgkTerminationCode: dto.sgkTerminationCode,
      totalPayoutKurus,
    });

    return saved;
  }

  async findByEmployee(employeeId: string): Promise<TerminationDetails | null> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    return ds.getRepository(TerminationDetails).findOne({
      where: { tenantId, employeeId },
    });
  }

  async findOne(id: string): Promise<TerminationDetails> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const details = await ds.getRepository(TerminationDetails).findOne({
      where: { id, tenantId },
    });
    if (!details) {
      throw new NotFoundException(`İşten çıkış kaydı bulunamadı: ${id}`);
    }
    return details;
  }
}

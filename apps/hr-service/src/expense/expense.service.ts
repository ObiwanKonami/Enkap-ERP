import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { ExpenseReport, ExpenseStatus } from './entities/expense-report.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import { HrEventsPublisher } from '../events/hr-events.publisher';

export interface FindExpensesParams {
  employeeId?: string;
  status?: ExpenseStatus;
  period?: string;
  limit?: number;
  offset?: number;
}

export interface ExpenseListResult {
  data: ExpenseReport[];
  total: number;
}

/**
 * Masraf Yönetimi Servisi.
 *
 * İş akışı:
 *   TASLAK → (submit) → ONAY_BEKLIYOR → (approve) → ONAYLANDI → (markPaid) → ODENDI
 *                                      → (reject)  → REDDEDILDI
 *
 * Tüm durum geçişleri doğrulanır; yanlış durumdaki işlem ConflictException fırlatır.
 * Tenant izolasyonu getTenantContext() ile her metotta zorunlu olarak sağlanır.
 * Tüm tablolar tenant schema'da — TenantDataSourceManager ile erişilir.
 */
@Injectable()
export class ExpenseService {
  private readonly logger = new Logger(ExpenseService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly hrEvents: HrEventsPublisher,
  ) {}

  /**
   * Yeni masraf raporu oluşturur (TASLAK durumunda).
   * Kalemler cascade ile birlikte kaydedilir.
   * totalKurus, kalem tutarlarının toplamından hesaplanır.
   */
  async create(dto: CreateExpenseReportDto, createdBy: string): Promise<ExpenseReport> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);
    const lineRepo   = ds.getRepository(ExpenseLine);

    const totalKurus = dto.lines.reduce((sum, line) => sum + line.amountKurus, 0);

    const lines = dto.lines.map((lineDto) =>
      lineRepo.create({
        category:    lineDto.category,
        description: lineDto.description,
        expenseDate: lineDto.expenseDate,
        amountKurus: lineDto.amountKurus,
        kdvKurus:    lineDto.kdvKurus ?? 0,
        receiptUrl:  lineDto.receiptUrl ?? null,
        notes:       lineDto.notes ?? null,
      }),
    );

    const report = reportRepo.create({
      tenantId,
      employeeId:   dto.employeeId,
      employeeName: dto.employeeName,
      period:       dto.period,
      status:       'TASLAK',
      totalKurus,
      currency:     dto.currency ?? 'TRY',
      notes:        dto.notes ?? null,
      createdBy,
      lines,
    });

    const saved = await reportRepo.save(report);

    this.logger.log(
      `Masraf raporu oluşturuldu: id=${saved.id}, employee=${dto.employeeId}, ` +
      `period=${dto.period}, total=${totalKurus} kuruş`,
    );

    return saved;
  }

  /**
   * Masraf raporlarını listeler.
   */
  async findAll(params: FindExpensesParams = {}): Promise<ExpenseListResult> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);

    const where: Record<string, unknown> = { tenantId };
    if (params.employeeId) where['employeeId'] = params.employeeId;
    if (params.status)     where['status']     = params.status;
    if (params.period)     where['period']     = params.period;

    const [data, total] = await reportRepo.findAndCount({
      where,
      order:  { createdAt: 'DESC' },
      take:   params.limit  ?? 50,
      skip:   params.offset ?? 0,
    });

    return { data, total };
  }

  /**
   * Tek masraf raporunu getirir.
   */
  async findOne(id: string): Promise<ExpenseReport> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);

    const report = await reportRepo.findOne({ where: { id, tenantId } });
    if (!report) {
      throw new NotFoundException(`Masraf raporu bulunamadı: ${id}`);
    }
    return report;
  }

  async submit(id: string): Promise<ExpenseReport> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);

    const report = await this.findOne(id);
    if (report.status !== 'TASLAK') {
      throw new ConflictException(
        `Rapor gönderilemez: mevcut durum '${report.status}', beklenen 'TASLAK'.`,
      );
    }

    report.status      = 'ONAY_BEKLIYOR';
    report.submittedAt = new Date();
    const saved = await reportRepo.save(report);
    this.logger.log(`Masraf raporu onaya gönderildi: id=${id}`);
    return saved;
  }

  async approve(id: string, approverId: string): Promise<ExpenseReport> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);

    const report = await this.findOne(id);
    if (report.status !== 'ONAY_BEKLIYOR') {
      throw new ConflictException(
        `Rapor onaylanamaz: mevcut durum '${report.status}', beklenen 'ONAY_BEKLIYOR'.`,
      );
    }

    report.status     = 'ONAYLANDI';
    report.approvedBy = approverId;
    report.approvedAt = new Date();
    const saved = await reportRepo.save(report);
    this.logger.log(`Masraf raporu onaylandı: id=${id}, approver=${approverId}`);

    // hr.expense.approved → treasury-service ödeme emri oluşturur
    this.hrEvents.publishExpenseApproved({
      tenantId,
      expenseReportId: saved.id,
      employeeId:      saved.employeeId,
      totalKurus:      Number(saved.totalKurus),
      currency:        saved.currency,
      approvedBy:      approverId,
      approvedAt:      saved.approvedAt!.toISOString(),
    });

    return saved;
  }

  async reject(id: string, approverId: string, reason: string): Promise<ExpenseReport> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);

    const report = await this.findOne(id);
    if (report.status !== 'ONAY_BEKLIYOR') {
      throw new ConflictException(
        `Rapor reddedilemez: mevcut durum '${report.status}', beklenen 'ONAY_BEKLIYOR'.`,
      );
    }

    report.status         = 'REDDEDILDI';
    report.approvedBy     = approverId;
    report.approvedAt     = new Date();
    report.rejectedReason = reason;
    const saved = await reportRepo.save(report);
    this.logger.log(`Masraf raporu reddedildi: id=${id}, approver=${approverId}, reason="${reason}"`);
    return saved;
  }

  async markPaid(id: string): Promise<ExpenseReport> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const reportRepo = ds.getRepository(ExpenseReport);

    const report = await this.findOne(id);
    if (report.status !== 'ONAYLANDI') {
      throw new ConflictException(
        `Rapor ödendi işaretlenemez: mevcut durum '${report.status}', beklenen 'ONAYLANDI'.`,
      );
    }

    report.status = 'ODENDI';
    report.paidAt = new Date();
    const saved = await reportRepo.save(report);
    this.logger.log(`Masraf raporu ödendi işaretlendi: id=${id}, paidAt=${saved.paidAt}`);
    return saved;
  }
}

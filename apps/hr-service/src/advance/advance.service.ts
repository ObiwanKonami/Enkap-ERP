import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Advance } from './advance.entity';
import { CreateAdvanceDto } from './dto/create-advance.dto';
import { HrEventsPublisher } from '../events/hr-events.publisher';

export interface FindAdvancesParams {
  employeeId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Avans Yönetimi Servisi.
 *
 * İş akışı:
 *   PENDING → (approve) → APPROVED → (markPaid) → PAID → (deductFromPayroll) → DEDUCTED
 *           → (reject)  → REJECTED
 *
 * APPROVED olduğunda hr.advance.approved event'i yayınlanır (Phase 3).
 */
@Injectable()
export class AdvanceService {
  private readonly logger = new Logger(AdvanceService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly hrEvents: HrEventsPublisher,
  ) {}

  async create(dto: CreateAdvanceDto): Promise<Advance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Advance);

    const advance = repo.create({
      tenantId,
      employeeId:  dto.employeeId,
      advanceType: dto.advanceType ?? 'MAAS_AVANSI',
      amountKurus: dto.amountKurus,
      status:      'PENDING',
      reason:      dto.reason ?? null,
      requestedAt: dto.requestedAt,
    });

    const saved = await repo.save(advance);
    this.logger.log(
      `Avans talebi oluşturuldu: id=${saved.id}, employee=${dto.employeeId}, ` +
      `tutar=${dto.amountKurus} kuruş`,
    );
    return saved;
  }

  async findAll(params: FindAdvancesParams = {}): Promise<{ data: Advance[]; total: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Advance);

    const where: Record<string, unknown> = { tenantId };
    if (params.employeeId) where['employeeId'] = params.employeeId;
    if (params.status)     where['status']     = params.status;

    const [data, total] = await repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take:  params.limit  ?? 50,
      skip:  params.offset ?? 0,
    });

    return { data, total };
  }

  async findOne(id: string): Promise<Advance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const advance = await ds.getRepository(Advance).findOne({
      where: { id, tenantId },
    });
    if (!advance) {
      throw new NotFoundException(`Avans talebi bulunamadı: ${id}`);
    }
    return advance;
  }

  async approve(id: string, approverId: string): Promise<Advance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Advance);

    const advance = await this.findOne(id);
    if (advance.status !== 'PENDING') {
      throw new ConflictException(
        `Avans onaylanamaz: mevcut durum '${advance.status}', beklenen 'PENDING'.`,
      );
    }

    advance.status     = 'APPROVED';
    advance.approvedBy = approverId;
    advance.approvedAt = new Date();
    const saved = await repo.save(advance);
    this.logger.log(`Avans onaylandı: id=${id}, approver=${approverId}`);

    // hr.advance.approved → treasury-service ödeme emri oluşturur
    this.hrEvents.publishAdvanceApproved({
      tenantId,
      advanceId:   saved.id,
      employeeId:  saved.employeeId,
      amountKurus: Number(saved.amountKurus),
      advanceType: saved.advanceType,
      approvedBy:  approverId,
      approvedAt:  saved.approvedAt!.toISOString(),
    });

    return saved;
  }

  async reject(id: string, rejectedBy: string, reason: string): Promise<Advance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Advance);

    const advance = await this.findOne(id);
    if (advance.status !== 'PENDING') {
      throw new ConflictException(
        `Avans reddedilemez: mevcut durum '${advance.status}', beklenen 'PENDING'.`,
      );
    }

    advance.status         = 'REJECTED';
    advance.rejectedBy     = rejectedBy;
    advance.rejectedReason = reason;
    const saved = await repo.save(advance);
    this.logger.log(`Avans reddedildi: id=${id}, reason="${reason}"`);
    return saved;
  }

  async markPaid(id: string): Promise<Advance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Advance);

    const advance = await this.findOne(id);
    if (advance.status !== 'APPROVED') {
      throw new ConflictException(
        `Avans ödendi işaretlenemez: mevcut durum '${advance.status}', beklenen 'APPROVED'.`,
      );
    }

    advance.status = 'PAID';
    advance.paidAt = new Date();
    const saved = await repo.save(advance);
    this.logger.log(`Avans ödendi: id=${id}`);
    return saved;
  }

  /** Bordro hesaplamasında çağrılır — avansı düşüldü olarak işaretle */
  async markDeducted(id: string, payrollId: string): Promise<Advance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Advance);

    const advance = await this.findOne(id);
    if (advance.status !== 'PAID') {
      throw new ConflictException(
        `Avans düşülemez: mevcut durum '${advance.status}', beklenen 'PAID'.`,
      );
    }

    advance.status     = 'DEDUCTED';
    advance.payrollId  = payrollId;
    advance.deductedAt = new Date();
    const saved = await repo.save(advance);
    this.logger.log(`Avans bordrodan düşüldü: id=${id}, payroll=${payrollId}`);
    return saved;
  }

  /** Bir çalışanın bekleyen (PAID) avanslarını getirir — bordro hesaplaması için */
  async findPendingDeductions(employeeId: string): Promise<Advance[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    return ds.getRepository(Advance).find({
      where: { tenantId, employeeId, status: 'PAID' },
      order: { requestedAt: 'ASC' },
    });
  }
}

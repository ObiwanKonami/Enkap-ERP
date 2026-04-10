import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { OvertimeEntry } from './overtime.entity';
import { CreateOvertimeDto } from './dto/create-overtime.dto';

export interface FindOvertimeParams {
  employeeId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Fazla Mesai Yönetimi Servisi.
 *
 * 4857/41: Haftalık 45 saati aşan çalışma fazla mesaidir.
 * Çarpanlar: %50 zamlı (hafta içi, 1.5x), %100 zamlı (tatil, 2.0x)
 * Yıllık limit: 270 saat (4857/41/7)
 *
 * İş akışı: PENDING → APPROVED / REJECTED
 * Bordro hesaplamasında onaylanan mesailer otomatik dahil edilir.
 */
@Injectable()
export class OvertimeService {
  private readonly logger = new Logger(OvertimeService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  async create(dto: CreateOvertimeDto): Promise<OvertimeEntry> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(OvertimeEntry);

    const entry = repo.create({
      tenantId,
      employeeId:   dto.employeeId,
      overtimeDate: dto.overtimeDate,
      hours:        dto.hours,
      multiplier:   dto.multiplier ?? 1.5,
      status:       'PENDING',
      reason:       dto.reason ?? null,
    });

    const saved = await repo.save(entry);
    this.logger.log(
      `Fazla mesai kaydı: employee=${dto.employeeId}, tarih=${dto.overtimeDate}, ` +
      `saat=${dto.hours}, çarpan=${saved.multiplier}`,
    );
    return saved;
  }

  async findAll(params: FindOvertimeParams = {}): Promise<{ data: OvertimeEntry[]; total: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const qb = ds.getRepository(OvertimeEntry)
      .createQueryBuilder('o')
      .where('o.tenant_id = :tenantId', { tenantId })
      .orderBy('o.overtime_date', 'DESC');

    if (params.employeeId) {
      qb.andWhere('o.employee_id = :employeeId', { employeeId: params.employeeId });
    }
    if (params.status) {
      qb.andWhere('o.status = :status', { status: params.status });
    }
    if (params.startDate) {
      qb.andWhere('o.overtime_date >= :startDate', { startDate: params.startDate });
    }
    if (params.endDate) {
      qb.andWhere('o.overtime_date <= :endDate', { endDate: params.endDate });
    }

    const [data, total] = await qb
      .take(params.limit ?? 50)
      .skip(params.offset ?? 0)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<OvertimeEntry> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const entry = await ds.getRepository(OvertimeEntry).findOne({
      where: { id, tenantId },
    });
    if (!entry) {
      throw new NotFoundException(`Fazla mesai kaydı bulunamadı: ${id}`);
    }
    return entry;
  }

  async approve(id: string, approverId: string): Promise<OvertimeEntry> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(OvertimeEntry);

    const entry = await this.findOne(id);
    if (entry.status !== 'PENDING') {
      throw new ConflictException(
        `Fazla mesai onaylanamaz: durum '${entry.status}', beklenen 'PENDING'.`,
      );
    }

    entry.status     = 'APPROVED';
    entry.approvedBy = approverId;
    entry.approvedAt = new Date();
    const saved = await repo.save(entry);
    this.logger.log(`Fazla mesai onaylandı: id=${id}, approver=${approverId}`);
    return saved;
  }

  async reject(id: string, approverId: string): Promise<OvertimeEntry> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(OvertimeEntry);

    const entry = await this.findOne(id);
    if (entry.status !== 'PENDING') {
      throw new ConflictException(
        `Fazla mesai reddedilemez: durum '${entry.status}', beklenen 'PENDING'.`,
      );
    }

    entry.status     = 'REJECTED';
    entry.approvedBy = approverId;
    entry.approvedAt = new Date();
    const saved = await repo.save(entry);
    this.logger.log(`Fazla mesai reddedildi: id=${id}`);
    return saved;
  }

  /**
   * Bordro hesaplaması için: bir çalışanın belirli aydaki onaylı mesai saatlerini toplar.
   * Dönen değer: { totalHours, weightedHours } — weightedHours = sum(hours × multiplier)
   */
  async getMonthlyApprovedHours(
    employeeId: string,
    year: number,
    month: number,
  ): Promise<{ totalHours: number; weightedHours: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await ds.getRepository(OvertimeEntry)
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.hours), 0)', 'totalHours')
      .addSelect('COALESCE(SUM(o.hours * o.multiplier), 0)', 'weightedHours')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.employee_id = :employeeId', { employeeId })
      .andWhere('o.status = :status', { status: 'APPROVED' })
      .andWhere('o.overtime_date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .getRawOne();

    return {
      totalHours:    Number(result?.totalHours ?? 0),
      weightedHours: Number(result?.weightedHours ?? 0),
    };
  }
}

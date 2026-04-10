import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Budget }     from './entities/budget.entity';
import { BudgetLine } from './entities/budget-line.entity';
import type { CreateBudgetDto, UpsertBudgetLineDto } from './dto/create-budget.dto';

const MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;
type MonthKey = typeof MONTH_KEYS[number];

function computeAnnualTotal(line: Partial<Record<MonthKey, number>>): number {
  return MONTH_KEYS.reduce((s, k) => s + (Number(line[k]) || 0), 0);
}

export interface VarianceLine {
  accountCode:  string;
  accountName:  string;
  planned:      number;
  actual:       number; // TODO: gerçekleşen e-defter/invoice verilerinden çekilecek (Sprint 6)
  variance:     number;
  variancePct:  number;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  /** Yeni bütçe dönemi oluştur */
  async create(dto: CreateBudgetDto, createdBy: string): Promise<Budget> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Budget);

    const budget = repo.create({
      tenantId,
      year:      dto.year,
      version:   dto.version ?? 'v1',
      name:      dto.name,
      notes:     dto.notes,
      createdBy,
    });

    return repo.save(budget).catch(() => {
      throw new ConflictException(`${dto.year} yılı için "${dto.version ?? 'v1'}" versiyonu zaten mevcut.`);
    });
  }

  /** Bütçe listesi */
  async findAll(year?: number, page = 1, limit = 50): Promise<{ items: Budget[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Budget);

    const qb = repo.createQueryBuilder('b')
      .where('b.tenant_id = :tenantId', { tenantId })
      .orderBy('b.year', 'DESC')
      .addOrderBy('b.version', 'ASC');

    if (year) qb.andWhere('b.year = :year', { year });

    const offset = (page - 1) * limit;
    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { items, total, page, limit };
  }

  /** Bütçe detayı + kalemler */
  async findOne(id: string): Promise<Budget & { lines: BudgetLine[] }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const budget = await ds.getRepository(Budget).findOne({ where: { id, tenantId } });
    if (!budget) throw new NotFoundException(`Bütçe bulunamadı: ${id}`);

    const lines = await ds.getRepository(BudgetLine).find({
      where: { budgetId: id },
      order: { accountCode: 'ASC' },
    });

    return { ...budget, lines };
  }

  /** Bütçe kalemi oluştur veya güncelle (accountCode bazında upsert) */
  async upsertLine(budgetId: string, dto: UpsertBudgetLineDto): Promise<BudgetLine> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const budgetRepo = ds.getRepository(Budget);
    const lineRepo   = ds.getRepository(BudgetLine);

    const budget = await budgetRepo.findOne({ where: { id: budgetId, tenantId } });
    if (!budget) throw new NotFoundException(`Bütçe bulunamadı: ${budgetId}`);
    if (budget.isApproved) throw new ConflictException('Onaylanmış bütçede değişiklik yapılamaz. Yeni revizyon açın.');

    let line = await lineRepo.findOne({ where: { budgetId, accountCode: dto.accountCode } });

    if (!line) {
      line = lineRepo.create({ budgetId, accountCode: dto.accountCode, accountName: dto.accountName });
    }

    for (const k of MONTH_KEYS) {
      if (dto[k] !== undefined) (line as unknown as Record<string, unknown>)[k] = dto[k];
    }
    line.accountName      = dto.accountName;
    line.annualTotalKurus = computeAnnualTotal(line as unknown as Record<MonthKey, number>);

    return lineRepo.save(line);
  }

  /** Bütçeyi onayla */
  async approve(id: string, approverId: string): Promise<Budget> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Budget);

    const budget = await repo.findOne({ where: { id, tenantId } });
    if (!budget) throw new NotFoundException(`Bütçe bulunamadı: ${id}`);
    if (budget.isApproved) throw new ConflictException('Bütçe zaten onaylanmış.');

    budget.isApproved = true;
    budget.approvedBy = approverId;
    budget.approvedAt = new Date();

    this.logger.log(`[${tenantId}] Bütçe onaylandı: ${id} (${budget.year}/${budget.version})`);
    return repo.save(budget);
  }

  /**
   * Bütçe vs gerçekleşme sapma raporu
   * TODO: Gerçekleşen tutarlar Sprint 6'da e-defter/muhasebe hesap hareketlerinden çekilecek.
   */
  async getVarianceReport(
    id: string,
    month?: number,
  ): Promise<{ lines: VarianceLine[]; totalPlanned: number; totalActual: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const budget = await ds.getRepository(Budget).findOne({ where: { id, tenantId } });
    if (!budget) throw new NotFoundException(`Bütçe bulunamadı: ${id}`);

    const dbLines = await ds.getRepository(BudgetLine).find({ where: { budgetId: id } });

    const monthKey: MonthKey | null = month ? (MONTH_KEYS[month - 1] ?? null) : null;

    const lines: VarianceLine[] = dbLines.map(l => {
      const planned = monthKey
        ? Number((l as unknown as Record<string, number>)[monthKey] ?? 0)
        : Number(l.annualTotalKurus);
      const actual = 0; // TODO: muhasebe entegrasyonu
      return {
        accountCode:  l.accountCode,
        accountName:  l.accountName,
        planned,
        actual,
        variance:     actual - planned,
        variancePct:  planned !== 0 ? ((actual - planned) / planned) * 100 : 0,
      };
    });

    return {
      lines,
      totalPlanned: lines.reduce((s, l) => s + l.planned, 0),
      totalActual:  lines.reduce((s, l) => s + l.actual, 0),
    };
  }

  /**
   * Revize tahmin — YTD gerçekleşen + kalan bütçe
   * TODO: Sprint 6'da gerçek YTD verisiyle doldurulacak.
   */
  async forecastRevised(id: string): Promise<{
    budgetId: string; year: number; version: string; note: string;
  }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const budget = await ds.getRepository(Budget).findOne({ where: { id, tenantId } });
    if (!budget) throw new NotFoundException(`Bütçe bulunamadı: ${id}`);

    return {
      budgetId: id,
      year:     budget.year,
      version:  budget.version,
      note:     'Revize tahmin hesabı Sprint 6\'da muhasebe hareketleriyle entegre edilecek.',
    };
  }
}

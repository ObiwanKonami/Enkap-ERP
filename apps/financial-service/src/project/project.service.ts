import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Project }     from './entities/project.entity';
import { ProjectTask } from './entities/project-task.entity';
import { ProjectCost } from './entities/project-cost.entity';
import type {
  CreateProjectDto,
  UpdateProjectDto,
  AddProjectCostDto,
  CreateProjectTaskDto,
  UpdateProjectTaskDto,
} from './dto/create-project.dto';

/**
 * PostgreSQL sequence ile yıl bazlı proje kodu üretir.
 * Sequence yoksa oluşturur; idempotent.
 * Örn: PRJ-2026-0001
 */
async function generateProjectCode(dataSource: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await dataSource
    .query<[{ seq: string }]>(
      `SELECT LPAD(nextval('prj_seq_${year}')::text, 4, '0') AS seq`,
    )
    .catch(async () => {
      // Sequence henüz oluşturulmamış — oluştur ve tekrar dene
      await dataSource.query(
        `CREATE SEQUENCE IF NOT EXISTS prj_seq_${year} START 1`,
      );
      return dataSource.query<[{ seq: string }]>(
        `SELECT LPAD(nextval('prj_seq_${year}')::text, 4, '0') AS seq`,
      );
    });
  return `PRJ-${year}-${result[0].seq}`;
}

/** Proje kar/zarar raporu yapısı */
export interface ProjectPnL {
  projectId:      string;
  projectCode:    string;
  projectName:    string;
  currency:       string;
  /** Planlanan bütçe — kuruş */
  budget:         bigint;
  /** Gerçekleşen maliyet — kuruş */
  actualCost:     bigint;
  /** Fatura gelirleri — kuruş */
  revenue:        bigint;
  /** Brüt kar = revenue - actualCost */
  grossProfit:    bigint;
  /** Bütçe sapması = budget - actualCost (pozitif: bütçe altında) */
  budgetVariance: bigint;
  /** Kar marjı % (revenue sıfır ise null) */
  profitMargin:   number | null;
}

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /** Tenant DataSource + repository'leri döndür */
  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      projectRepo: ds.getRepository(Project),
      taskRepo:    ds.getRepository(ProjectTask),
      costRepo:    ds.getRepository(ProjectCost),
      dataSource:  ds,
      tenantId,
    };
  }

  // ─── Proje CRUD ────────────────────────────────────────────────────────────

  /**
   * Yeni proje oluştur.
   * Proje kodu PostgreSQL sequence'den otomatik üretilir.
   */
  async create(dto: CreateProjectDto, createdBy: string): Promise<Project> {
    const { projectRepo, dataSource, tenantId } = await this.repos();

    // Tarih geçerlilik kontrolü
    if (dto.endDate && dto.startDate > dto.endDate) {
      throw new BadRequestException('Bitiş tarihi başlangıç tarihinden önce olamaz.');
    }

    const projectCode = await generateProjectCode(dataSource);

    const project = projectRepo.create({
      tenantId,
      projectCode,
      name:            dto.name,
      description:     dto.description,
      customerId:      dto.customerId,
      customerName:    dto.customerName,
      status:          dto.status ?? 'AKTIF',
      startDate:       new Date(dto.startDate),
      endDate:         dto.endDate ? new Date(dto.endDate) : undefined,
      budgetKurus:     BigInt(dto.budgetKurus ?? 0),
      actualCostKurus: BigInt(0),
      revenueKurus:    BigInt(0),
      currency:        dto.currency ?? 'TRY',
      notes:           dto.notes,
      createdBy,
    });

    const saved = await projectRepo.save(project);
    this.logger.log(`[${tenantId}] Proje oluşturuldu: ${saved.projectCode} — ${saved.name}`);
    return saved;
  }

  /**
   * Tenant'ın projelerini listele.
   * Durum ve müşteri ID'sine göre filtreleme desteklenir.
   */
  async findAll(params?: {
    status?:     string;
    customerId?: string;
    page?:       number;
    limit?:      number;
  }): Promise<{ items: Project[]; total: number; page: number; limit: number }> {
    const { projectRepo, tenantId } = await this.repos();

    const qb = projectRepo
      .createQueryBuilder('p')
      .where('p.tenant_id = :tenantId', { tenantId })
      .orderBy('p.created_at', 'DESC');

    if (params?.status)     qb.andWhere('p.status = :status',          { status: params.status });
    if (params?.customerId) qb.andWhere('p.customer_id = :customerId', { customerId: params.customerId });

    const page   = params?.page ?? 1;
    const limit  = Math.min(params?.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  /** Tek proje detayı — tenant erişim kontrolü */
  async findOne(id: string): Promise<Project> {
    const { projectRepo, tenantId } = await this.repos();
    const project = await projectRepo.findOne({ where: { id, tenantId } });
    if (!project) throw new NotFoundException(`Proje bulunamadı: ${id}`);
    return project;
  }

  /** Proje bilgilerini güncelle */
  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    const { projectRepo } = await this.repos();
    const project = await this.findOne(id);

    // Kapalı projeyi güncelleme engeli
    if (project.status === 'TAMAMLANDI' || project.status === 'IPTAL') {
      throw new ConflictException('Tamamlanmış veya iptal edilmiş proje güncellenemez.');
    }

    // Tarih geçerlilik kontrolü
    const newStart = dto.startDate ? dto.startDate : project.startDate.toISOString().slice(0, 10);
    const newEnd   = dto.endDate   ? dto.endDate   : project.endDate?.toISOString().slice(0, 10);
    if (newEnd && newStart > newEnd) {
      throw new BadRequestException('Bitiş tarihi başlangıç tarihinden önce olamaz.');
    }

    if (dto.name         !== undefined) project.name         = dto.name;
    if (dto.description  !== undefined) project.description  = dto.description;
    if (dto.customerId   !== undefined) project.customerId   = dto.customerId;
    if (dto.customerName !== undefined) project.customerName = dto.customerName;
    if (dto.status       !== undefined) project.status       = dto.status;
    if (dto.startDate    !== undefined) project.startDate    = new Date(dto.startDate);
    if (dto.endDate      !== undefined) project.endDate      = new Date(dto.endDate);
    if (dto.budgetKurus  !== undefined) project.budgetKurus  = BigInt(dto.budgetKurus);
    if (dto.notes        !== undefined) project.notes        = dto.notes;

    return projectRepo.save(project);
  }

  /**
   * Projeyi tamamlandı olarak kapat.
   * Sadece AKTIF veya BEKLEMEDE durumunda kapatılabilir.
   */
  async close(id: string): Promise<Project> {
    const { projectRepo } = await this.repos();
    const project = await this.findOne(id);

    if (project.status === 'TAMAMLANDI') {
      throw new ConflictException('Proje zaten tamamlandı.');
    }
    if (project.status === 'IPTAL') {
      throw new ConflictException('İptal edilmiş proje tamamlandı olarak işaretlenemez.');
    }

    project.status  = 'TAMAMLANDI';
    project.endDate = project.endDate ?? new Date();

    const saved = await projectRepo.save(project);
    this.logger.log(`[${project.tenantId}] Proje tamamlandı: ${project.projectCode}`);
    return saved;
  }

  /**
   * Projeyi iptal et.
   * Sadece AKTIF veya BEKLEMEDE durumundaki projeler iptal edilebilir.
   */
  async cancel(id: string): Promise<Project> {
    const { projectRepo } = await this.repos();
    const project = await this.findOne(id);

    if (project.status === 'IPTAL') {
      throw new ConflictException('Proje zaten iptal edilmiş.');
    }
    if (project.status === 'TAMAMLANDI') {
      throw new ConflictException('Tamamlanmış proje iptal edilemez.');
    }

    project.status = 'IPTAL';

    const saved = await projectRepo.save(project);
    this.logger.log(`[${project.tenantId}] Proje iptal edildi: ${project.projectCode}`);
    return saved;
  }

  // ─── Maliyet Yönetimi ──────────────────────────────────────────────────────

  /**
   * Projeye maliyet kalemi ekle.
   * Ekleme sonrası proje.actualCostKurus transaction içinde güncellenir.
   */
  async addCost(
    projectId: string,
    dto:       AddProjectCostDto,
    createdBy: string,
  ): Promise<ProjectCost> {
    const { dataSource, tenantId } = await this.repos();
    const project = await this.findOne(projectId);

    return dataSource.transaction(async (em) => {
      const cost = em.create(ProjectCost, {
        projectId,
        taskId:        dto.taskId,
        costType:      dto.costType,
        description:   dto.description,
        costDate:      new Date(dto.costDate),
        amountKurus:   BigInt(dto.amountKurus),
        referenceType: dto.referenceType,
        referenceId:   dto.referenceId,
        createdBy,
      });
      const saved = await em.save(cost);

      // Gerçekleşen maliyeti artır
      project.actualCostKurus = project.actualCostKurus + BigInt(dto.amountKurus);
      await em.save(Project, project);

      this.logger.debug(
        `[${tenantId}] Proje maliyeti eklendi: ${project.projectCode} ` +
        `+${(dto.amountKurus / 100).toFixed(2)} ₺ (${dto.costType})`,
      );
      return saved;
    });
  }

  /**
   * Fatura gelirini projeyle ilişkilendir.
   * InvoiceService fatura onaylandığında bu metodu çağırır.
   */
  async linkRevenue(projectId: string, amountKurus: bigint): Promise<void> {
    const { projectRepo, tenantId } = await this.repos();
    const project = await this.findOne(projectId);

    project.revenueKurus = project.revenueKurus + amountKurus;
    await projectRepo.save(project);

    this.logger.debug(
      `[${tenantId}] Proje geliri bağlandı: ${project.projectCode} ` +
      `+${(Number(amountKurus) / 100).toFixed(2)} ₺`,
    );
  }

  /**
   * Proje Kar/Zarar (P&L) raporu.
   * Gerçekleşen maliyet, gelir ve bütçe karşılaştırması döner.
   */
  async getProjectPnL(id: string): Promise<ProjectPnL> {
    const project = await this.findOne(id);

    const budget         = project.budgetKurus;
    const actualCost     = project.actualCostKurus;
    const revenue        = project.revenueKurus;
    const grossProfit    = revenue - actualCost;
    const budgetVariance = budget - actualCost;

    // Kar marjı hesapla (gelir sıfır ise gösterilemez)
    const profitMargin =
      revenue > BigInt(0)
        ? Number((grossProfit * BigInt(10000)) / revenue) / 100  // 2 ondalık hassasiyet
        : null;

    return {
      projectId:   project.id,
      projectCode: project.projectCode,
      projectName: project.name,
      currency:    project.currency,
      budget,
      actualCost,
      revenue,
      grossProfit,
      budgetVariance,
      profitMargin,
    };
  }

  // ─── Görev (WBS) Yönetimi ──────────────────────────────────────────────────

  /** Projeye yeni görev ekle */
  async addTask(
    projectId: string,
    dto:       CreateProjectTaskDto,
  ): Promise<ProjectTask> {
    const { taskRepo } = await this.repos();
    // Proje tenant kontrolü
    await this.findOne(projectId);

    const task = taskRepo.create({
      projectId,
      parentTaskId:     dto.parentTaskId,
      taskCode:         dto.taskCode,
      name:             dto.name,
      description:      dto.description,
      status:           dto.status ?? 'YAPILACAK',
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : undefined,
      plannedEndDate:   dto.plannedEndDate   ? new Date(dto.plannedEndDate)   : undefined,
      plannedHours:     dto.plannedHours     ?? 0,
      actualHours:      0,
      assignedTo:       dto.assignedTo,
      sortOrder:        dto.sortOrder ?? 0,
    });

    return taskRepo.save(task);
  }

  /** Proje görevlerini listele */
  async findTasks(projectId: string, page = 1, limit = 50): Promise<{ items: ProjectTask[]; total: number; page: number; limit: number }> {
    const { taskRepo } = await this.repos();
    // Proje tenant kontrolü
    await this.findOne(projectId);

    const offset = (page - 1) * limit;
    const [items, total] = await taskRepo.findAndCount({
      where:  { projectId },
      order:  { sortOrder: 'ASC' },
      skip:   offset,
      take:   limit,
    });

    return { items, total, page, limit };
  }

  /** Görevi güncelle */
  async updateTask(
    projectId: string,
    taskId:    string,
    dto:       UpdateProjectTaskDto,
  ): Promise<ProjectTask> {
    const { taskRepo } = await this.repos();
    await this.findOne(projectId);
    const task = await taskRepo.findOne({ where: { id: taskId, projectId } });
    if (!task) throw new NotFoundException(`Görev bulunamadı: ${taskId}`);

    if (dto.name            !== undefined) task.name            = dto.name;
    if (dto.description     !== undefined) task.description     = dto.description;
    if (dto.status          !== undefined) task.status          = dto.status;
    if (dto.actualStartDate !== undefined) task.actualStartDate = new Date(dto.actualStartDate);
    if (dto.actualEndDate   !== undefined) task.actualEndDate   = new Date(dto.actualEndDate);
    if (dto.actualHours     !== undefined) task.actualHours     = dto.actualHours;
    if (dto.assignedTo      !== undefined) task.assignedTo      = dto.assignedTo;

    return taskRepo.save(task);
  }

  /** Proje maliyet kalemlerini listele */
  async findCosts(projectId: string, page = 1, limit = 50): Promise<{ items: ProjectCost[]; total: number; page: number; limit: number }> {
    const { costRepo } = await this.repos();
    // Proje tenant kontrolü
    await this.findOne(projectId);

    const offset = (page - 1) * limit;
    const [items, total] = await costRepo.findAndCount({
      where: { projectId },
      order: { costDate: 'DESC' },
      skip:  offset,
      take:  limit,
    });

    return { items, total, page, limit };
  }
}

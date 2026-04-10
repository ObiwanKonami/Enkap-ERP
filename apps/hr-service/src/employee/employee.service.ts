import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Employee } from './entities/employee.entity';
import { FleetSyncService } from './fleet-sync.service';
import { HrEventsPublisher } from '../events/hr-events.publisher';

export interface CreateEmployeeDto {
  sicilNo: string;
  tckn: string;
  sgkNo?: string;
  name: string;
  surname: string;
  gender?: 'male' | 'female';
  birthDate?: string;       // ISO 8601
  hireDate: string;
  department?: string;
  title?: string;
  grossSalaryKurus: number;
  salaryType?: 'monthly' | 'hourly';
  bankIban?: string;
  disabilityDegree?: 0 | 1 | 2 | 3;
  email?: string;
  phone?: string;
  /** Dolu ise çalışan aynı zamanda sürücü — fleet-service ile senkronize edilir */
  licenseClass?: string;
  licenseNumber?: string;
  licenseExpires?: string;
}

@Injectable()
export class EmployeeService {
  private readonly logger = new Logger(EmployeeService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly fleetSync: FleetSyncService,
    private readonly hrEvents: HrEventsPublisher,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Employee);

    // Sicil numarası benzersiz olmalı
    const existing = await repo.findOne({
      where: { tenantId, sicilNo: dto.sicilNo },
    });

    if (existing) {
      throw new ConflictException(
        `Sicil numarası zaten kullanılıyor: ${dto.sicilNo}`,
      );
    }

    const employee = repo.create({
      tenantId,
      sicilNo:          dto.sicilNo,
      tckn:             dto.tckn,
      sgkNo:            dto.sgkNo ?? null,
      name:             dto.name,
      surname:          dto.surname,
      gender:           dto.gender ?? null,
      birthDate:        dto.birthDate ? new Date(dto.birthDate) : null,
      hireDate:         new Date(dto.hireDate),
      department:       dto.department ?? null,
      title:            dto.title ?? null,
      grossSalaryKurus: dto.grossSalaryKurus,
      salaryType:       dto.salaryType ?? 'monthly',
      bankIban:         dto.bankIban ?? null,
      disabilityDegree: dto.disabilityDegree ?? 0,
      status:           'active',
      email:            dto.email ?? null,
      phone:            dto.phone ?? null,
      licenseClass:     dto.licenseClass ?? null,
      licenseNumber:    dto.licenseNumber ?? null,
      licenseExpires:   dto.licenseExpires ?? null,
    });

    const saved = await repo.save(employee);
    this.logger.log(`Çalışan oluşturuldu: sicil=${dto.sicilNo}, tenant=${tenantId}`);

    // hr.employee.hired → auth-service hesap oluşturur
    if (saved.email) {
      this.hrEvents.publishEmployeeHired({
        tenantId,
        employeeId: saved.id,
        sicilNo:    saved.sicilNo,
        name:       saved.name,
        surname:    saved.surname,
        email:      saved.email,
        phone:      saved.phone ?? undefined,
        department: saved.department ?? undefined,
        title:      saved.title ?? undefined,
        hireDate:   dto.hireDate,
      });
    }

    // Ehliyet bilgisi varsa fleet-service'e sürücü kaydı oluştur
    if (saved.licenseClass) {
      this.fleetSync.syncCreate({
        tenantId,
        employeeId:     saved.id,
        firstName:      saved.name,
        lastName:       saved.surname,
        phone:          saved.phone ?? undefined,
        licenseClass:   saved.licenseClass,
        licenseNumber:  saved.licenseNumber ?? undefined,
        licenseExpires: saved.licenseExpires ?? undefined,
      });
    }

    return saved;
  }

  async findAll(
    opts: { status?: Employee['status']; search?: string; department?: string; page?: number; limit?: number } = {},
  ): Promise<{ items: Employee[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const qb = ds.getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.tenant_id = :tenantId', { tenantId })
      .orderBy('e.surname', 'ASC')
      .addOrderBy('e.name', 'ASC');

    if (opts.search) {
      qb.andWhere(
        "(e.name ILIKE :search OR e.surname ILIKE :search OR CONCAT(e.name, ' ', e.surname) ILIKE :search)",
        { search: `%${opts.search}%` }
      );
    }
    if (opts.department) {
      qb.andWhere('e.department = :department', { department: opts.department });
    }
    if (opts.status) {
      qb.andWhere('e.status = :status', { status: opts.status });
    }

    const page   = opts.page ?? 1;
    const limit  = Math.min(opts.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<Employee> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const employee = await ds.getRepository(Employee).findOne({
      where: { id, tenantId },
    });

    if (!employee) {
      throw new NotFoundException(`Çalışan bulunamadı: ${id}`);
    }

    return employee;
  }

  async update(
    id: string,
    dto: Partial<CreateEmployeeDto>,
  ): Promise<Employee> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(Employee);

    const employee = await this.findOne(id);

    if (dto.grossSalaryKurus !== undefined) employee.grossSalaryKurus = dto.grossSalaryKurus;
    if (dto.title !== undefined)            employee.title         = dto.title ?? null;
    if (dto.department !== undefined)       employee.department    = dto.department ?? null;
    if (dto.bankIban !== undefined)         employee.bankIban      = dto.bankIban ?? null;
    if (dto.disabilityDegree !== undefined) employee.disabilityDegree = dto.disabilityDegree;
    if (dto.email !== undefined)            employee.email         = dto.email ?? null;
    if (dto.phone !== undefined)            employee.phone         = dto.phone ?? null;
    if (dto.licenseClass !== undefined)     employee.licenseClass  = dto.licenseClass ?? null;
    if (dto.licenseNumber !== undefined)    employee.licenseNumber = dto.licenseNumber ?? null;
    if (dto.licenseExpires !== undefined)   employee.licenseExpires = dto.licenseExpires ?? null;

    const saved = await repo.save(employee);
    this.logger.log(`Çalışan güncellendi: id=${id}`);

    // Ehliyet bilgisi varsa fleet-service sürücü kaydını senkronize et
    if (saved.licenseClass) {
      this.fleetSync.syncUpdate({
        tenantId: saved.tenantId,
        employeeId:     saved.id,
        firstName:      saved.name,
        lastName:       saved.surname,
        phone:          saved.phone ?? undefined,
        licenseClass:   saved.licenseClass,
        licenseNumber:  saved.licenseNumber ?? undefined,
        licenseExpires: saved.licenseExpires ?? undefined,
      });
    }

    return saved;
  }

  /** Manuel fleet-service senkronizasyonu — mevcut sürücüyü fleet'e gönderir */
  async triggerFleetSync(id: string): Promise<{ synced: boolean; reason?: string }> {
    const { tenantId } = getTenantContext();
    const employee = await this.findOne(id);

    if (!employee.licenseClass) {
      return { synced: false, reason: 'Çalışanın ehliyet sınıfı tanımlanmamış' };
    }

    this.fleetSync.syncCreate({
      tenantId,
      employeeId:     employee.id,
      firstName:      employee.name,
      lastName:       employee.surname,
      phone:          employee.phone ?? undefined,
      licenseClass:   employee.licenseClass,
      licenseNumber:  employee.licenseNumber ?? undefined,
      licenseExpires: employee.licenseExpires ?? undefined,
    });

    this.logger.log(`Manuel fleet sync tetiklendi: employeeId=${id}`);
    return { synced: true };
  }

  /** İşten çıkış (soft delete — kayıtlar silinmez) */
  async terminate(id: string, terminationDate: string): Promise<void> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const employee = await this.findOne(id);
    employee.status          = 'terminated';
    employee.terminationDate = new Date(terminationDate);

    await ds.getRepository(Employee).save(employee);
    this.logger.log(`Çalışan işten çıkarıldı: id=${id}`);

    // Fleet sürücü kaydını pasife al (ehliyet bilgisi olmasa da çağır — servis idempotent)
    this.fleetSync.syncTerminate(employee.tenantId, id);
  }
}

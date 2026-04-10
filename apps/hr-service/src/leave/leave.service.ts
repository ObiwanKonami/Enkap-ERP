import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { LeaveRequest } from './entities/leave-request.entity';
import type { LeaveType } from '@enkap/shared-types';
import { LeaveBalance } from './entities/leave-balance.entity';
import { Employee } from '../employee/entities/employee.entity';

/** İş kanununa göre hizmet süresine bağlı yıllık izin hakkı (iş günü) */
function calculateAnnualEntitlement(hireDateStr: string | Date): number {
  const hireDate = new Date(hireDateStr);
  const today    = new Date();
  const years    = (today.getTime() - hireDate.getTime()) / (365.25 * 24 * 3600 * 1000);

  if (years < 1)  return 0;
  if (years < 5)  return 14;
  if (years < 15) return 20;
  return 26;
}

function countWorkingDays(startStr: string, endStr: string): number {
  const start = new Date(startStr);
  const end   = new Date(endStr);
  if (end < start) return 0;

  let days = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days++;
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export interface CreateLeaveRequestDto {
  employeeId: string;
  leaveType:  LeaveType;
  startDate:  string;
  endDate:    string;
  notes?:     string;
  medicalReportNo?: string;
}

export interface ApproveLeaveDto {
  approverId: string;
  approved:   boolean;
  notes?:     string;
}

/**
 * İzin Yönetimi Servisi.
 * Tüm tablolar tenant schema'da — TenantDataSourceManager ile erişilir.
 */
@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  async createRequest(dto: CreateLeaveRequestDto): Promise<LeaveRequest> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    // Employee tenant schema'da — TenantDataSourceManager ile erişilmeli
    const employee = await ds.getRepository(Employee).findOne({
      where: { id: dto.employeeId, tenantId },
    });
    if (!employee) {
      throw new NotFoundException(`Çalışan bulunamadı: ${dto.employeeId}`);
    }
    if (employee.status === 'terminated') {
      throw new ForbiddenException('İşten ayrılmış çalışan için izin talebi oluşturulamaz.');
    }

    const workingDays = countWorkingDays(dto.startDate, dto.endDate);
    if (workingDays <= 0) {
      throw new BadRequestException('Geçerli bir tarih aralığı giriniz.');
    }

    // Yıllık izin bakiye kontrolü
    if (dto.leaveType === 'annual') {
      const year    = new Date(dto.startDate).getFullYear();
      const balance = await this.getOrCreateBalance(tenantId, dto.employeeId, employee.hireDate, year);

      if (balance.remainingDays < workingDays) {
        throw new BadRequestException(
          `Yetersiz izin bakiyesi. Kalan: ${balance.remainingDays} gün, Talep: ${workingDays} gün.`,
        );
      }

      balance.pendingDays += workingDays;
      await ds.getRepository(LeaveBalance).save(balance);
    }

    const request = ds.getRepository(LeaveRequest).create({
      tenantId,
      employeeId:      dto.employeeId,
      leaveType:       dto.leaveType,
      startDate:       dto.startDate,
      endDate:         dto.endDate,
      workingDays,
      status:          'pending',
      notes:           dto.notes ?? null,
      medicalReportNo: dto.medicalReportNo ?? null,
    });

    const saved = await ds.getRepository(LeaveRequest).save(request);
    this.logger.log(
      `İzin talebi oluşturuldu: employee=${dto.employeeId}, type=${dto.leaveType}, ` +
      `${dto.startDate} → ${dto.endDate} (${workingDays} iş günü)`,
    );
    return saved;
  }

  async approveRequest(requestId: string, dto: ApproveLeaveDto): Promise<LeaveRequest> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const request = await ds.getRepository(LeaveRequest).findOne({
      where: { id: requestId, tenantId },
    });
    if (!request) {
      throw new NotFoundException(`İzin talebi bulunamadı: ${requestId}`);
    }
    if (request.status !== 'pending') {
      throw new BadRequestException(`Bu talep zaten işlenmiş: ${request.status}`);
    }

    request.status     = dto.approved ? 'approved' : 'rejected';
    request.approvedBy = dto.approverId;
    request.approvedAt = new Date();
    if (dto.notes) request.notes = dto.notes;

    if (request.leaveType === 'annual') {
      const year    = new Date(request.startDate).getFullYear();
      const balance = await ds.getRepository(LeaveBalance).findOne({
        where: { tenantId, employeeId: request.employeeId, year },
      });
      if (balance) {
        balance.pendingDays -= request.workingDays;
        if (dto.approved) balance.usedDays += request.workingDays;
        await ds.getRepository(LeaveBalance).save(balance);
      }
    }

    const saved = await ds.getRepository(LeaveRequest).save(request);
    this.logger.log(`İzin talebi ${dto.approved ? 'onaylandı' : 'reddedildi'}: id=${requestId}`);
    return saved;
  }

  async listForEmployee(
    employeeId: string,
    params?: { page?: number; limit?: number },
  ): Promise<{ items: LeaveRequest[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const qb = ds.getRepository(LeaveRequest)
      .createQueryBuilder('lr')
      .where('lr.tenant_id = :tenantId', { tenantId })
      .andWhere('lr.employee_id = :employeeId', { employeeId })
      .orderBy('lr.created_at', 'DESC');

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  async listPending(params?: {
    page?: number;
    limit?: number;
  }): Promise<{ items: LeaveRequest[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const qb = ds.getRepository(LeaveRequest)
      .createQueryBuilder('lr')
      .where('lr.tenant_id = :tenantId', { tenantId })
      .andWhere('lr.status = :status', { status: 'pending' })
      .orderBy('lr.created_at', 'ASC');

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  async getUnpaidLeaveDays(employeeId: string, month: number, year: number): Promise<number> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay    = new Date(year, month, 0).getDate();
    const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const requests = await ds.getRepository(LeaveRequest).find({
      where: { tenantId, employeeId, leaveType: 'unpaid', status: 'approved' },
    });

    let total = 0;
    for (const req of requests) {
      const overlapStart = req.startDate > monthStart ? req.startDate : monthStart;
      const overlapEnd   = req.endDate   < monthEnd   ? req.endDate   : monthEnd;
      total += countWorkingDays(overlapStart, overlapEnd);
    }
    return total;
  }

  async getBalance(employeeId: string, year: number): Promise<LeaveBalance> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const employee = await ds.getRepository(Employee).findOne({
      where: { id: employeeId, tenantId },
    });
    if (!employee) {
      throw new NotFoundException(`Çalışan bulunamadı: ${employeeId}`);
    }
    return this.getOrCreateBalance(tenantId, employeeId, employee.hireDate, year);
  }

  async refreshAnnualEntitlements(year: number): Promise<void> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const employees = await ds.getRepository(Employee).find({
      where: { tenantId, status: 'active' },
    });

    for (const emp of employees) {
      const balance     = await this.getOrCreateBalance(tenantId, emp.id, emp.hireDate, year);
      const entitlement = calculateAnnualEntitlement(emp.hireDate);
      const prevBalance = await ds.getRepository(LeaveBalance).findOne({
        where: { tenantId, employeeId: emp.id, year: year - 1 },
      });
      const carryOver = Math.min(prevBalance?.remainingDays ?? 0, 30);

      balance.earnedDays      = entitlement;
      balance.carriedOverDays = carryOver;
      balance.usedDays        = 0;
      balance.pendingDays     = 0;
      await ds.getRepository(LeaveBalance).save(balance);
    }

    this.logger.log(`Yıllık izin hakları güncellendi: ${employees.length} çalışan, yıl=${year}`);
  }

  private async getOrCreateBalance(
    tenantId:   string,
    employeeId: string,
    hireDate:   Date,
    year:       number,
  ): Promise<LeaveBalance> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(LeaveBalance);

    let balance = await repo.findOne({ where: { tenantId, employeeId, year } });
    if (!balance) {
      balance = repo.create({
        tenantId,
        employeeId,
        year,
        earnedDays:      calculateAnnualEntitlement(hireDate),
        carriedOverDays: 0,
        usedDays:        0,
        pendingDays:     0,
      });
      balance = await repo.save(balance);
    }
    return balance;
  }
}

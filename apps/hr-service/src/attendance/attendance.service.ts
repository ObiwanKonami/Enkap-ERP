import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { AttendanceRecord } from './attendance.entity';
import { CreateAttendanceDto } from './dto/create-attendance.dto';

export interface FindAttendanceParams {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  attendanceType?: string;
  limit?: number;
  offset?: number;
}

/**
 * PDKS (Personel Devam Kontrol Sistemi) Servisi.
 *
 * Günlük puantaj kayıtları: giriş/çıkış saati, çalışılan dakika, devamsızlık tipi.
 * Bordro hesaplamasında workingDays belirlenmesi için kullanılır.
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  async create(dto: CreateAttendanceDto): Promise<AttendanceRecord> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(AttendanceRecord);

    // Aynı gün + çalışan için tekrar kayıt engellenir
    const existing = await repo.findOne({
      where: { tenantId, employeeId: dto.employeeId, recordDate: dto.recordDate },
    });
    if (existing) {
      throw new ConflictException(
        `Bu çalışan için ${dto.recordDate} tarihinde zaten kayıt var: ${existing.id}`,
      );
    }

    const checkIn  = dto.checkIn  ? new Date(dto.checkIn)  : null;
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : null;
    const workedMinutes = checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000)
      : null;

    const record = repo.create({
      tenantId,
      employeeId:     dto.employeeId,
      recordDate:     dto.recordDate,
      attendanceType: dto.attendanceType ?? 'NORMAL',
      checkIn,
      checkOut,
      workedMinutes,
      leaveRequestId: dto.leaveRequestId ?? null,
      notes:          dto.notes ?? null,
    });

    const saved = await repo.save(record);
    this.logger.log(
      `Puantaj kaydı: employee=${dto.employeeId}, tarih=${dto.recordDate}, ` +
      `tip=${saved.attendanceType}, dakika=${workedMinutes ?? '-'}`,
    );
    return saved;
  }

  async findAll(params: FindAttendanceParams = {}): Promise<{ data: AttendanceRecord[]; total: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(AttendanceRecord);

    const qb = repo.createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .orderBy('a.record_date', 'DESC');

    if (params.employeeId) {
      qb.andWhere('a.employee_id = :employeeId', { employeeId: params.employeeId });
    }
    if (params.attendanceType) {
      qb.andWhere('a.attendance_type = :type', { type: params.attendanceType });
    }
    if (params.startDate) {
      qb.andWhere('a.record_date >= :startDate', { startDate: params.startDate });
    }
    if (params.endDate) {
      qb.andWhere('a.record_date <= :endDate', { endDate: params.endDate });
    }

    const [data, total] = await qb
      .take(params.limit ?? 50)
      .skip(params.offset ?? 0)
      .getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<AttendanceRecord> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const record = await ds.getRepository(AttendanceRecord).findOne({
      where: { id, tenantId },
    });
    if (!record) {
      throw new NotFoundException(`Puantaj kaydı bulunamadı: ${id}`);
    }
    return record;
  }

  /** Çıkış saatini güncelle ve çalışma dakikasını hesapla */
  async checkOut(id: string, checkOutTime: string): Promise<AttendanceRecord> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(AttendanceRecord);

    const record = await this.findOne(id);
    if (record.checkOut) {
      throw new ConflictException(`Çıkış zaten kaydedilmiş: ${id}`);
    }

    record.checkOut = new Date(checkOutTime);
    if (record.checkIn) {
      record.workedMinutes = Math.round(
        (record.checkOut.getTime() - record.checkIn.getTime()) / 60_000,
      );
    }

    const saved = await repo.save(record);
    this.logger.log(`Çıkış kaydedildi: id=${id}, dakika=${saved.workedMinutes}`);
    return saved;
  }

  /** Bir çalışanın belirli aydaki çalışma günlerini sayar — bordro için */
  async countWorkingDays(employeeId: string, year: number, month: number): Promise<number> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const count = await ds.getRepository(AttendanceRecord).count({
      where: {
        tenantId,
        employeeId,
        recordDate: startDate as unknown as string, // TypeORM Between kullanılmalı ama basit tutuyoruz
      },
    });

    // Daha doğru: QueryBuilder ile tarih aralığı
    const result = await ds.getRepository(AttendanceRecord)
      .createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .andWhere('a.employee_id = :employeeId', { employeeId })
      .andWhere('a.record_date BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere("a.attendance_type NOT IN ('ABSENT', 'LEAVE', 'HOLIDAY')")
      .getCount();

    return result;
  }
}

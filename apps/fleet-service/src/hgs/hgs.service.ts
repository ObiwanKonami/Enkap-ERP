import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { HgsRecord } from './entities/hgs-record.entity';
import { Vehicle }   from '../vehicle/entities/vehicle.entity';
import type { CreateHgsDto } from './dto/create-hgs.dto';

export interface HgsVehicleReport {
  vehicleId:        string;
  plate:            string;
  totalAmountKurus: number;
  transactionCount: number;
  hgsCount:         number;
  ogsCount:         number;
  /** Aylık döküm: son 12 ay */
  byMonth: { month: string; amountKurus: number; count: number }[];
}

@Injectable()
export class HgsService {
  private readonly logger = new Logger(HgsService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      hgsRepo:     ds.getRepository(HgsRecord),
      vehicleRepo: ds.getRepository(Vehicle),
      tenantId,
    };
  }

  /** Araç için HGS/OGS geçiş kaydı ekle */
  async create(vehicleId: string, dto: CreateHgsDto): Promise<HgsRecord> {
    const { hgsRepo, vehicleRepo, tenantId } = await this.repos();

    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const record = hgsRepo.create({
      tenantId,
      vehicleId,
      transactionDate: dto.transactionDate,
      amountKurus:     dto.amountKurus,
      deviceType:      dto.deviceType,
      location:        dto.location,
      direction:       dto.direction,
      balanceKurus:    dto.balanceKurus,
      deviceId:        dto.deviceId,
      tripId:          dto.tripId,
      note:            dto.note,
    });

    const saved = await hgsRepo.save(record);
    this.logger.log(`[${tenantId}] HGS kaydı oluşturuldu: ${saved.id} (araç: ${vehicleId}, tutar: ${dto.amountKurus} kuruş)`);
    return saved;
  }

  /** Araç geçiş geçmişi (sayfalı) */
  async findByVehicle(
    vehicleId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ data: HgsRecord[]; total: number }> {
    const { hgsRepo, vehicleRepo, tenantId } = await this.repos();

    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const [data, total] = await hgsRepo.findAndCount({
      where: { vehicleId, tenantId },
      order: { transactionDate: 'DESC' },
      take:  limit,
      skip:  offset,
    });

    return { data, total };
  }

  /** Tenant genelinde son geçişler (tüm araçlar) */
  async findAll(
    params?: { vehicleId?: string; limit?: number; offset?: number },
  ): Promise<{ data: HgsRecord[]; total: number }> {
    const { hgsRepo, tenantId } = await this.repos();

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const where: Record<string, unknown> = { tenantId };
    if (params?.vehicleId) where['vehicleId'] = params.vehicleId;

    const [data, total] = await hgsRepo.findAndCount({
      where,
      order: { transactionDate: 'DESC' },
      take:  limit,
      skip:  offset,
    });

    return { data, total };
  }

  /**
   * Araç bazlı HGS/OGS raporu
   *
   * Toplam tutar, sayı, HGS/OGS dağılımı ve aylık döküm döndürür.
   */
  async getVehicleReport(vehicleId: string): Promise<HgsVehicleReport> {
    const { hgsRepo, vehicleRepo, tenantId } = await this.repos();

    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    // Özet istatistikler
    const summary = await hgsRepo
      .createQueryBuilder('h')
      .select('SUM(h.amount_kurus)',                        'totalAmount')
      .addSelect('COUNT(*)',                                 'totalCount')
      .addSelect("SUM(CASE WHEN h.device_type='HGS' THEN 1 ELSE 0 END)", 'hgsCount')
      .addSelect("SUM(CASE WHEN h.device_type='OGS' THEN 1 ELSE 0 END)", 'ogsCount')
      .where('h.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('h.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ totalAmount: string; totalCount: string; hgsCount: string; ogsCount: string }>();

    // Son 12 ay aylık döküm
    const monthly = await hgsRepo
      .createQueryBuilder('h')
      .select("TO_CHAR(h.transaction_date, 'YYYY-MM')", 'month')
      .addSelect('SUM(h.amount_kurus)',                  'amountKurus')
      .addSelect('COUNT(*)',                              'count')
      .where('h.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('h.tenant_id = :tenantId', { tenantId })
      .andWhere("h.transaction_date >= NOW() - INTERVAL '12 months'")
      .groupBy("TO_CHAR(h.transaction_date, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany<{ month: string; amountKurus: string; count: string }>();

    return {
      vehicleId,
      plate:            vehicle.plate,
      totalAmountKurus: parseInt(summary?.totalAmount ?? '0', 10),
      transactionCount: parseInt(summary?.totalCount  ?? '0', 10),
      hgsCount:         parseInt(summary?.hgsCount    ?? '0', 10),
      ogsCount:         parseInt(summary?.ogsCount    ?? '0', 10),
      byMonth: monthly.map(m => ({
        month:       m.month,
        amountKurus: parseInt(m.amountKurus, 10),
        count:       parseInt(m.count, 10),
      })),
    };
  }

  /**
   * Tenant geneli HGS/OGS özeti — tüm araçların aylık toplamı
   */
  async getTenantSummary(): Promise<{
    totalAmountKurus: number;
    transactionCount: number;
    byVehicle: { vehicleId: string; plate: string; amountKurus: number; count: number }[];
  }> {
    const { hgsRepo, vehicleRepo, tenantId } = await this.repos();

    const rows = await hgsRepo
      .createQueryBuilder('h')
      .select('h.vehicle_id',        'vehicleId')
      .addSelect('SUM(h.amount_kurus)', 'amountKurus')
      .addSelect('COUNT(*)',            'count')
      .where('h.tenant_id = :tenantId', { tenantId })
      .groupBy('h.vehicle_id')
      .orderBy('SUM(h.amount_kurus)', 'DESC')
      .getRawMany<{ vehicleId: string; amountKurus: string; count: string }>();

    // Plaka bilgisini çek
    const vehicleIds = rows.map(r => r.vehicleId);
    const vehicles   = vehicleIds.length
      ? await vehicleRepo
          .createQueryBuilder('v')
          .where('v.id IN (:...ids)', { ids: vehicleIds })
          .andWhere('v.tenant_id = :tenantId', { tenantId })
          .getMany()
      : [];

    const plateMap = new Map(vehicles.map(v => [v.id, v.plate]));

    const byVehicle = rows.map(r => ({
      vehicleId:   r.vehicleId,
      plate:       plateMap.get(r.vehicleId) ?? r.vehicleId,
      amountKurus: parseInt(r.amountKurus, 10),
      count:       parseInt(r.count, 10),
    }));

    return {
      totalAmountKurus: byVehicle.reduce((s, r) => s + r.amountKurus, 0),
      transactionCount: byVehicle.reduce((s, r) => s + r.count, 0),
      byVehicle,
    };
  }
}

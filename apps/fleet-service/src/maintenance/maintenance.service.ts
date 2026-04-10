import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { MaintenanceRecord } from './entities/maintenance-record.entity';
import { Vehicle } from '../vehicle/entities/vehicle.entity';
import type { CreateMaintenanceDto } from './dto/create-maintenance.dto';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  /** Tenant DataSource + repository'leri döndür */
  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      maintenanceRepo: ds.getRepository(MaintenanceRecord),
      vehicleRepo:     ds.getRepository(Vehicle),
      tenantId,
    };
  }

  /**
   * Bakım kaydı ekle
   *
   * 1. MaintenanceRecord oluşturulur
   * 2. kmAtService sağlanmışsa araç km sayacı güncellenir
   */
  async create(vehicleId: string, dto: CreateMaintenanceDto): Promise<MaintenanceRecord> {
    const { maintenanceRepo, vehicleRepo, tenantId } = await this.repos();

    // Araç tenant'a ait mi kontrol et
    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const record = maintenanceRepo.create({
      tenantId,
      vehicleId,
      type:            dto.type,
      description:     dto.description,
      serviceDate:     dto.serviceDate,
      nextServiceDate: dto.nextServiceDate,
      nextServiceKm:   dto.nextServiceKm,
      kmAtService:     dto.kmAtService,
      costKurus:       dto.costKurus,
      vendor:          dto.vendor,
      invoiceNumber:   dto.invoiceNumber,
    });

    const saved = await maintenanceRepo.save(record);

    // Bakım sırasındaki km, araç sayacından yüksekse güncelle
    if (dto.kmAtService !== undefined && dto.kmAtService > vehicle.currentKm) {
      vehicle.currentKm = dto.kmAtService;
      await vehicleRepo.save(vehicle);
    }

    this.logger.log(`[${tenantId}] Bakım kaydı oluşturuldu: ${saved.id} (araç: ${vehicleId})`);

    // Muhasebe entegrasyonu: financial-service'e gider yevmiyesi gönder (fire-and-forget)
    if (dto.costKurus !== undefined && dto.costKurus > 0) {
      const financialUrl = this.config.get('FINANCIAL_SERVICE_URL', 'http://localhost:3003');
      const jwtToken     = this.config.get('INTERNAL_SERVICE_TOKEN', '');
      firstValueFrom(
        this.httpService.post(
          `${financialUrl}/api/v1/journal-entries`,
          {
            entryDate:     dto.serviceDate,
            description:   `Bakım gideri — ${vehicle.plate} (${dto.type})`,
            referenceType: 'MAINTENANCE_EXPENSE',
            referenceId:   saved.id,
            createdBy:     'fleet-service',
            lines: [
              { accountCode: '770', description: `Bakım — ${vehicle.plate}`, debitAmount: dto.costKurus, creditAmount: 0 },
              { accountCode: '320', description: `Bakım — ${dto.vendor ?? 'Servis'}`, debitAmount: 0, creditAmount: dto.costKurus },
            ],
          },
          { headers: { Authorization: `Bearer ${jwtToken}` } },
        ),
      ).catch((err: unknown) =>
        this.logger.warn(`[${tenantId}] Bakım yevmiyesi gönderilemedi: ${(err as Error).message}`),
      );
    }

    return saved;
  }

  /** Araç bakım geçmişi */
  async findByVehicle(
    vehicleId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ data: MaintenanceRecord[]; total: number }> {
    const { maintenanceRepo, vehicleRepo, tenantId } = await this.repos();

    // Araç tenant'a ait mi kontrol et
    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const [data, total] = await maintenanceRepo.findAndCount({
      where: { vehicleId, tenantId },
      order: { serviceDate: 'DESC' },
      take:  limit,
      skip:  offset,
    });

    return { data, total };
  }

  /**
   * Yaklaşan bakımlar
   *
   * next_service_date <= bugün + {days} gün olan kayıtlar
   * @param days Kaç gün içindeki bakımlar gösterilsin (varsayılan: 30)
   */
  async getUpcoming(days?: number): Promise<MaintenanceRecord[]> {
    const { maintenanceRepo, tenantId } = await this.repos();

    const lookAheadDays = days ?? 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + lookAheadDays);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const today  = new Date().toISOString().slice(0, 10);

    return maintenanceRepo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.next_service_date IS NOT NULL')
      .andWhere('m.next_service_date >= :today',   { today })
      .andWhere('m.next_service_date <= :cutoff',  { cutoff })
      .orderBy('m.next_service_date', 'ASC')
      .getMany();
  }
}

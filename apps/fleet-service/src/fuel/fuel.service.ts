import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { FuelRecord } from './entities/fuel-record.entity';
import { Vehicle }   from '../vehicle/entities/vehicle.entity';
import type { CreateFuelDto } from './dto/create-fuel.dto';

/** Yakıt istatistikleri */
export interface FuelStats {
  totalLiters:   number;
  totalKurus:    number;
  recordCount:   number;
  /** Ortalama lt/100km (yalnızca km verileri mevcutsa hesaplanır) */
  avgConsumption: number | null;
}

@Injectable()
export class FuelService {
  private readonly logger = new Logger(FuelService.name);

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
      fuelRepo:    ds.getRepository(FuelRecord),
      vehicleRepo: ds.getRepository(Vehicle),
      tenantId,
    };
  }

  /** Yakıt kaydı ekle */
  async create(vehicleId: string, dto: CreateFuelDto): Promise<FuelRecord> {
    const { fuelRepo, vehicleRepo, tenantId } = await this.repos();

    // Araç tenant'a ait mi kontrol et
    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const record = fuelRepo.create({
      tenantId,
      vehicleId,
      tripId:             dto.tripId,
      fuelingDate:        dto.fuelingDate,
      liters:             dto.liters,
      pricePerLiterKurus: dto.pricePerLiterKurus,
      totalKurus:         dto.totalKurus,
      station:            dto.station,
      kmAtFueling:        dto.kmAtFueling,
    });

    const saved = await fuelRepo.save(record);

    // Yakıt alım km'si araç sayacından yüksekse güncelle
    if (dto.kmAtFueling !== undefined && dto.kmAtFueling > vehicle.currentKm) {
      vehicle.currentKm = dto.kmAtFueling;
      await vehicleRepo.save(vehicle);
    }

    this.logger.log(`[${tenantId}] Yakıt kaydı oluşturuldu: ${saved.id} (${dto.liters}L, araç: ${vehicleId})`);

    // Muhasebe entegrasyonu: financial-service'e gider yevmiyesi gönder (fire-and-forget)
    if (dto.totalKurus > 0) {
      const financialUrl = this.config.get('FINANCIAL_SERVICE_URL', 'http://localhost:3003');
      const jwtToken     = this.config.get('INTERNAL_SERVICE_TOKEN', '');
      firstValueFrom(
        this.httpService.post(
          `${financialUrl}/api/v1/journal-entries`,
          {
            entryDate:     dto.fuelingDate,
            description:   `Yakıt gideri — ${vehicle.plate} (${dto.liters}L)`,
            referenceType: 'FUEL_EXPENSE',
            referenceId:   saved.id,
            createdBy:     'fleet-service',
            lines: [
              { accountCode: '770', description: `Yakıt — ${vehicle.plate}`, debitAmount: dto.totalKurus,  creditAmount: 0 },
              { accountCode: '320', description: `Yakıt — ${dto.station ?? 'İstasyon'}`, debitAmount: 0, creditAmount: dto.totalKurus },
            ],
          },
          { headers: { Authorization: `Bearer ${jwtToken}` } },
        ),
      ).catch((err: unknown) =>
        this.logger.warn(`[${tenantId}] Yakıt yevmiyesi gönderilemedi: ${(err as Error).message}`),
      );
    }

    return saved;
  }

  /** Araç yakıt geçmişi */
  async findByVehicle(
    vehicleId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<{ data: FuelRecord[]; total: number }> {
    const { fuelRepo, vehicleRepo, tenantId } = await this.repos();

    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const [data, total] = await fuelRepo.findAndCount({
      where: { vehicleId, tenantId },
      order: { fuelingDate: 'DESC' },
      take:  limit,
      skip:  offset,
    });

    return { data, total };
  }

  /**
   * Araç yakıt istatistikleri
   *
   * Toplam litre, toplam tutar, kayıt sayısı ve km verisi mevcutsa
   * ortalama lt/100km tüketimi hesaplanır.
   */
  async getStats(vehicleId: string): Promise<FuelStats> {
    const { fuelRepo, vehicleRepo, tenantId } = await this.repos();

    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    const result = await fuelRepo
      .createQueryBuilder('f')
      .select('SUM(f.liters)',       'totalLiters')
      .addSelect('SUM(f.total_kurus)', 'totalKurus')
      .addSelect('COUNT(*)',           'recordCount')
      .addSelect('MIN(f.km_at_fueling)', 'minKm')
      .addSelect('MAX(f.km_at_fueling)', 'maxKm')
      .where('f.vehicle_id = :vehicleId', { vehicleId })
      .andWhere('f.tenant_id = :tenantId', { tenantId })
      .getRawOne<{
        totalLiters:  string;
        totalKurus:   string;
        recordCount:  string;
        minKm:        string | null;
        maxKm:        string | null;
      }>();

    const totalLiters  = parseFloat(result?.totalLiters  ?? '0');
    const totalKurus   = parseInt(result?.totalKurus    ?? '0', 10);
    const recordCount  = parseInt(result?.recordCount   ?? '0', 10);
    const minKm        = result?.minKm  !== null ? parseInt(result?.minKm  ?? '0', 10) : null;
    const maxKm        = result?.maxKm  !== null ? parseInt(result?.maxKm  ?? '0', 10) : null;

    // Ortalama tüketim: litre / km * 100 (lt/100km)
    let avgConsumption: number | null = null;
    if (minKm !== null && maxKm !== null && maxKm > minKm && totalLiters > 0) {
      avgConsumption = (totalLiters / (maxKm - minKm)) * 100;
    }

    return { totalLiters, totalKurus, recordCount, avgConsumption };
  }
}

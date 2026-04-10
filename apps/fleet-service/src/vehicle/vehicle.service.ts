import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Vehicle } from './entities/vehicle.entity';
import type { VehicleStatus, VehicleType } from './entities/vehicle.entity';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';
import type { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import type { FuelRecord }        from '../fuel/entities/fuel-record.entity';
import type { Trip }              from '../trip/entities/trip.entity';

@Injectable()
export class VehicleService {
  private readonly logger = new Logger(VehicleService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /** Tenant DataSource + repository'leri döndür */
  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      vehicleRepo:     ds.getRepository(Vehicle),
      maintenanceRepo: ds.getRepository<MaintenanceRecord>('maintenance_records'),
      fuelRepo:        ds.getRepository<FuelRecord>('fuel_records'),
      tripRepo:        ds.getRepository<Trip>('trips'),
      tenantId,
    };
  }

  /** Yeni araç ekle */
  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    const { vehicleRepo, tenantId } = await this.repos();

    const vehicle = vehicleRepo.create({
      tenantId,
      plate:                    dto.plate,
      brand:                    dto.brand,
      model:                    dto.model,
      year:                     dto.year,
      type:                     dto.type,
      capacityKg:               dto.capacityKg,
      volumeM3:                 dto.volumeM3,
      status:                   'AKTIF',
      assignedWarehouseId:      dto.assignedWarehouseId,
      currentKm:                dto.currentKm ?? 0,
      vin:                      dto.vin,
      registrationExpires:      dto.registrationExpires,
      inspectionExpires:        dto.inspectionExpires,
      insuranceExpires:         dto.insuranceExpires,
      trafficInsuranceExpires:  dto.trafficInsuranceExpires,
      gpsDeviceId:              dto.gpsDeviceId,
      gpsProvider:              dto.gpsProvider,
    });

    const saved = await vehicleRepo.save(vehicle);
    this.logger.log(`[${tenantId}] Araç oluşturuldu: ${saved.plate} (${saved.id})`);
    return saved;
  }

  /** Araç listesi */
  async findAll(params?: {
    status?: VehicleStatus;
    type?:   VehicleType;
    page?:   number;
    limit?:  number;
  }): Promise<{ items: Vehicle[]; total: number; page: number; limit: number }> {
    const { vehicleRepo, tenantId } = await this.repos();

    const qb = vehicleRepo.createQueryBuilder('v')
      .where('v.tenant_id = :tenantId', { tenantId })
      .orderBy('v.plate', 'ASC');

    if (params?.status) qb.andWhere('v.status = :status', { status: params.status });
    if (params?.type)   qb.andWhere('v.type = :type',     { type: params.type });

    const page   = params?.page   ?? 1;
    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = (page - 1) * limit;

    const [data, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items: data, total, page, limit };
  }

  /** Araç detayı */
  async findOne(id: string): Promise<Vehicle> {
    const { vehicleRepo, tenantId } = await this.repos();
    const vehicle = await vehicleRepo.findOne({ where: { id, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${id}`);
    return vehicle;
  }

  /** Araç güncelle */
  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const { vehicleRepo } = await this.repos();
    const vehicle = await this.findOne(id);

    if (dto.plate                   !== undefined) vehicle.plate                   = dto.plate;
    if (dto.brand                   !== undefined) vehicle.brand                   = dto.brand;
    if (dto.model                   !== undefined) vehicle.model                   = dto.model;
    if (dto.year                    !== undefined) vehicle.year                    = dto.year;
    if (dto.type                    !== undefined) vehicle.type                    = dto.type;
    if (dto.capacityKg              !== undefined) vehicle.capacityKg              = dto.capacityKg;
    if (dto.volumeM3                !== undefined) vehicle.volumeM3                = dto.volumeM3;
    if (dto.status                  !== undefined) vehicle.status                  = dto.status;
    if (dto.assignedWarehouseId     !== undefined) vehicle.assignedWarehouseId     = dto.assignedWarehouseId;
    if (dto.currentKm               !== undefined) vehicle.currentKm               = dto.currentKm;
    if (dto.vin                     !== undefined) vehicle.vin                     = dto.vin;
    if (dto.registrationExpires     !== undefined) vehicle.registrationExpires     = dto.registrationExpires;
    if (dto.inspectionExpires       !== undefined) vehicle.inspectionExpires       = dto.inspectionExpires;
    if (dto.insuranceExpires        !== undefined) vehicle.insuranceExpires        = dto.insuranceExpires;
    if (dto.trafficInsuranceExpires !== undefined) vehicle.trafficInsuranceExpires = dto.trafficInsuranceExpires;
    if (dto.gpsDeviceId             !== undefined) vehicle.gpsDeviceId             = dto.gpsDeviceId;
    if (dto.gpsProvider             !== undefined) vehicle.gpsProvider             = dto.gpsProvider;

    return vehicleRepo.save(vehicle);
  }

  /**
   * GPS konumunu güncelle
   *
   * GPS webhook'u farklı auth kullandığı için tenantId parametre olarak alınır.
   * vehicle.lastLat, lastLng, lastSpeedKmh, lastLocationAt güncellenir.
   */
  async updateLocation(
    vehicleId: string,
    tenantId:  string,
    lat:       number,
    lng:       number,
    speedKmh?: number,
    _heading?: number,
  ): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const vehicleRepo = ds.getRepository(Vehicle);

    await vehicleRepo.update(
      { id: vehicleId, tenantId },
      {
        lastLat:        lat,
        lastLng:        lng,
        lastSpeedKmh:   speedKmh,
        lastLocationAt: new Date(),
      },
    );
  }

  /** Araç bakım geçmişi */
  async getMaintenanceRecords(vehicleId: string): Promise<MaintenanceRecord[]> {
    const { maintenanceRepo, tenantId } = await this.repos();
    await this.findOne(vehicleId); // erişim kontrolü
    return maintenanceRepo.find({
      where: { vehicleId, tenantId } as Record<string, unknown>,
      order: { serviceDate: 'DESC' } as Record<string, unknown>,
    });
  }

  /** Araç yakıt geçmişi */
  async getFuelRecords(vehicleId: string): Promise<FuelRecord[]> {
    const { fuelRepo, tenantId } = await this.repos();
    await this.findOne(vehicleId); // erişim kontrolü
    return fuelRepo.find({
      where: { vehicleId, tenantId } as Record<string, unknown>,
      order: { fuelingDate: 'DESC' } as Record<string, unknown>,
    });
  }

  /** Araç sefer geçmişi */
  async getTripRecords(vehicleId: string): Promise<Trip[]> {
    const { tripRepo, tenantId } = await this.repos();
    await this.findOne(vehicleId); // erişim kontrolü
    return tripRepo.find({
      where: { vehicleId, tenantId } as Record<string, unknown>,
      order: { plannedDeparture: 'DESC' } as Record<string, unknown>,
    });
  }
}

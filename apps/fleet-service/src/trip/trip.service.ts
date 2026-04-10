import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Trip } from './entities/trip.entity';
import type { TripStatus } from './entities/trip.entity';
import { Vehicle } from '../vehicle/entities/vehicle.entity';
import type { CreateTripDto } from './dto/create-trip.dto';

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /** Tenant DataSource + repository'leri döndür */
  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      tripRepo:    ds.getRepository(Trip),
      vehicleRepo: ds.getRepository(Vehicle),
      dataSource:  ds,
      tenantId,
    };
  }

  /** Yeni sefer oluştur */
  async create(dto: CreateTripDto, createdBy: string): Promise<Trip> {
    const { tripRepo, vehicleRepo, dataSource, tenantId } = await this.repos();

    // Araç kapasite kontrolü
    if (dto.cargoWeightKg !== undefined || dto.cargoVolumeM3 !== undefined) {
      const vehicle = await vehicleRepo.findOne({ where: { id: dto.vehicleId, tenantId } });
      if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${dto.vehicleId}`);

      if (
        dto.cargoWeightKg !== undefined &&
        vehicle.capacityKg !== undefined &&
        vehicle.capacityKg !== null &&
        dto.cargoWeightKg > Number(vehicle.capacityKg)
      ) {
        throw new BadRequestException(
          `Kargo ağırlığı (${dto.cargoWeightKg} kg) aracın kapasitesini (${vehicle.capacityKg} kg) aşıyor.`,
        );
      }

      if (
        dto.cargoVolumeM3 !== undefined &&
        vehicle.volumeM3 !== undefined &&
        vehicle.volumeM3 !== null &&
        dto.cargoVolumeM3 > Number(vehicle.volumeM3)
      ) {
        throw new BadRequestException(
          `Kargo hacmi (${dto.cargoVolumeM3} m³) aracın hacim kapasitesini (${vehicle.volumeM3} m³) aşıyor.`,
        );
      }
    }

    // get_next_trip_seq: V037 migration ile deploy edilen PostgreSQL fonksiyonu.
    // Sequence yoksa otomatik oluşturur (self-healing) — uygulama DDL çalıştırmaz.
    const year = new Date().getFullYear();
    const seqRows = await dataSource.query<[{ seq: string }]>(
      `SELECT get_next_trip_seq($1) AS seq`,
      [year],
    );
    const tripNumber = `SF-${year}-${seqRows[0].seq}`;

    const trip = tripRepo.create({
      tenantId,
      tripNumber,
      vehicleId:        dto.vehicleId,
      driverId:         dto.driverId,
      salesOrderId:     dto.salesOrderId,
      deliveryId:       dto.deliveryId,
      origin:           dto.origin,
      destination:      dto.destination,
      plannedDeparture: new Date(dto.plannedDeparture),
      plannedArrival:   dto.plannedArrival ? new Date(dto.plannedArrival) : undefined,
      notes:            dto.notes,
      cargoWeightKg:    dto.cargoWeightKg,
      cargoVolumeM3:    dto.cargoVolumeM3,
      status:           'PLANLANMIS',
      createdBy,
    });

    const saved = await tripRepo.save(trip);
    this.logger.log(`[${tenantId}] Sefer oluşturuldu: ${saved.tripNumber} (${saved.id})`);
    return saved;
  }

  /** Sefer listesi */
  async findAll(params?: {
    status?:    TripStatus;
    vehicleId?: string;
    driverId?:  string;
    page?:      number;
    limit?:     number;
  }): Promise<{ items: Trip[]; total: number; page: number; limit: number }> {
    const { tripRepo, tenantId } = await this.repos();

    const qb = tripRepo.createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .orderBy('t.planned_departure', 'DESC');

    if (params?.status)    qb.andWhere('t.status = :status',       { status: params.status });
    if (params?.vehicleId) qb.andWhere('t.vehicle_id = :vehicleId', { vehicleId: params.vehicleId });
    if (params?.driverId)  qb.andWhere('t.driver_id = :driverId',   { driverId: params.driverId });

    const page   = params?.page   ?? 1;
    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  /** Sefer detayı */
  async findOne(id: string): Promise<Trip> {
    const { tripRepo, tenantId } = await this.repos();
    const trip = await tripRepo.findOne({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException(`Sefer bulunamadı: ${id}`);
    return trip;
  }

  /**
   * Seferi başlat (PLANLANMIS → YOLDA)
   *
   * actualDeparture anlık zaman damgası ile set edilir.
   * startKm sürücünün kalkıştaki km okuma değeridir — opsiyoneldir.
   */
  async start(id: string, startKm?: number): Promise<Trip> {
    const { tripRepo } = await this.repos();
    const trip = await this.findOne(id);

    if (trip.status !== 'PLANLANMIS') {
      throw new ConflictException(`Sefer başlatılamaz: mevcut durum ${trip.status}`);
    }

    trip.status          = 'YOLDA';
    trip.actualDeparture = new Date();
    if (startKm !== undefined) trip.startKm = startKm;

    const saved = await tripRepo.save(trip);
    this.logger.log(`[${trip.tenantId}] Sefer başladı: ${trip.tripNumber}${startKm !== undefined ? ` (başlangıç km: ${startKm})` : ''}`);
    return saved;
  }

  /**
   * Seferi tamamla (YOLDA → TAMAMLANDI)
   *
   * actualArrival set edilir, distanceKm = endKm - startKm hesaplanır.
   * Araç km sayacı (currentKm) otomatik olarak endKm değerine güncellenir.
   */
  async complete(id: string, endKm: number): Promise<Trip> {
    const { tripRepo, vehicleRepo } = await this.repos();
    const trip = await this.findOne(id);

    if (trip.status !== 'YOLDA') {
      throw new ConflictException(`Sefer tamamlanamaz: mevcut durum ${trip.status}`);
    }

    trip.status        = 'TAMAMLANDI';
    trip.actualArrival = new Date();
    trip.endKm         = endKm;

    // Mesafeyi hesapla (başlangıç km biliniyorsa)
    if (trip.startKm !== undefined && trip.startKm !== null) {
      trip.distanceKm = endKm - trip.startKm;
    }

    const saved = await tripRepo.save(trip);

    // Araç km sayacını güncelle
    await vehicleRepo.update(
      { id: trip.vehicleId, tenantId: trip.tenantId },
      { currentKm: endKm },
    );

    this.logger.log(
      `[${trip.tenantId}] Sefer tamamlandı: ${trip.tripNumber} ` +
      `(${trip.distanceKm ?? '?'} km, araç currentKm → ${endKm})`,
    );
    return saved;
  }

  /** Seferi iptal et */
  async cancel(id: string): Promise<Trip> {
    const { tripRepo } = await this.repos();
    const trip = await this.findOne(id);

    if (trip.status === 'TAMAMLANDI' || trip.status === 'IPTAL') {
      throw new ConflictException(`Sefer iptal edilemez: mevcut durum ${trip.status}`);
    }

    trip.status = 'IPTAL';
    const saved = await tripRepo.save(trip);
    this.logger.log(`[${trip.tenantId}] Sefer iptal edildi: ${trip.tripNumber}`);
    return saved;
  }
}

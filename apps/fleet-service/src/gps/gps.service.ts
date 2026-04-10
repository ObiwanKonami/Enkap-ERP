import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantDataSourceManager } from '@enkap/database';
import { GpsLocation } from './entities/gps-location.entity';
import { Vehicle }     from '../vehicle/entities/vehicle.entity';
import { Trip }        from '../trip/entities/trip.entity';

/** Teltonika webhook payload yapısı */
export interface TeltonikaPayload {
  device_id: string;
  timestamp: number;  // Unix timestamp (saniye)
  lat:       number;
  lng:       number;
  speed?:    number;
  heading?:  number;
}

/** icomera webhook payload yapısı */
export interface IcomeraPayload {
  deviceId:  string;
  ts:        number;
  latitude:  number;
  longitude: number;
  speedKmh?: number;
  course?:   number;
}

/** Normalize edilmiş GPS verisi */
interface NormalizedGps {
  deviceId:  string;
  lat:       number;
  lng:       number;
  speedKmh?: number;
  heading?:  number;
  recordedAt: Date;
}

@Injectable()
export class GpsService {
  private readonly logger = new Logger(GpsService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Teltonika webhook payload'ını normalize et
   */
  normalizeTeltonika(body: TeltonikaPayload): NormalizedGps {
    return {
      deviceId:   body.device_id,
      lat:        body.lat,
      lng:        body.lng,
      speedKmh:   body.speed,
      heading:    body.heading,
      recordedAt: new Date(body.timestamp * 1000),
    };
  }

  /**
   * icomera webhook payload'ını normalize et
   */
  normalizeIcomera(body: IcomeraPayload): NormalizedGps {
    return {
      deviceId:   body.deviceId,
      lat:        body.latitude,
      lng:        body.longitude,
      speedKmh:   body.speedKmh,
      heading:    body.course,
      recordedAt: new Date(body.ts * 1000),
    };
  }

  /**
   * GPS konum kaydını işle
   *
   * 1. gpsDeviceId → vehicleId lookup (tenant bazlı)
   * 2. vehicle.lastLat/lastLng/lastSpeedKmh/lastLocationAt güncelle
   * 3. gps_locations tablosuna yeni kayıt ekle
   * 4. Aktif sefer varsa trip_id bağla
   *
   * @param tenantId GPS API key'den çözümlenen tenant
   */
  async processLocation(tenantId: string, payload: NormalizedGps): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const vehicleRepo  = ds.getRepository(Vehicle);
    const tripRepo     = ds.getRepository(Trip);
    const locationRepo = ds.getRepository(GpsLocation);

    // gpsDeviceId üzerinden araç bul
    const vehicle = await vehicleRepo.findOne({
      where: { gpsDeviceId: payload.deviceId, tenantId },
    });

    if (!vehicle) {
      this.logger.warn(`[${tenantId}] Tanımsız GPS cihazı: ${payload.deviceId}`);
      return;
    }

    // Araç son konum bilgisini güncelle
    await vehicleRepo.update(
      { id: vehicle.id },
      {
        lastLat:        payload.lat,
        lastLng:        payload.lng,
        lastSpeedKmh:   payload.speedKmh,
        lastLocationAt: payload.recordedAt,
      },
    );

    // Aktif sefer var mı?
    const activeTrip = await tripRepo.findOne({
      where: { vehicleId: vehicle.id, status: 'YOLDA', tenantId },
    });

    // GPS konum kaydı ekle
    const location = locationRepo.create({
      tenantId,
      vehicleId:  vehicle.id,
      tripId:     activeTrip?.id,
      lat:        payload.lat,
      lng:        payload.lng,
      speedKmh:   payload.speedKmh,
      heading:    payload.heading,
      recordedAt: payload.recordedAt,
    });

    await locationRepo.save(location);

    this.logger.debug(
      `[${tenantId}] GPS güncellendi: araç ${vehicle.plate} → (${payload.lat}, ${payload.lng})`,
    );
  }

  /**
   * Araç konum geçmişi
   *
   * @param vehicleId Araç ID'si
   * @param tenantId  Tenant ID'si
   * @param limit     Maksimum kayıt sayısı (varsayılan: 100)
   */
  async getLocations(vehicleId: string, tenantId: string, limit?: number): Promise<GpsLocation[]> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const vehicleRepo  = ds.getRepository(Vehicle);
    const locationRepo = ds.getRepository(GpsLocation);

    const vehicle = await vehicleRepo.findOne({ where: { id: vehicleId, tenantId } });
    if (!vehicle) throw new NotFoundException(`Araç bulunamadı: ${vehicleId}`);

    return locationRepo.find({
      where: { vehicleId, tenantId },
      order: { recordedAt: 'DESC' },
      take:  Math.min(limit ?? 100, 500),
    });
  }
}

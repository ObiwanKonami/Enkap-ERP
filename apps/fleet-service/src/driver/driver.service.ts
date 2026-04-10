import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Driver } from './entities/driver.entity';
import type { DriverStatus } from './entities/driver.entity';
import type { CreateDriverDto } from './dto/create-driver.dto';
import type { UpdateDriverDto } from './dto/update-driver.dto';

@Injectable()
export class DriverService {
  private readonly logger = new Logger(DriverService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /** Tenant DataSource + repository'leri döndür */
  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      driverRepo: ds.getRepository(Driver),
      tenantId,
    };
  }

  /** Yeni sürücü ekle */
  async create(dto: CreateDriverDto): Promise<Driver> {
    const { driverRepo, tenantId } = await this.repos();

    const driver = driverRepo.create({
      tenantId,
      employeeId:     dto.employeeId,
      firstName:      dto.firstName,
      lastName:       dto.lastName,
      phone:          dto.phone,
      licenseClass:   dto.licenseClass,
      licenseNumber:  dto.licenseNumber,
      licenseExpires: dto.licenseExpires,
      status:         'AKTIF',
    });

    const saved = await driverRepo.save(driver);
    this.logger.log(`[${tenantId}] Sürücü oluşturuldu: ${saved.firstName} ${saved.lastName} (${saved.id})`);
    return saved;
  }

  /** Sürücü listesi */
  async findAll(params?: {
    status?: DriverStatus;
    page?:   number;
    limit?:  number;
  }): Promise<{ items: Driver[]; total: number; page: number; limit: number }> {
    const { driverRepo, tenantId } = await this.repos();

    const qb = driverRepo.createQueryBuilder('d')
      .where('d.tenant_id = :tenantId', { tenantId })
      .orderBy('d.last_name', 'ASC')
      .addOrderBy('d.first_name', 'ASC');

    if (params?.status) qb.andWhere('d.status = :status', { status: params.status });

    const page   = params?.page   ?? 1;
    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  /** Sürücü detayı */
  async findOne(id: string): Promise<Driver> {
    const { driverRepo, tenantId } = await this.repos();
    const driver = await driverRepo.findOne({ where: { id, tenantId } });
    if (!driver) throw new NotFoundException(`Sürücü bulunamadı: ${id}`);
    return driver;
  }

  /** Sürücü güncelle */
  async update(id: string, dto: UpdateDriverDto): Promise<Driver> {
    const { driverRepo } = await this.repos();
    const driver = await this.findOne(id);

    if (dto.firstName      !== undefined) driver.firstName      = dto.firstName;
    if (dto.lastName       !== undefined) driver.lastName       = dto.lastName;
    if (dto.phone          !== undefined) driver.phone          = dto.phone;
    if (dto.licenseClass   !== undefined) driver.licenseClass   = dto.licenseClass;
    if (dto.licenseNumber  !== undefined) driver.licenseNumber  = dto.licenseNumber;
    if (dto.licenseExpires !== undefined) driver.licenseExpires = dto.licenseExpires;
    if (dto.status         !== undefined) driver.status         = dto.status;

    return driverRepo.save(driver);
  }

  /**
   * HR servisi senkronizasyonu — upsert
   *
   * Verilen tenantId + employeeId çifti için sürücü kaydı yoksa oluşturur,
   * varsa ad/soyad/telefon/ehliyet bilgilerini günceller.
   * Bu metot getTenantContext() kullanmaz — tenantId doğrudan alınır.
   */
  async upsertFromHr(
    tenantId:    string,
    employeeId:  string,
    firstName:   string,
    lastName:    string,
    licenseClass: string,
    opts?: { phone?: string; licenseNumber?: string; licenseExpires?: string },
  ): Promise<Driver> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const driverRepo = ds.getRepository(Driver);

    let driver = await driverRepo.findOne({ where: { tenantId, employeeId } });

    if (!driver) {
      // Yeni oluştur
      driver = driverRepo.create({
        tenantId,
        employeeId,
        firstName,
        lastName,
        licenseClass:   licenseClass as Driver['licenseClass'],
        phone:          opts?.phone,
        licenseNumber:  opts?.licenseNumber,
        licenseExpires: opts?.licenseExpires,
        status:         'AKTIF',
      });
      const saved = await driverRepo.save(driver);
      this.logger.log(`[${tenantId}] HR sync: Sürücü oluşturuldu (çalışan: ${employeeId})`);
      return saved;
    }

    // Mevcut kaydı güncelle
    driver.firstName      = firstName;
    driver.lastName       = lastName;
    driver.licenseClass   = licenseClass as Driver['licenseClass'];
    if (opts?.phone          !== undefined) driver.phone          = opts.phone;
    if (opts?.licenseNumber  !== undefined) driver.licenseNumber  = opts.licenseNumber;
    if (opts?.licenseExpires !== undefined) driver.licenseExpires = opts.licenseExpires;
    // Pasif durumdaysa (önceden işten çıkmış olabilir) yeniden aktifleştir
    if (driver.status === 'PASIF') driver.status = 'AKTIF';

    const saved = await driverRepo.save(driver);
    this.logger.log(`[${tenantId}] HR sync: Sürücü güncellendi (çalışan: ${employeeId})`);
    return saved;
  }

  /**
   * HR servisi senkronizasyonu — işten çıkış
   *
   * employeeId'ye sahip sürücüyü PASIF statüsüne alır.
   * Kayıt yoksa sessizce geçer (idempotent).
   */
  async deactivateByEmployeeId(tenantId: string, employeeId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const driverRepo = ds.getRepository(Driver);

    const driver = await driverRepo.findOne({ where: { tenantId, employeeId } });
    if (!driver) {
      this.logger.debug(`[${tenantId}] HR sync terminate: sürücü kaydı yok (çalışan: ${employeeId}), atlandı`);
      return;
    }

    driver.status          = 'PASIF';
    driver.currentVehicleId = undefined;  // Araç atamasını temizle
    await driverRepo.save(driver);
    this.logger.log(`[${tenantId}] HR sync: Sürücü pasife alındı (çalışan: ${employeeId})`);
  }

  /**
   * Sürücüye araç ata
   *
   * 1. Hedef sürücünün currentVehicleId'si güncellenir
   * 2. Aynı aracı kullanan önceki sürücünün ataması temizlenir
   */
  async assignVehicle(driverId: string, vehicleId: string): Promise<Driver> {
    const { driverRepo, tenantId } = await this.repos();
    const driver = await this.findOne(driverId);

    // Aynı aracı kullanan başka sürücü varsa atamasını temizle
    const previousDriver = await driverRepo.findOne({
      where: { currentVehicleId: vehicleId, tenantId },
    });

    if (previousDriver && previousDriver.id !== driverId) {
      previousDriver.currentVehicleId = undefined;
      await driverRepo.save(previousDriver);
      this.logger.log(`[${tenantId}] Araç ataması temizlendi: sürücü ${previousDriver.id} → araç ${vehicleId}`);
    }

    driver.currentVehicleId = vehicleId;
    const saved = await driverRepo.save(driver);
    this.logger.log(`[${tenantId}] Araç atandı: sürücü ${driverId} → araç ${vehicleId}`);
    return saved;
  }
}

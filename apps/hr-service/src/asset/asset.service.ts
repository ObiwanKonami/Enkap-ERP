import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { EmployeeAsset } from './employee-asset.entity';
import { CreateAssetDto } from './dto/create-asset.dto';

export interface FindAssetsParams {
  employeeId?: string;
  status?: string;
  assetCategory?: string;
  limit?: number;
  offset?: number;
}

/**
 * Zimmet (Demirbaş) Yönetimi Servisi.
 *
 * Çalışana verilen demirbaşların takibi: bilgisayar, telefon, araç anahtarı vb.
 * İşten çıkışta tüm zimmetlerin iade edilmesi kontrol edilir.
 */
@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  async create(dto: CreateAssetDto): Promise<EmployeeAsset> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(EmployeeAsset);

    const asset = repo.create({
      tenantId,
      employeeId:    dto.employeeId,
      assetName:     dto.assetName,
      assetCategory: dto.assetCategory ?? null,
      serialNumber:  dto.serialNumber ?? null,
      productId:     dto.productId ?? null,
      assignedAt:    new Date(dto.assignedAt),
      status:        'ASSIGNED',
      notes:         dto.notes ?? null,
    });

    const saved = await repo.save(asset);
    this.logger.log(
      `Zimmet verildi: employee=${dto.employeeId}, ` +
      `asset="${dto.assetName}", serial=${dto.serialNumber ?? '-'}`,
    );
    return saved;
  }

  async findAll(params: FindAssetsParams = {}): Promise<{ data: EmployeeAsset[]; total: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(EmployeeAsset);

    const where: Record<string, unknown> = { tenantId };
    if (params.employeeId)    where['employeeId']    = params.employeeId;
    if (params.status)        where['status']        = params.status;
    if (params.assetCategory) where['assetCategory'] = params.assetCategory;

    const [data, total] = await repo.findAndCount({
      where,
      order: { assignedAt: 'DESC' },
      take:  params.limit  ?? 50,
      skip:  params.offset ?? 0,
    });

    return { data, total };
  }

  async findOne(id: string): Promise<EmployeeAsset> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const asset = await ds.getRepository(EmployeeAsset).findOne({
      where: { id, tenantId },
    });
    if (!asset) {
      throw new NotFoundException(`Zimmet kaydı bulunamadı: ${id}`);
    }
    return asset;
  }

  /** Zimmet iade edildi — returnedAt ve status güncelle */
  async markReturned(id: string): Promise<EmployeeAsset> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(EmployeeAsset);

    const asset = await this.findOne(id);
    if (asset.status !== 'ASSIGNED') {
      throw new ConflictException(
        `Zimmet iade edilemez: durum '${asset.status}', beklenen 'ASSIGNED'.`,
      );
    }

    asset.status     = 'RETURNED';
    asset.returnedAt = new Date();
    const saved = await repo.save(asset);
    this.logger.log(`Zimmet iade edildi: id=${id}, asset="${asset.assetName}"`);
    return saved;
  }

  /** Zimmet kayıp/hasarlı olarak işaretle */
  async markLost(id: string, notes?: string): Promise<EmployeeAsset> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(EmployeeAsset);

    const asset = await this.findOne(id);
    if (asset.status !== 'ASSIGNED') {
      throw new ConflictException(
        `Zimmet kayıp işaretlenemez: durum '${asset.status}'.`,
      );
    }

    asset.status = 'LOST';
    if (notes) asset.notes = notes;
    const saved = await repo.save(asset);
    this.logger.log(`Zimmet kayıp: id=${id}, asset="${asset.assetName}"`);
    return saved;
  }

  /** Bir çalışanın iade edilmemiş zimmetlerini getirir — offboarding kontrolü için */
  async findUnreturnedByEmployee(employeeId: string): Promise<EmployeeAsset[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    return ds.getRepository(EmployeeAsset).find({
      where: { tenantId, employeeId, status: 'ASSIGNED' },
      order: { assignedAt: 'ASC' },
    });
  }
}

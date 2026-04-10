import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { FixedAsset }        from './entities/fixed-asset.entity';
import { AssetDepreciation } from './entities/asset-depreciation.entity';
import type { CreateAssetDto }  from './dto/create-asset.dto';
import type { DisposeAssetDto } from './dto/dispose-asset.dto';
import { getUsefulLifeYears, getDepreciationRate } from './vuk-useful-life';

@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  /**
   * Yeni duran varlık kaydı oluştur.
   * VUK tablosundan faydalı ömür ve oran otomatik atanır.
   */
  async create(dto: CreateAssetDto, createdBy: string): Promise<FixedAsset> {
    const { tenantId } = getTenantContext();
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(FixedAsset);

    const usefulLife = dto.usefulLifeYears ?? getUsefulLifeYears(dto.category);
    const method     = dto.depreciationMethod ?? 'NORMAL';
    const rate       = getDepreciationRate(dto.category, method);

    const asset = repo.create({
      tenantId,
      name:                         dto.name,
      assetCode:                    dto.assetCode,
      category:                     dto.category,
      depreciationMethod:           method,
      usefulLifeYears:              usefulLife,
      depreciationRate:             rate,
      acquisitionDate:              new Date(dto.acquisitionDate),
      acquisitionCostKurus:         dto.acquisitionCostKurus,
      accumulatedDepreciationKurus: 0,
      bookValueKurus:               dto.acquisitionCostKurus,
      salvageValueKurus:            dto.salvageValueKurus ?? 0,
      invoiceId:                    dto.invoiceId,
      location:                     dto.location,
      status:                       'AKTIF',
      createdBy,
    });

    return repo.save(asset);
  }

  /** Tenant'ın tüm duran varlıklarını listele */
  async findAll(params?: {
    status?: string; category?: string; page?: number; limit?: number;
  }): Promise<{ items: FixedAsset[]; total: number; page: number; limit: number }> {
    const { tenantId } = getTenantContext();
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(FixedAsset);

    const qb = repo.createQueryBuilder('a')
      .where('a.tenant_id = :tenantId', { tenantId })
      .orderBy('a.acquisition_date', 'DESC');

    if (params?.status)   qb.andWhere('a.status = :status',     { status: params.status });
    if (params?.category) qb.andWhere('a.category = :category', { category: params.category });

    const page   = params?.page ?? 1;
    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  /** Tek varlık detayı */
  async findOne(id: string): Promise<FixedAsset> {
    const { tenantId } = getTenantContext();
    const ds   = await this.dsManager.getDataSource(tenantId);
    const asset = await ds.getRepository(FixedAsset).findOne({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException(`Duran varlık bulunamadı: ${id}`);
    return asset;
  }

  /** Varlığın amortisman geçmişi */
  async getDepreciationHistory(assetId: string): Promise<AssetDepreciation[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    await this.findOne(assetId); // erişim kontrolü

    return ds.getRepository(AssetDepreciation).find({
      where: { assetId, tenantId },
      order: { year: 'DESC' },
    });
  }

  /**
   * Varlığı elden çıkar (satış, hurda, kayıp).
   */
  async dispose(id: string, dto: DisposeAssetDto): Promise<FixedAsset> {
    const { tenantId } = getTenantContext();
    const ds   = await this.dsManager.getDataSource(tenantId);
    const repo = ds.getRepository(FixedAsset);

    const asset = await repo.findOne({ where: { id, tenantId } });
    if (!asset) throw new NotFoundException(`Duran varlık bulunamadı: ${id}`);
    if (asset.status === 'ELDEN_CIKARILDI') {
      throw new ConflictException('Varlık zaten elden çıkarılmış.');
    }

    asset.status        = 'ELDEN_CIKARILDI';
    asset.disposalDate  = new Date(dto.disposalDate);
    asset.disposalNotes = dto.notes;

    await repo.save(asset);
    this.logger.log(`[${tenantId}] Duran varlık elden çıkarıldı: ${id} (${asset.name})`);
    return asset;
  }

  // ─── Yıl Sonu Amortisman Cron ─────────────────────────────────────────────

  /**
   * Yıl sonu amortisman hesaplama — her yıl 31 Aralık 23:30'da çalışır.
   * Tüm aktif tenant'ları TenantDataSourceManager üzerinden işler.
   *
   * Idempotency: (assetId, year) UNIQUE constraint → aynı yıl için tekrar kayıt oluşmaz.
   */
  @Cron('30 23 31 12 *', { name: 'yilsonu-amortisman' })
  async runYearEndDepreciation(): Promise<void> {
    // TODO: Sprint 6 — tüm aktif tenant ID'lerini TenantRoutingService'ten alıp
    // her tenant için runDepreciationForYear() çağrılacak.
    // Şu an cron yalnızca log yazar; manuel tetikleme runDepreciationForYear() ile yapılır.
    this.logger.log(
      `Yıl sonu amortisman cron tetiklendi (${new Date().getFullYear()}). ` +
      'Multi-tenant iterasyon Sprint 6\'da eklenecek.',
    );
  }

  /**
   * Tek varlık için amortisman hesapla ve kaydet (tenant datasource ile).
   */
  async depreciateSingleAsset(asset: FixedAsset, year: number): Promise<AssetDepreciation | null> {
    const ds = await this.dsManager.getDataSource(asset.tenantId);
    return this.depreciateSingleAssetWithDs(ds, asset, year);
  }

  private async depreciateSingleAssetWithDs(
    ds: Awaited<ReturnType<TenantDataSourceManager['getDataSource']>>,
    asset: FixedAsset,
    year: number,
  ): Promise<AssetDepreciation | null> {
    if (asset.bookValueKurus <= asset.salvageValueKurus) {
      if (asset.status !== 'TAMAMEN_AMORTIZE') {
        asset.status = 'TAMAMEN_AMORTIZE';
        await ds.getRepository(FixedAsset).save(asset);
      }
      return null;
    }

    const openingValue = asset.bookValueKurus;
    let depreciationAmount: number;

    if (asset.depreciationMethod === 'NORMAL') {
      depreciationAmount = Math.round(asset.acquisitionCostKurus * asset.depreciationRate);
    } else {
      depreciationAmount = Math.round(openingValue * asset.depreciationRate);
    }

    const maxDepreciation = openingValue - asset.salvageValueKurus;
    depreciationAmount = Math.min(depreciationAmount, maxDepreciation);

    if (depreciationAmount <= 0) return null;

    const closingValue = openingValue - depreciationAmount;

    return ds.transaction(async (em) => {
      const depr = em.create(AssetDepreciation, {
        tenantId:              asset.tenantId,
        assetId:               asset.id,
        year,
        depreciationKurus:     depreciationAmount,
        openingBookValueKurus: openingValue,
        closingBookValueKurus: closingValue,
        method:                asset.depreciationMethod,
      });
      const saved = await em.save(depr);

      asset.accumulatedDepreciationKurus += depreciationAmount;
      asset.bookValueKurus                = closingValue;
      if (closingValue <= asset.salvageValueKurus) asset.status = 'TAMAMEN_AMORTIZE';
      await em.save(FixedAsset, asset);

      this.logger.debug(
        `[${asset.tenantId}] Amortisman: ${asset.name} ${year} — ` +
        `${(depreciationAmount / 100).toFixed(2)} ₺ → defter: ${(closingValue / 100).toFixed(2)} ₺`,
      );

      return saved;
    });
  }

  /** Belirli bir yıl için manuel amortisman hesapla */
  async runDepreciationForYear(year: number, tenantId: string): Promise<{ processed: number; skipped: number }> {
    const ds     = await this.dsManager.getDataSource(tenantId);
    const assets = await ds.getRepository(FixedAsset).find({
      where: { tenantId, status: 'AKTIF' },
    });

    let processed = 0;
    let skipped   = 0;

    for (const asset of assets) {
      if (asset.category === 'ARSA_ARAZI') { skipped++; continue; }
      try {
        const result = await this.depreciateSingleAsset(asset, year);
        result ? processed++ : skipped++;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') { skipped++; continue; }
        throw err;
      }
    }

    return { processed, skipped };
  }

  /** Bir sonraki yıl için amortisman tahmini (UI gösterimi için, DB'ye kayıt yapmaz) */
  async previewNextYearDepreciation(tenantId: string): Promise<Array<{
    assetId: string; assetName: string; year: number; estimated: number;
  }>> {
    const nextYear = new Date().getFullYear() + 1;
    const ds       = await this.dsManager.getDataSource(tenantId);
    const assets   = await ds.getRepository(FixedAsset).find({
      where: { tenantId, status: 'AKTIF' },
    });

    return assets
      .filter(a => a.category !== 'ARSA_ARAZI' && a.bookValueKurus > a.salvageValueKurus)
      .map((a) => {
        let estimated: number;
        if (a.depreciationMethod === 'NORMAL') {
          estimated = Math.round(a.acquisitionCostKurus * a.depreciationRate);
        } else {
          estimated = Math.round(a.bookValueKurus * a.depreciationRate);
        }
        estimated = Math.min(estimated, a.bookValueKurus - a.salvageValueKurus);
        return { assetId: a.id, assetName: a.name, year: nextYear, estimated };
      });
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Bom } from './entities/bom.entity';
import { BomLine } from './entities/bom-line.entity';
import type { CreateBomDto } from './dto/create-bom.dto';
import type { UpdateBomDto } from './dto/update-bom.dto';

@Injectable()
export class BomService {
  private readonly logger = new Logger(BomService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async ds() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      ds,
      tenantId,
      bomRepo:  ds.getRepository(Bom),
      lineRepo: ds.getRepository(BomLine),
    };
  }

  /**
   * Yeni reçete oluştur.
   * isActive=true ise aynı ürünün diğer aktif reçeteleri pasife alınır.
   */
  async create(dto: CreateBomDto): Promise<Bom> {
    const { ds, tenantId } = await this.ds();

    if (!dto.lines?.length) {
      throw new BadRequestException('Reçetede en az bir kalem olmalıdır.');
    }

    return ds.transaction(async (em) => {
      // Aynı ürün için aktif reçete varsa ve yeni reçete de aktifse, eskiyi pasife al
      if (dto.isActive !== false) {
        await em.update(
          Bom,
          { tenantId, productId: dto.productId, isActive: true },
          { isActive: false },
        );
      }

      const lines = dto.lines.map((l) =>
        em.create(BomLine, {
          materialId:    l.materialId,
          materialName:  l.materialName,
          sku:           l.sku,
          quantity:      l.quantity,
          scrapRate:     l.scrapRate ?? 0,
          warehouseId:   l.warehouseId,
          unitOfMeasure: l.unitOfMeasure ?? 'ADET',
        }),
      );

      const bom = em.create(Bom, {
        tenantId,
        productId:   dto.productId,
        productName: dto.productName,
        revisionNo:  dto.revisionNo ?? '1.0',
        description: dto.description,
        isActive:    dto.isActive !== false,
        lines,
      });

      const saved = await em.save(Bom, bom);
      this.logger.log(
        `[${tenantId}] Reçete oluşturuldu: product=${dto.productId} rev=${saved.revisionNo}`,
      );
      return saved;
    });
  }

  /**
   * Reçete listesi.
   * productId filtresi ile belirli ürünün reçetelerini getir.
   */
  async findAll(params?: {
    productId?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: Bom[]; total: number; page: number; limit: number }> {
    const { tenantId, bomRepo } = await this.ds();

    const qb = bomRepo
      .createQueryBuilder('bom')
      .leftJoinAndSelect('bom.lines', 'line')
      .where('bom.tenant_id = :tenantId', { tenantId })
      .orderBy('bom.created_at', 'DESC');

    if (params?.productId) {
      qb.andWhere('bom.product_id = :productId', { productId: params.productId });
    }
    if (params?.isActive !== undefined) {
      qb.andWhere('bom.is_active = :isActive', { isActive: params.isActive });
    }

    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  /** Reçete detayı — tenant kontrolü dahil */
  async findOne(id: string): Promise<Bom> {
    const { tenantId, bomRepo } = await this.ds();
    const bom = await bomRepo.findOne({
      where: { id, tenantId },
      relations: ['lines'],
    });
    if (!bom) throw new NotFoundException(`Reçete bulunamadı: ${id}`);
    return bom;
  }

  /**
   * Reçete güncelle.
   * lines verilirse mevcut kalemler silinip yeniden oluşturulur.
   */
  async update(id: string, dto: UpdateBomDto): Promise<Bom> {
    const { ds, tenantId } = await this.ds();

    return ds.transaction(async (em) => {
      const bom = await em.findOne(Bom, { where: { id, tenantId }, relations: ['lines'] });
      if (!bom) throw new NotFoundException(`Reçete bulunamadı: ${id}`);

      if (dto.isActive === true && !bom.isActive) {
        await em.update(
          Bom,
          { tenantId, productId: bom.productId, isActive: true },
          { isActive: false },
        );
      }

      if (dto.productName !== undefined) bom.productName = dto.productName;
      if (dto.revisionNo  !== undefined) bom.revisionNo  = dto.revisionNo;
      if (dto.description !== undefined) bom.description = dto.description;
      if (dto.isActive    !== undefined) bom.isActive    = dto.isActive;

      if (dto.lines !== undefined) {
        if (!dto.lines.length) {
          throw new BadRequestException('Reçetede en az bir kalem olmalıdır.');
        }
        await em.delete(BomLine, { bomId: id });
        bom.lines = dto.lines.map((l) =>
          em.create(BomLine, {
            bomId:         id,
            materialId:    l.materialId,
            materialName:  l.materialName,
            sku:           l.sku,
            quantity:      l.quantity,
            scrapRate:     l.scrapRate ?? 0,
            warehouseId:   l.warehouseId,
            unitOfMeasure: l.unitOfMeasure ?? 'ADET',
          }),
        );
      }

      const saved = await em.save(Bom, bom);
      this.logger.log(`[${tenantId}] Reçete güncellendi: id=${id}`);
      return saved;
    });
  }

  /** Reçeteyi pasife al — fiziksel silme yok */
  async deactivate(id: string): Promise<void> {
    const { tenantId, bomRepo } = await this.ds();
    const bom = await bomRepo.findOne({ where: { id, tenantId } });
    if (!bom) throw new NotFoundException(`Reçete bulunamadı: ${id}`);
    bom.isActive = false;
    await bomRepo.save(bom);
    this.logger.log(`[${tenantId}] Reçete pasife alındı: id=${id}`);
  }
}

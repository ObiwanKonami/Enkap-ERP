import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import ExcelJS from 'exceljs';

export interface BulkImportResult {
  row:     number;
  success: boolean;
  sku?:    string;
  error?:  string;
}

/** Import sırasında kullanılan geçici iç veri yapısı */
interface BulkImportIntermediate extends BulkImportResult {
  __dto?: Parameters<ProductService['create']>[0];
}
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Product } from './entities/product.entity';
import { ProductCategory } from './entities/product-category.entity';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import { FifoCostEngine, type CostLayer } from '../shared/cost-engine';

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * FIFO ürünlerde avgUnitCostKurus = 0 olarak saklanır; kalan FIFO katmanlarının
   * ağırlıklı ortalaması hesaplanarak görüntüleme maliyeti olarak atanır.
   * Muhasebe kaydını değiştirmez — sadece API yanıtı için.
   */
  private applyFifoDisplayCost(products: Product[]): Product[] {
    for (const p of products) {
      if (p.costMethod === 'FIFO') {
        const layers = (p.fifoLayers ?? []) as CostLayer[];
        const totalQty = layers.reduce((s, l) => s + Number(l.quantity), 0);
        const totalVal = FifoCostEngine.totalValue(layers);
        p.avgUnitCostKurus = totalQty > 0 ? Math.round(totalVal / totalQty) : 0;
      }
    }
    return products;
  }

  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      productRepo:  ds.getRepository(Product),
      categoryRepo: ds.getRepository(ProductCategory),
      tenantId,
    };
  }

  /**
   * Ürün listesi.
   * Filtreler: isActive (varsayılan: true), arama (ad veya SKU).
   */
  async findAll(opts: {
    isActive?: boolean;
    search?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: Product[]; total: number; page: number; limit: number }> {
    const { productRepo, tenantId } = await this.repos();
    const {
      isActive = true,
      search,
      categoryId,
      page = 1,
      limit = 50,
    } = opts;

    // Arama veya kategori filtresi varsa QueryBuilder kullan
    if (search || categoryId) {
      const qb = productRepo
        .createQueryBuilder('p')
        .where('p.tenantId = :tenantId', { tenantId })
        .andWhere('p.isActive = :isActive', { isActive });

      if (categoryId) {
        qb.andWhere('p.categoryId = :categoryId', { categoryId });
      }
      if (search) {
        qb.andWhere(
          '(p.name ILIKE :search OR p.sku ILIKE :search OR p.barcode = :exact)',
          { search: `%${search}%`, exact: search },
        );
      }

      // relations ayrı yüklenir — leftJoinAndSelect + take() TypeORM pagination bug'ını önler
      const [ids, total] = await qb
        .select('p.id')
        .orderBy('p.name', 'ASC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      if (ids.length === 0) return { items: [], total, page, limit };

      const data = await productRepo.find({
        where: ids.map((p) => ({ id: p.id, tenantId })),
        relations: ['category'],
        order: { name: 'ASC' },
      });

      return { items: this.applyFifoDisplayCost(data), total, page, limit };
    }

    // Filtresiz liste — TypeORM find() ile güvenli sayfalama
    const [data, total] = await productRepo.findAndCount({
      where: { tenantId, isActive },
      relations: ['category'],
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items: this.applyFifoDisplayCost(data), total, page, limit };
  }

  async findById(id: string): Promise<Product> {
    const { productRepo, tenantId } = await this.repos();
    const product = await productRepo.findOne({
      where: { id, tenantId },
      relations: ['category'],
    });

    if (!product) throw new NotFoundException(`Ürün bulunamadı: ${id}`);
    this.applyFifoDisplayCost([product]);
    return product;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const { productRepo, tenantId } = await this.repos();
    return productRepo.findOne({ where: { sku, tenantId } });
  }

  async findByBarcode(barcode: string): Promise<Product | null> {
    const { productRepo, tenantId } = await this.repos();
    return productRepo.findOne({ where: { barcode, tenantId } });
  }

  async create(dto: CreateProductDto): Promise<Product> {
    const { productRepo, tenantId } = await this.repos();

    // SKU benzersizlik kontrolü
    const existing = await productRepo.findOne({
      where: { sku: dto.sku, tenantId },
    });
    if (existing) {
      throw new ConflictException(`SKU zaten kullanımda: ${dto.sku}`);
    }

    // Barkod benzersizlik kontrolü
    if (dto.barcode) {
      const withBarcode = await productRepo.findOne({
        where: { barcode: dto.barcode, tenantId },
      });
      if (withBarcode) {
        throw new ConflictException(`Barkod zaten kullanımda: ${dto.barcode}`);
      }
    }

    const costMethod = dto.costMethod ?? 'AVG';
    const initialCost = dto.avgUnitCostKurus ?? 0;

    // FIFO: başlangıç maliyeti varsa ilk katmanı oluştur (stok 0 olsa bile maliyet referansı)
    // AVG: dto'dan gelen değeri koru
    const fifoLayers: object[] =
      costMethod === 'FIFO' && initialCost > 0
        ? [{ receivedAt: new Date(), quantity: 0, unitCostKurus: initialCost }]
        : [];

    const product = productRepo.create({
      ...dto,
      tenantId,
      isStockTracked: dto.isStockTracked ?? true,
      costMethod,
      totalStockQty: 0,
      avgUnitCostKurus: costMethod === 'AVG' ? initialCost : 0,
      fifoLayers,
    });

    const saved = await productRepo.save(product);
    this.logger.log(`Ürün oluşturuldu: tenant=${tenantId} sku=${dto.sku}`);
    return saved;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findById(id);
    const { productRepo, tenantId } = await this.repos();

    // SKU değişiyorsa benzersizlik kontrolü
    if (dto.sku && dto.sku !== product.sku) {
      const skuConflict = await productRepo.findOne({
        where: { sku: dto.sku, tenantId },
      });
      if (skuConflict) {
        throw new ConflictException(`SKU zaten kullanımda: ${dto.sku}`);
      }
    }

    // FIFO ürünlerde avgUnitCostKurus manuel değiştirildiyse fifoLayers içindeki
    // her katmanın unitCostKurus değerini güncelle.
    // TypeORM JSONB sütununu save() ile bazen algılamaz; update() ile doğrudan yaz.
    if (dto.avgUnitCostKurus !== undefined && product.costMethod === 'FIFO') {
      const newCost = dto.avgUnitCostKurus;
      const layers = (product.fifoLayers ?? []) as CostLayer[];
      const updatedLayers: CostLayer[] = layers.length > 0
        ? layers.map((l) => ({ ...l, unitCostKurus: newCost }))
        : Number(product.totalStockQty) > 0
          ? [{ receivedAt: new Date(), quantity: Number(product.totalStockQty), unitCostKurus: newCost }]
          : [];

      const { avgUnitCostKurus: _skip, ...dtoWithoutCost } = dto;
      Object.assign(product, dtoWithoutCost);
      await productRepo.update(
        { id, tenantId },
        { ...dtoWithoutCost, avgUnitCostKurus: newCost, fifoLayers: updatedLayers },
      );
      return this.findById(id);
    }

    Object.assign(product, dto);
    return productRepo.save(product);
  }

  /** Pasife al (fiziksel silme yok — veri bütünlüğü) */
  async deactivate(id: string): Promise<void> {
    const product = await this.findById(id);
    const { productRepo } = await this.repos();
    product.isActive = false;
    await productRepo.save(product);
    this.logger.log(`Ürün pasife alındı: id=${id}`);
  }

  /**
   * Stok miktarı veya maliyet alanlarını günceller.
   * Sadece movement servisi çağırır — doğrudan kullanılmaz.
   */
  async updateStockFields(
    id: string,
    fields: {
      totalStockQty?: number;
      avgUnitCostKurus?: number;
      fifoLayers?: object[];
    },
  ): Promise<void> {
    const { productRepo } = await this.repos();
    await productRepo.update(id, fields as Partial<Product>);
  }

  // ─── Excel toplu import ──────────────────────────────────────────────────────

  /**
   * Excel dosyasından toplu ürün import eder.
   *
   * Beklenen sütun sırası (1. satır başlık):
   *   A: SKU | B: Ürün Adı | C: Birim (C62, KGM…) | D: KDV Oranı (0/1/10/20)
   *   E: Barkod (opsiyonel) | F: Liste Fiyatı ₺ (opsiyonel, kuruş)
   *
   * @param excelBase64 — Base64 kodlanmış .xlsx içeriği
   * @returns Her satır için başarı/hata sonucu
   */
  async importFromExcel(excelBase64: string): Promise<BulkImportResult[]> {
    const buffer = Buffer.from(excelBase64, 'base64');
    const wb      = new ExcelJS.Workbook();

    try {
      // ExcelJS type expects older non-generic Buffer; double assertion needed for TS 5.5+ compatibility
      await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    } catch {
      throw new BadRequestException('Excel dosyası okunamadı. .xlsx formatında olduğundan emin olun.');
    }

    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('Excel dosyasında sayfa bulunamadı.');

    const results: BulkImportIntermediate[] = [];

    // 1. satır başlık — 2. satırdan itibaren veri
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // başlık satırı

      const sku     = String(row.getCell(1).value ?? '').trim();
      const name    = String(row.getCell(2).value ?? '').trim();
      const unit    = String(row.getCell(3).value ?? 'C62').trim();
      const kdvRaw  = row.getCell(4).value;
      const barcode = row.getCell(5).value ? String(row.getCell(5).value).trim() : undefined;
      const priceRaw = row.getCell(6).value;

      results.push({ row: rowNum, success: false, sku: sku || undefined });

      if (!sku || !name) {
        results[results.length - 1]!.error = 'SKU ve Ürün Adı zorunludur.';
        return;
      }

      const kdvRate = Number(kdvRaw);
      if (![0, 1, 10, 20].includes(kdvRate)) {
        results[results.length - 1]!.error = `Geçersiz KDV oranı: ${kdvRaw}`;
        return;
      }

      // Async işlemleri results array'i doldurmak için dışarı al
      results[results.length - 1]!.__dto = {
        sku,
        name,
        unitCode: unit as Parameters<ProductService['create']>[0]['unitCode'],
        kdvRate,
        barcode: barcode || undefined,
        listPriceKurus: priceRaw ? Math.round(Number(priceRaw) * 100) : undefined,
      };
      results[results.length - 1]!.success = true; // geçici — aşağıda override edilir
    });

    // Async create işlemlerini sırayla çalıştır
    for (const result of results) {
      const dto = result.__dto;
      if (!dto) continue;

      delete result.__dto;

      try {
        await this.create(dto);
      } catch (err) {
        result.success = false;
        result.error   = err instanceof Error ? err.message : String(err);
      }
    }

    return results as BulkImportResult[];
  }

  // ─── Kategori yönetimi ───────────────────────────────────────────────────────

  async findCategories(): Promise<ProductCategory[]> {
    const { categoryRepo, tenantId } = await this.repos();
    return categoryRepo.find({
      where: { tenantId, isActive: true },
      relations: ['parent'],
      order: { code: 'ASC' },
    });
  }

  async createCategory(dto: {
    name: string;
    code: string;
    parentId?: string;
  }): Promise<ProductCategory> {
    const { categoryRepo, tenantId } = await this.repos();

    const existing = await categoryRepo.findOne({
      where: { code: dto.code, tenantId },
    });
    if (existing) {
      throw new ConflictException(`Kategori kodu zaten kullanımda: ${dto.code}`);
    }

    const category = categoryRepo.create({ ...dto, tenantId });
    return categoryRepo.save(category);
  }
}

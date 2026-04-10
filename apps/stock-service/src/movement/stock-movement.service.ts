import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { StockMovement } from './entities/stock-movement.entity';
import { ProductService } from '../product/product.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { FifoCostEngine, AvgCostEngine } from '../shared/cost-engine';
import type { CostLayer, AvgCostState } from '../shared/cost-engine';
import type { CreateMovementDto } from './dto/create-movement.dto';
import { WaybillEventsPublisher } from '../events/waybill-events.publisher';

/**
 * Stok Hareketi Servisi.
 *
 * Her hareket kaydı atomik bir transaction içinde yapılır:
 *  1. Hareket entity oluştur
 *  2. Maliyet motorunu çalıştır (FIFO veya AVG)
 *  3. Ürünün totalStockQty + maliyet alanlarını güncelle
 *
 * TRANSFER hareketi:
 *  - Kaynak depodan çıkış kaydı
 *  - Hedef depoya giriş kaydı
 *  - Maliyet değişmez (internal transfer)
 *
 * SAYIM hareketi:
 *  - Sistemdeki miktar ile sayım miktarı arasındaki fark uygulanır
 *  - Fark pozitif → GIRIS benzeri maliyet güncelleme
 *  - Fark negatif → CIKIS benzeri maliyet güncelleme
 */
@Injectable()
export class StockMovementService {
  private readonly logger = new Logger(StockMovementService.name);

  constructor(
    private readonly dsManager:        TenantDataSourceManager,
    private readonly productService:   ProductService,
    private readonly warehouseService: WarehouseService,
    private readonly waybillPublisher: WaybillEventsPublisher,
  ) {}

  async findAll(
    opts: { page?: number; limit?: number } = {},
  ): Promise<{ data: StockMovement[]; total: number }> {
    const { tenantId } = getTenantContext();
    const { page = 1, limit = 100 } = opts;
    const ds = await this.dsManager.getDataSource(tenantId);

    const [data, total] = await ds.getRepository(StockMovement).findAndCount({
      where:   { tenantId },
      order:   { createdAt: 'DESC' },
      skip:    (page - 1) * limit,
      take:    limit,
      relations: ['product', 'warehouse', 'targetWarehouse'],
    });

    return { data, total };
  }

  async findByProduct(
    productId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<{ data: StockMovement[]; total: number }> {
    const { tenantId } = getTenantContext();
    const { page = 1, limit = 50 } = opts;
    const ds = await this.dsManager.getDataSource(tenantId);
    const movementRepo = ds.getRepository(StockMovement);

    const [data, total] = await movementRepo.findAndCount({
      where: { productId, tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['warehouse', 'targetWarehouse'],
    });

    return { data, total };
  }

  async findByWarehouse(
    warehouseId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<{ data: StockMovement[]; total: number }> {
    const { tenantId } = getTenantContext();
    const { page = 1, limit = 50 } = opts;
    const ds = await this.dsManager.getDataSource(tenantId);
    const movementRepo = ds.getRepository(StockMovement);

    const [data, total] = await movementRepo.findAndCount({
      where: { warehouseId, tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['product', 'targetWarehouse'],
    });

    return { data, total };
  }

  /**
   * Yeni stok hareketi oluşturur.
   * Maliyet güncelleme dahil tüm işlemler tek transaction'da yapılır.
   */
  async create(dto: CreateMovementDto): Promise<StockMovement> {
    const { tenantId, userId } = getTenantContext();

    // Ürün ve depo doğrulama
    const product = await this.productService.findById(dto.productId);
    await this.warehouseService.findById(dto.warehouseId);

    if (!product.isStockTracked && dto.type !== 'SAYIM') {
      throw new BadRequestException(
        `Bu ürün için stok takibi kapalı: ${product.sku}`,
      );
    }

    if (dto.type === 'TRANSFER') {
      if (!dto.targetWarehouseId) {
        throw new BadRequestException('TRANSFER için hedef depo (targetWarehouseId) zorunludur');
      }
      if (dto.targetWarehouseId === dto.warehouseId) {
        throw new BadRequestException('Kaynak ve hedef depo aynı olamaz');
      }
      await this.warehouseService.findById(dto.targetWarehouseId);
    }

    // Tenant DataSource üzerinden transaction başlat
    const ds = await this.dsManager.getDataSource(tenantId);

    return ds.transaction(async (manager) => {
      // Ürünü yeniden al (transaction içinde kilitli okuma için)
      const freshProduct = await manager.findOne(
        (await import('../product/entities/product.entity')).Product,
        { where: { id: dto.productId, tenantId }, lock: { mode: 'pessimistic_write' } },
      );
      if (!freshProduct) throw new NotFoundException('Ürün bulunamadı');

      let unitCostKurus = dto.unitCostKurus ?? 0;
      let totalCostKurus = 0;
      // NUMERIC ve BIGINT kolonlar TypeORM raw sorgusunda string döner — Number() ile güvenli dönüşüm
      let newTotalQty = Number(freshProduct.totalStockQty);
      let updatedAvgCostKurus = Number(freshProduct.avgUnitCostKurus);
      let updatedFifoLayers = freshProduct.fifoLayers as CostLayer[];

      // ─── Maliyet motoru ───────────────────────────────────────────────────────

      if (dto.type === 'GIRIS' || dto.type === 'IADE_CIKIS') {
        // Stoka giriş: maliyet artışı
        newTotalQty += dto.quantity;

        if (freshProduct.costMethod === 'FIFO') {
          updatedFifoLayers = FifoCostEngine.addLayer(updatedFifoLayers, {
            receivedAt: new Date(),
            quantity: dto.quantity,
            unitCostKurus,
          });
        } else {
          // AVG
          const avgState: AvgCostState = {
            totalQuantity:    Number(freshProduct.totalStockQty),
            totalValueKurus:  Number(freshProduct.totalStockQty) * Number(freshProduct.avgUnitCostKurus),
            avgUnitCostKurus: Number(freshProduct.avgUnitCostKurus),
          };
          const updated = AvgCostEngine.onReceipt(avgState, dto.quantity, unitCostKurus);
          updatedAvgCostKurus = updated.avgUnitCostKurus;
        }

        totalCostKurus = dto.quantity * unitCostKurus;

      } else if (dto.type === 'CIKIS' || dto.type === 'IADE_GIRIS' || dto.type === 'FIRE') {
        // Stoktan çıkış: önce depo bazında kontrol, sonra toplam kontrol
        await this.assertWarehouseStock(manager, tenantId, dto.productId, dto.warehouseId, dto.quantity, product.sku);
        this.assertSufficientStock(Number(freshProduct.totalStockQty), dto.quantity, product.sku);

        newTotalQty -= dto.quantity;

        if (freshProduct.costMethod === 'FIFO') {
          const result = FifoCostEngine.consume(updatedFifoLayers, dto.quantity);
          updatedFifoLayers = result.remainingLayers;
          totalCostKurus = result.totalCostKurus;
          unitCostKurus = dto.quantity > 0 ? Math.round(totalCostKurus / dto.quantity) : 0;
        } else {
          // AVG
          const avgState: AvgCostState = {
            totalQuantity:    Number(freshProduct.totalStockQty),
            totalValueKurus:  Number(freshProduct.totalStockQty) * Number(freshProduct.avgUnitCostKurus),
            avgUnitCostKurus: Number(freshProduct.avgUnitCostKurus),
          };
          const { updatedState, issuedCostKurus } = AvgCostEngine.onIssue(avgState, dto.quantity);
          updatedAvgCostKurus = updatedState.avgUnitCostKurus;
          totalCostKurus = issuedCostKurus;
          unitCostKurus = freshProduct.avgUnitCostKurus;
        }

      } else if (dto.type === 'TRANSFER') {
        // Transfer: kaynak depoda yeterli stok kontrolü
        await this.assertWarehouseStock(manager, tenantId, dto.productId, dto.warehouseId, dto.quantity, product.sku);
        this.assertSufficientStock(Number(freshProduct.totalStockQty), dto.quantity, product.sku);

        if (freshProduct.costMethod === 'FIFO') {
          const result = FifoCostEngine.consume(updatedFifoLayers, dto.quantity);
          // Kaynak depodan çıkarılan katmanlar hedef depoya eklenir
          // (Bu implementasyonda depolar arası ayrı katman takibi yapılmıyor;
          //  ürün bazında toplam stok yönetiliyor — V2'de depo bazında stok tablosu eklenebilir)
          updatedFifoLayers = FifoCostEngine.addLayer(result.remainingLayers, {
            receivedAt: new Date(),
            quantity: dto.quantity,
            unitCostKurus: result.totalCostKurus > 0
              ? Math.round(result.totalCostKurus / dto.quantity)
              : freshProduct.avgUnitCostKurus,
          });
          totalCostKurus = result.totalCostKurus;
        } else {
          totalCostKurus = dto.quantity * freshProduct.avgUnitCostKurus;
          unitCostKurus = freshProduct.avgUnitCostKurus;
          // AVG için toplam stok ve maliyet değişmez (internal transfer)
        }
        // Toplam stok değişmez — sadece depo bazında kayıt değişir
        // (Şu an depo bazında ayrı tablo yok — bu sayım hareketi gibi nötr)

      } else if (dto.type === 'SAYIM') {
        // Fiziksel sayım düzeltmesi
        const diff = dto.quantity - Number(freshProduct.totalStockQty);
        newTotalQty = dto.quantity;

        if (diff > 0 && freshProduct.costMethod === 'FIFO') {
          // Sayım fazlası — giriş maliyet katmanı ekle
          updatedFifoLayers = FifoCostEngine.addLayer(updatedFifoLayers, {
            receivedAt: new Date(),
            quantity: diff,
            unitCostKurus: freshProduct.avgUnitCostKurus,
          });
        } else if (diff < 0 && freshProduct.costMethod === 'FIFO') {
          // Sayım eksiği — FIFO tüket
          const result = FifoCostEngine.consume(updatedFifoLayers, Math.abs(diff));
          updatedFifoLayers = result.remainingLayers;
        }
        // AVG için sayım farkı ortalamayı değiştirmez
        totalCostKurus = Math.abs(dto.quantity - Number(freshProduct.totalStockQty)) * Number(freshProduct.avgUnitCostKurus);
      }

      // ─── FIFO ürünler için görüntüleme maliyetini güncelle ────────────────────
      // avgUnitCostKurus FIFO'da muhasebe kaydında kullanılmaz; kalan katmanların
      // ağırlıklı ortalaması olarak saklanır — stok değeri ve liste görünümü için.
      if (freshProduct.costMethod === 'FIFO') {
        const fifoTotalQty = updatedFifoLayers.reduce((s, l: CostLayer) => s + Number(l.quantity), 0);
        const fifoTotalVal = FifoCostEngine.totalValue(updatedFifoLayers);
        updatedAvgCostKurus = fifoTotalQty > 0 ? Math.round(fifoTotalVal / fifoTotalQty) : 0;
      }

      // ─── Hareketi kaydet ──────────────────────────────────────────────────────
      const movement = manager.create(StockMovement, {
        tenantId,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        targetWarehouseId: dto.targetWarehouseId ?? null,
        type: dto.type,
        quantity: dto.quantity,
        unitCostKurus,
        totalCostKurus,
        runningBalance: newTotalQty,
        referenceType: dto.referenceType ?? null,
        referenceId: dto.referenceId ?? null,
        lotNumber: dto.lotNumber ?? null,
        serialNumber: dto.serialNumber ?? null,
        notes: dto.notes ?? null,
        createdBy: userId,
      });

      const savedMovement = await manager.save(movement);

      // ─── Ürün stok alanlarını güncelle ────────────────────────────────────────
      await manager.update(
        (await import('../product/entities/product.entity')).Product,
        { id: dto.productId, tenantId },
        {
          totalStockQty: newTotalQty,
          avgUnitCostKurus: updatedAvgCostKurus,
          fifoLayers: updatedFifoLayers,
        },
      );

      this.logger.log(
        `Stok hareketi: tenant=${tenantId} tip=${dto.type} ` +
        `ürün=${product.sku} miktar=${dto.quantity} bakiye=${newTotalQty}`,
      );

      // TRANSFER → waybill-service'e event gönder (fire-and-forget)
      if (dto.type === 'TRANSFER' && dto.targetWarehouseId) {
        this.waybillPublisher.publishTransferCreated({
          tenantId,
          movementId:      savedMovement.id,
          shipDate:        new Date().toISOString().slice(0, 10),
          fromWarehouseId: dto.warehouseId,
          toWarehouseId:   dto.targetWarehouseId,
          items: [{
            productId:   dto.productId,
            productName: product.name,
            sku:         product.sku,
            unitCode:    product.unitCode ?? 'ADET',
            quantity:    dto.quantity,
          }],
        });
      }

      return savedMovement;
    });
  }

  /** Stok yetersizliğini kontrol eder (toplam bakiye) */
  private assertSufficientStock(current: number, requested: number, sku: string): void {
    if (requested > current) {
      throw new BadRequestException(
        `Yetersiz stok: ürün=${sku} mevcut=${current} talep=${requested}`,
      );
    }
  }

  /**
   * Belirli bir depodaki ürün bakiyesini hareketlerden hesaplar.
   *
   * GIRIS / IADE_CIKIS          → +miktar
   * CIKIS / IADE_GIRIS / FIRE   → -miktar
   * TRANSFER (kaynak depo)      → -miktar
   * TRANSFER (hedef depo)       → +miktar
   */
  private async getWarehouseStock(
    manager: import('typeorm').EntityManager,
    tenantId: string,
    productId: string,
    warehouseId: string,
  ): Promise<number> {
    const rows = await manager.query<[{ balance: string }]>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN type IN ('GIRIS','IADE_CIKIS') AND warehouse_id = $3 THEN quantity
           WHEN type IN ('CIKIS','IADE_GIRIS','FIRE') AND warehouse_id = $3 THEN -quantity
           WHEN type = 'TRANSFER' AND warehouse_id = $3 THEN -quantity
           WHEN type = 'TRANSFER' AND target_warehouse_id = $3 THEN quantity
           ELSE 0
         END
       ), 0) AS balance
       FROM stock_movements
       WHERE product_id = $1
         AND tenant_id = $2
         AND (warehouse_id = $3 OR target_warehouse_id = $3)`,
      [productId, tenantId, warehouseId],
    );
    return Number(rows[0]?.balance ?? 0);
  }

  /**
   * Depo bazlı stok yeterliliğini doğrular.
   * CIKIS / FIRE / TRANSFER (kaynak) için çağrılır.
   */
  private async assertWarehouseStock(
    manager: import('typeorm').EntityManager,
    tenantId: string,
    productId: string,
    warehouseId: string,
    requested: number,
    sku: string,
  ): Promise<void> {
    const warehouseQty = await this.getWarehouseStock(manager, tenantId, productId, warehouseId);
    if (requested > warehouseQty) {
      throw new BadRequestException(
        `Bu depoda yetersiz stok: ürün=${sku} depo=${warehouseId} ` +
        `mevcut=${warehouseQty} talep=${requested}`,
      );
    }
  }
}

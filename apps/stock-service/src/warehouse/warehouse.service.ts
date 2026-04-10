import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async repo() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return { repo: ds.getRepository(Warehouse), tenantId };
  }

  async findAll(): Promise<Warehouse[]> {
    const { repo, tenantId } = await this.repo();
    return repo.find({
      where: { tenantId, isActive: true },
      order: { code: 'ASC' },
    });
  }

  async findById(id: string): Promise<Warehouse> {
    const { repo, tenantId } = await this.repo();
    const warehouse = await repo.findOne({ where: { id, tenantId } });
    if (!warehouse) throw new NotFoundException(`Depo bulunamadı: ${id}`);
    return warehouse;
  }

  async findByCode(code: string): Promise<Warehouse | null> {
    const { repo, tenantId } = await this.repo();
    return repo.findOne({ where: { code, tenantId } });
  }

  async create(dto: {
    code: string;
    name: string;
    address?: string;
    city?: string;
    isVirtual?: boolean;
  }): Promise<Warehouse> {
    const { repo, tenantId } = await this.repo();

    const existing = await repo.findOne({ where: { code: dto.code, tenantId } });
    if (existing) throw new ConflictException(`Depo kodu zaten kullanımda: ${dto.code}`);

    const warehouse = repo.create({ ...dto, tenantId });
    const saved = await repo.save(warehouse);
    this.logger.log(`Depo oluşturuldu: tenant=${tenantId} code=${dto.code}`);
    return saved;
  }

  async update(
    id: string,
    dto: Partial<{ name: string; address: string; city: string; isActive: boolean }>,
  ): Promise<Warehouse> {
    const warehouse = await this.findById(id);
    const { repo } = await this.repo();
    Object.assign(warehouse, dto);
    return repo.save(warehouse);
  }

  /**
   * Depodaki ürün stok dağılımı — hareketlerden hesaplanır.
   * TRANSFER giriş/çıkışı, SAYIM hariç tüm hareket tipleri dahil edilir.
   */
  async findProductsByWarehouse(warehouseId: string): Promise<Array<{
    productId: string;
    productName: string;
    sku: string;
    unitCode: string;
    reorderPoint: number;
    avgUnitCostKurus: number;
    quantity: number;
  }>> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const rows = await ds.query<Array<{
      productId: string;
      productName: string;
      sku: string;
      unitCode: string;
      reorderPoint: string;
      avgUnitCostKurus: string;
      quantity: string;
    }>>(
      `SELECT
         p.id                      AS "productId",
         p.name                    AS "productName",
         p.sku,
         p.unit_code               AS "unitCode",
         p.reorder_point           AS "reorderPoint",
         -- GIRIS hareketlerinden ağırlıklı ortalama birim maliyet (AVG ve FIFO için doğru)
         CASE
           WHEN SUM(CASE WHEN m.type IN ('GIRIS','IADE_CIKIS') AND m.warehouse_id = $2 THEN m.quantity ELSE 0 END) > 0
           THEN ROUND(
             SUM(CASE WHEN m.type IN ('GIRIS','IADE_CIKIS') AND m.warehouse_id = $2 THEN m.quantity * m.unit_cost_kurus ELSE 0 END) /
             SUM(CASE WHEN m.type IN ('GIRIS','IADE_CIKIS') AND m.warehouse_id = $2 THEN m.quantity ELSE 0 END)
           )
           ELSE 0
         END                       AS "avgUnitCostKurus",
         COALESCE(
           SUM(CASE
             WHEN m.type IN ('GIRIS','IADE_CIKIS') AND m.warehouse_id = $2 THEN m.quantity
             WHEN m.type = 'TRANSFER' AND m.target_warehouse_id = $2     THEN m.quantity
             ELSE 0
           END) -
           SUM(CASE
             WHEN m.type IN ('CIKIS','IADE_GIRIS','FIRE') AND m.warehouse_id = $2 THEN m.quantity
             WHEN m.type = 'TRANSFER'                    AND m.warehouse_id = $2 THEN m.quantity
             ELSE 0
           END)
         , 0) AS quantity
       FROM products p
       JOIN stock_movements m ON m.product_id = p.id AND m.tenant_id = $1
       WHERE p.tenant_id = $1
         AND (m.warehouse_id = $2 OR m.target_warehouse_id = $2)
         AND m.type != 'SAYIM'
       GROUP BY p.id, p.name, p.sku, p.unit_code, p.reorder_point, p.avg_unit_cost_kurus
       HAVING COALESCE(
           SUM(CASE
             WHEN m.type IN ('GIRIS','IADE_CIKIS') AND m.warehouse_id = $2 THEN m.quantity
             WHEN m.type = 'TRANSFER' AND m.target_warehouse_id = $2     THEN m.quantity
             ELSE 0
           END) -
           SUM(CASE
             WHEN m.type IN ('CIKIS','IADE_GIRIS','FIRE') AND m.warehouse_id = $2 THEN m.quantity
             WHEN m.type = 'TRANSFER'                    AND m.warehouse_id = $2 THEN m.quantity
             ELSE 0
           END)
         , 0) > 0
       ORDER BY p.name`,
      [tenantId, warehouseId],
    );

    return rows.map(r => ({
      productId:        r.productId,
      productName:      r.productName,
      sku:              r.sku,
      unitCode:         r.unitCode,
      reorderPoint:     Number(r.reorderPoint),
      avgUnitCostKurus: Number(r.avgUnitCostKurus),
      quantity:         Number(r.quantity),
    }));
  }

  async deactivate(id: string): Promise<void> {
    const warehouse = await this.findById(id);
    const { repo } = await this.repo();
    warehouse.isActive = false;
    await repo.save(warehouse);
    this.logger.log(`Depo pasife alındı: id=${id}`);
  }
}

import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard, RolesGuard, Roles, getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Role } from '@enkap/shared-types';
import {
  StockReportTemplate,
  ExcelBuilderService,
  type StockReportData,
  type StockProductRow,
} from '@enkap/reporting';

/**
 * Stok Raporlama API'si.
 *
 * GET /reports/stok/pdf         — Stok Durum Raporu PDF
 * GET /reports/stok/excel       — Stok Durum Raporu Excel
 */
@ApiTags('reports')
@ApiBearerAuth('JWT')
@Controller('reports')
@UseGuards(TenantGuard, RolesGuard)
@Roles(Role.DEPO_SORUMLUSU, Role.MUHASEBECI, Role.SALT_OKUNUR)
export class StockReportingController {
  constructor(
    private readonly stockTemplate: StockReportTemplate,
    private readonly excel: ExcelBuilderService,
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  /** GET /reports/stok/pdf?warehouseId=xxx */
  @ApiOperation({ summary: 'Stok Durum Raporunu PDF olarak indir' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String, format: 'uuid', description: 'Depo UUID filtresi (belirtilmezse tüm depolar)' })
  @ApiResponse({ status: 200, description: 'Stok raporu PDF olarak döndürüldü', content: { 'application/pdf': {} } })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('stok/pdf')
  async stokPdf(
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const data   = await this.buildStokReport(warehouseId);
    const buffer = await this.stockTemplate.setData(data).toBuffer();

    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', 'attachment; filename="stok-raporu.pdf"')
      .send(buffer);
  }

  /** GET /reports/stok/excel?warehouseId=xxx */
  @ApiOperation({ summary: 'Stok Durum Raporunu Excel olarak indir' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String, format: 'uuid', description: 'Depo UUID filtresi (belirtilmezse tüm depolar)' })
  @ApiResponse({ status: 200, description: 'Stok raporu Excel (.xlsx) olarak döndürüldü', content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {} } })
  @ApiResponse({ status: 401, description: 'Yetkisiz' })
  @Get('stok/excel')
  async stokExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const data   = await this.buildStokReport(warehouseId);
    const buffer = await this.excel.buildStokExcel(data);

    void reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="stok-raporu.xlsx"')
      .send(buffer);
  }

  // ─── Veri Hazırlama ──────────────────────────────────────────────────────

  private async buildStokReport(warehouseId?: string): Promise<StockReportData> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    /**
     * Ürünleri stok ve maliyet bilgisiyle birlikte çek.
     * WatermelonDB offline sync için kullanılan verinin aynısı — denormalize.
     *
     * Depo filtresi: warehouseId verilmişse o depodaki stok hareketi toplamı,
     * aksi halde tüm depolar birleştirilir.
     */
    const rows = await ds.query<Array<{
      sku: string;
      name: string;
      category: string | null;
      unit: string;
      avg_cost: string;
      total_qty: string;
      min_stock_qty: string;
      total_value: string;
    }>>(
      `SELECT
         p.sku,
         p.name,
         pc.name AS category,
         p.unit,
         p.unit_cost AS avg_cost,
         p.unit_cost * COALESCE(SUM(sm.quantity), 0) AS total_value,
         COALESCE(SUM(sm.quantity), 0) AS total_qty,
         p.min_stock_qty
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       LEFT JOIN stock_movements sm
         ON sm.product_id = p.id
         AND sm.tenant_id = p.tenant_id
         ${warehouseId ? 'AND sm.warehouse_id = $2' : ''}
       WHERE p.tenant_id = $1
         AND p.is_active = true
       GROUP BY p.id, pc.name
       ORDER BY total_value DESC`,
      warehouseId ? [tenantId, warehouseId] : [tenantId],
    );

    const products: StockProductRow[] = rows.map((r) => {
      const qty      = Number(r.total_qty);
      const avgCost  = Math.round(Number(r.avg_cost) * 100);
      const minQty   = Number(r.min_stock_qty);

      return {
        sku:             r.sku,
        name:            r.name,
        category:        r.category ?? undefined,
        quantity:        qty,
        unit:            r.unit,
        avgCostKurus:    avgCost,
        totalValueKurus: Math.round(Number(r.total_value) * 100),
        minStockQty:     minQty,
        isCritical:      qty <= minQty && minQty > 0,
      };
    });

    const totalValueKurus = products.reduce((s, p) => s + p.totalValueKurus, 0);
    const criticalCount   = products.filter((p) => p.isCritical).length;

    // Depo adını çek (varsa)
    let warehouseName: string | undefined;
    if (warehouseId) {
      const w = await ds.query<[{ name: string }?]>(
        'SELECT name FROM warehouses WHERE id = $1 AND tenant_id = $2',
        [warehouseId, tenantId],
      );
      warehouseName = w[0]?.name;
    }

    return {
      companyName:     'Enkap Kullanıcısı',  // TODO: Tenant profil servisi
      tenantId,
      reportDate:      new Date(),
      warehouseName,
      products,
      totalValueKurus,
      criticalCount,
      generatedAt:     new Date(),
    };
  }
}

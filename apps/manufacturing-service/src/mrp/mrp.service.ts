import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Bom } from '../bom/entities/bom.entity';

export interface MaterialRequirement {
  materialId:       string;
  materialName:     string;
  sku?:             string;
  requiredQuantity: number; /** Fire oranı dahil net ihtiyaç */
  warehouseId?:     string;
  unitOfMeasure:    string;
}

@Injectable()
export class MrpService {
  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Talep planı: bir üretim miktarı için hammadde ihtiyaçlarını hesapla.
   * İhtiyaç = hedef_miktar × kalem_miktarı × (1 + fire_oranı / 100)
   */
  async calculateRequirements(
    bomId: string,
    quantity: number,
  ): Promise<MaterialRequirement[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    const bomRepo = ds.getRepository(Bom);

    const bom = await bomRepo.findOne({
      where: { id: bomId, tenantId },
      relations: ['lines'],
    });
    if (!bom) throw new NotFoundException(`Reçete bulunamadı: ${bomId}`);

    return bom.lines.map(line => ({
      materialId:       line.materialId,
      materialName:     line.materialName,
      sku:              line.sku,
      requiredQuantity:
        quantity *
        Number(line.quantity) *
        (1 + Number(line.scrapRate) / 100),
      warehouseId:   line.warehouseId,
      unitOfMeasure: line.unitOfMeasure,
    }));
  }
}

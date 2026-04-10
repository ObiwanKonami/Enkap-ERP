import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { WaybillTemplate, type WaybillReportData } from '@enkap/reporting';
import type { Waybill } from './entities/waybill.entity';

interface TenantProfile {
  company_name?: string;
  vkn?:          string;
  address?:      string;
  district?:     string;
  city?:         string;
}

/**
 * İrsaliye PDF üretici.
 * @enkap/reporting WaybillTemplate kullanır.
 * Tenant profili control plane'den çekilerek gönderici bilgisi doldurulur.
 */
@Injectable()
export class WaybillPdfService {
  private readonly logger = new Logger(WaybillPdfService.name);

  constructor(
    private readonly template:   WaybillTemplate,
    private readonly dsManager:  TenantDataSourceManager,
    @InjectDataSource('control_plane')
    private readonly controlPlane: DataSource,
  ) {}

  async generate(waybill: Waybill): Promise<Buffer> {
    // Tenant profili → gönderici bilgisi
    const rows = await this.controlPlane.query<TenantProfile[]>(
      `SELECT company_name, vkn, address, district, city
       FROM tenant_profiles WHERE tenant_id = $1 LIMIT 1`,
      [waybill.tenantId],
    ).catch(() => [] as TenantProfile[]);

    const profile = rows[0];

    const senderAddress = [profile?.address, profile?.district, profile?.city]
      .filter(Boolean).join(', ') || waybill.senderAddress;

    // Depo UUID → isim haritası: satırlardaki tüm benzersiz depo ID'leri topla
    const warehouseIds = [
      ...new Set(
        waybill.lines.flatMap(l =>
          [l.warehouseId, l.targetWarehouseId].filter((id): id is string => !!id),
        ),
      ),
    ];

    const warehouseNames: Record<string, string> = {};
    if (warehouseIds.length > 0) {
      const tenantDs = await this.dsManager.getDataSource(waybill.tenantId);
      const whRows = await tenantDs
        .query<Array<{ id: string; name: string }>>(
          `SELECT id, name FROM warehouses WHERE id = ANY($1)`,
          [warehouseIds],
        )
        .catch(() => [] as Array<{ id: string; name: string }>);
      for (const row of whRows) warehouseNames[row.id] = row.name;
    }

    const data: WaybillReportData = {
      waybillNumber:   waybill.waybillNumber,
      type:            waybill.type,
      shipDate:        new Date(waybill.shipDate),
      deliveryDate:    waybill.deliveryDate ? new Date(waybill.deliveryDate) : undefined,
      senderName:      profile?.company_name ?? waybill.senderName,
      senderVkn:       profile?.vkn          ?? waybill.senderVkn,
      senderAddress,
      receiverName:     waybill.receiverName,
      receiverVknTckn:  waybill.receiverVknTckn,
      receiverAddress:  waybill.receiverAddress,
      vehiclePlate:     waybill.vehiclePlate,
      driverName:       waybill.driverName,
      carrierName:      waybill.carrierName,
      trackingNumber:   waybill.trackingNumber,
      gibUuid:          waybill.gibUuid,
      gibStatus:        waybill.gibStatusDesc ?? undefined,
      refNumber:        waybill.refNumber,
      refType:          waybill.refType,
      notes:            waybill.notes,
      generatedAt:      new Date(),
      lines: waybill.lines.map((l, i) => ({
        lineNumber:  i + 1,
        productName: l.productName,
        sku:         l.sku,
        quantity:    Number(l.quantity),
        unitCode:    l.unitCode,
        warehouseName:       l.warehouseId
          ? (warehouseNames[l.warehouseId] ?? l.warehouseId.slice(0, 8))
          : undefined,
        targetWarehouseName: l.targetWarehouseId
          ? (warehouseNames[l.targetWarehouseId] ?? l.targetWarehouseId.slice(0, 8))
          : undefined,
        lotNumber:    l.lotNumber,
        serialNumber: l.serialNumber,
      })),
    };

    const buffer = await this.template.setData(data).toBuffer();
    this.logger.log(`[${waybill.tenantId}] İrsaliye PDF üretildi: ${waybill.waybillNumber}`);
    return buffer;
  }
}

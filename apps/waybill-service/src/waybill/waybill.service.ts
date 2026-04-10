import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { Waybill, WaybillStatus, WaybillType } from './entities/waybill.entity';
import { WaybillLine } from './entities/waybill-line.entity';
import { GibOutbox } from '../outbox/outbox.entity';
import type { CreateWaybillDto } from './dto/create-waybill.dto';

/** İrsaliye numarası üreteci — format: IRS-{YYYY}-{NNNN} */
async function generateWaybillNumber(dataSource: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await dataSource.query<[{ seq: string }]>(
    `SELECT LPAD(nextval('irs_wb_seq_${year}')::text, 4, '0') AS seq`,
  ).catch(async () => {
    await dataSource.query(`CREATE SEQUENCE IF NOT EXISTS irs_wb_seq_${year} START 1`);
    return dataSource.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('irs_wb_seq_${year}')::text, 4, '0') AS seq`,
    );
  });
  return `IRS-${year}-${result[0].seq}`;
}

@Injectable()
export class WaybillService {
  private readonly logger = new Logger(WaybillService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async repos() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      waybillRepo: ds.getRepository(Waybill),
      lineRepo:    ds.getRepository(WaybillLine),
      outboxRepo:  ds.getRepository(GibOutbox),
      dataSource:  ds,
      tenantId,
    };
  }

  /** Yeni irsaliye oluştur */
  async create(dto: CreateWaybillDto, createdBy: string): Promise<Waybill> {
    const { waybillRepo, lineRepo, dataSource, tenantId } = await this.repos();

    if (!dto.lines?.length) {
      throw new BadRequestException('En az bir irsaliye kalemi gereklidir.');
    }

    // TRANSFER irsaliyesinde her kalemde targetWarehouseId zorunlu
    if (dto.type === 'TRANSFER') {
      const missingTarget = dto.lines.some(l => !l.targetWarehouseId);
      if (missingTarget) {
        throw new BadRequestException('Transfer irsaliyesinde her kalem için hedef depo (targetWarehouseId) zorunludur.');
      }
    }

    const waybillNumber = await generateWaybillNumber(dataSource);

    const lines = dto.lines.map(l =>
      lineRepo.create({
        tenantId,
        productId:         l.productId,
        productName:       l.productName,
        sku:               l.sku,
        unitCode:          l.unitCode ?? 'ADET',
        quantity:          l.quantity,
        warehouseId:       l.warehouseId,
        targetWarehouseId: l.targetWarehouseId,
        lotNumber:         l.lotNumber,
        serialNumber:      l.serialNumber,
        movementId:        l.movementId,
      }),
    );

    const waybill = waybillRepo.create({
      tenantId,
      waybillNumber,
      type:             dto.type,
      status:           'TASLAK',
      shipDate:         new Date(dto.shipDate),
      deliveryDate:     dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
      senderName:       dto.senderName,
      senderVkn:        dto.senderVkn,
      senderAddress:    dto.senderAddress,
      receiverName:     dto.receiverName,
      receiverVknTckn:  dto.receiverVknTckn,
      receiverAddress:  dto.receiverAddress,
      vehiclePlate:     dto.vehiclePlate,
      driverName:       dto.driverName,
      driverTckn:       dto.driverTckn,
      carrierName:      dto.carrierName,
      trackingNumber:   dto.trackingNumber,
      refType:          dto.refType,
      refId:            dto.refId,
      refNumber:        dto.refNumber,
      returnDirection:  dto.returnDirection,
      notes:            dto.notes,
      createdBy,
      lines,
    });

    const saved = await waybillRepo.save(waybill);
    this.logger.log(`[${tenantId}] İrsaliye oluşturuldu: ${waybillNumber} (${dto.type})`);
    return saved;
  }

  /** İrsaliye listesi */
  async findAll(params?: {
    type?:     WaybillType;
    status?:   WaybillStatus;
    refId?:    string;
    limit?:    number;
    offset?:   number;
  }): Promise<{ data: Waybill[]; total: number }> {
    const { waybillRepo, tenantId } = await this.repos();

    const qb = waybillRepo.createQueryBuilder('wb')
      .leftJoinAndSelect('wb.lines', 'line')
      .where('wb.tenant_id = :tenantId', { tenantId })
      .orderBy('wb.created_at', 'DESC');

    if (params?.type)   qb.andWhere('wb.type = :type',     { type: params.type });
    if (params?.status) qb.andWhere('wb.status = :status', { status: params.status });
    if (params?.refId)  qb.andWhere('wb.ref_id = :refId',  { refId: params.refId });

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const [data, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { data, total };
  }

  /** İrsaliye detayı */
  async findOne(id: string): Promise<Waybill> {
    const { waybillRepo, tenantId } = await this.repos();
    const waybill = await waybillRepo.findOne({
      where: { id, tenantId },
      relations: ['lines'],
    });
    if (!waybill) throw new NotFoundException(`İrsaliye bulunamadı: ${id}`);
    return waybill;
  }

  /** İrsaliyeyi onaylar (TASLAK → ONAYLANDI) */
  async approve(id: string): Promise<Waybill> {
    const { waybillRepo } = await this.repos();
    const waybill = await this.findOne(id);
    if (waybill.status !== 'TASLAK') {
      throw new ConflictException(`İrsaliye onaylanamaz: mevcut durum ${waybill.status}`);
    }
    waybill.status = 'ONAYLANDI';
    return waybillRepo.save(waybill);
  }

  /**
   * GİB'e gönderim kuyruğuna al (ONAYLANDI → GIB_KUYRUKTA)
   * Outbox kaydı oluşturulur; cron job işler.
   */
  async queueForGib(id: string): Promise<Waybill> {
    const { waybillRepo, outboxRepo, tenantId } = await this.repos();
    const waybill = await this.findOne(id);

    if (!['ONAYLANDI', 'GIB_REDDEDILDI'].includes(waybill.status)) {
      throw new ConflictException(`GİB kuyruğuna alınamaz: mevcut durum ${waybill.status}`);
    }

    // Outbox kaydı oluştur
    await outboxRepo.save(
      outboxRepo.create({
        tenantId,
        waybillId: waybill.id,
        action:    'SEND',
        status:    'PENDING',
      }),
    );

    waybill.status = 'GIB_KUYRUKTA';
    await waybillRepo.save(waybill);

    this.logger.log(`[${tenantId}] İrsaliye GİB kuyruğuna alındı: ${waybill.waybillNumber}`);
    return waybill;
  }

  /**
   * İrsaliyeyi iptal et
   * GİB'e gönderilmişse outbox'a CANCEL kaydı eklenir.
   */
  async cancel(id: string, reason?: string): Promise<Waybill> {
    const { waybillRepo, outboxRepo, tenantId } = await this.repos();
    const waybill = await this.findOne(id);

    if (['IPTAL'].includes(waybill.status)) {
      throw new ConflictException('İrsaliye zaten iptal edilmiş.');
    }
    if (waybill.status === 'GIB_ONAYLANDI') {
      // GİB'te de iptal et
      await outboxRepo.save(
        outboxRepo.create({
          tenantId,
          waybillId: waybill.id,
          action:    'CANCEL',
          status:    'PENDING',
        }),
      );
    }

    waybill.status = 'IPTAL';
    if (reason) waybill.notes = `${waybill.notes ?? ''}\nİptal nedeni: ${reason}`.trim();

    const saved = await waybillRepo.save(waybill);
    this.logger.log(`[${tenantId}] İrsaliye iptal edildi: ${waybill.waybillNumber}`);
    return saved;
  }

  /** Taslak irsaliyeyi güncelle */
  async update(id: string, dto: Partial<CreateWaybillDto>): Promise<Waybill> {
    const { waybillRepo } = await this.repos();
    const waybill = await this.findOne(id);

    if (waybill.status !== 'TASLAK') {
      throw new ConflictException('Sadece taslak irsaliyeler düzenlenebilir.');
    }

    Object.assign(waybill, {
      ...(dto.shipDate       && { shipDate:       new Date(dto.shipDate) }),
      ...(dto.deliveryDate   && { deliveryDate:   new Date(dto.deliveryDate) }),
      ...(dto.senderName     && { senderName:     dto.senderName }),
      ...(dto.senderVkn      && { senderVkn:      dto.senderVkn }),
      ...(dto.senderAddress  && { senderAddress:  dto.senderAddress }),
      ...(dto.receiverName   && { receiverName:   dto.receiverName }),
      ...(dto.receiverVknTckn && { receiverVknTckn: dto.receiverVknTckn }),
      ...(dto.receiverAddress && { receiverAddress: dto.receiverAddress }),
      ...(dto.vehiclePlate   && { vehiclePlate:   dto.vehiclePlate }),
      ...(dto.driverName     && { driverName:     dto.driverName }),
      ...(dto.driverTckn     && { driverTckn:     dto.driverTckn }),
      ...(dto.carrierName    && { carrierName:    dto.carrierName }),
      ...(dto.trackingNumber && { trackingNumber: dto.trackingNumber }),
      ...(dto.notes          && { notes:          dto.notes }),
    });

    return waybillRepo.save(waybill);
  }
}

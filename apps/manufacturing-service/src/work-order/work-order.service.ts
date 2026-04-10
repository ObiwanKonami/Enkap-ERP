import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { WorkOrder } from './entities/work-order.entity';
import { WorkOrderOperation } from './entities/work-order-operation.entity';
import { Bom } from '../bom/entities/bom.entity';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto';
import type { CompleteWorkOrderDto } from './dto/complete-work-order.dto';

/** İş emri numarası üreteci — format: WO-{YYYY}-{NNNN} */
async function generateWoNumber(dataSource: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await dataSource
    .query<[{ seq: string }]>(
      `SELECT LPAD(nextval('wo_seq_${year}')::text, 4, '0') AS seq`,
    )
    .catch(async () => {
      await dataSource.query(`CREATE SEQUENCE IF NOT EXISTS wo_seq_${year} START 1`);
      return dataSource.query<[{ seq: string }]>(
        `SELECT LPAD(nextval('wo_seq_${year}')::text, 4, '0') AS seq`,
      );
    });
  return `WO-${year}-${result[0].seq}`;
}

/** Stock-service hareketi — üretim tamamlandığında kullanılır */
interface StockMovementPayload {
  productId:     string;
  warehouseId:   string;
  type:          'GIRIS' | 'CIKIS';
  quantity:      number;
  referenceType: string;
  referenceId:   string;
  notes:         string;
}

@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    private readonly dsManager: TenantDataSourceManager,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  private async ds() {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);
    return {
      ds,
      tenantId,
      woRepo:  ds.getRepository(WorkOrder),
      opRepo:  ds.getRepository(WorkOrderOperation),
      bomRepo: ds.getRepository(Bom),
    };
  }

  /**
   * Yeni iş emri oluştur.
   * WO numarası PostgreSQL sequence ile üretilir — yarış koşulu yok.
   */
  async create(dto: CreateWorkOrderDto, createdBy: string): Promise<WorkOrder> {
    const { ds, tenantId, woRepo, opRepo, bomRepo } = await this.ds();

    // Reçete tenant kontrolü
    const bom = await bomRepo.findOne({
      where: { id: dto.bomId, tenantId },
      relations: ['lines'],
    });
    if (!bom) throw new NotFoundException(`Reçete bulunamadı: ${dto.bomId}`);

    const woNumber = await generateWoNumber(ds);

    const operations = (dto.operations ?? []).map((op) =>
      opRepo.create({
        sequence:               op.sequence,
        operationName:          op.operationName,
        workCenter:             op.workCenter,
        plannedDurationMinutes: op.plannedDurationMinutes,
        status: 'BEKLIYOR',
      }),
    );

    const wo = woRepo.create({
      tenantId,
      woNumber,
      bomId:           dto.bomId,
      productId:       dto.productId,
      productName:     dto.productName,
      targetQuantity:  dto.targetQuantity,
      producedQuantity: 0,
      status:          'TASLAK',
      plannedStartDate: new Date(dto.plannedStartDate),
      plannedEndDate:  new Date(dto.plannedEndDate),
      warehouseId:     dto.warehouseId,
      notes:           dto.notes,
      createdBy,
      operations,
    });

    const saved = await woRepo.save(wo);
    this.logger.log(`[${tenantId}] İş emri oluşturuldu: ${woNumber} (ürün: ${dto.productId})`);
    return saved;
  }

  /** İş emri listesi */
  async findAll(params?: {
    status?: string;
    productId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: WorkOrder[]; total: number; page: number; limit: number }> {
    const { tenantId, woRepo } = await this.ds();

    const qb = woRepo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.operations', 'op')
      .where('wo.tenant_id = :tenantId', { tenantId })
      .orderBy('wo.created_at', 'DESC');

    if (params?.status) {
      qb.andWhere('wo.status = :status', { status: params.status });
    }
    if (params?.productId) {
      qb.andWhere('wo.product_id = :productId', { productId: params.productId });
    }

    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = (page - 1) * limit;

    const [items, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { items, total, page, limit };
  }

  /** İş emri detayı — tenant kontrolü dahil */
  async findOne(id: string): Promise<WorkOrder> {
    const { tenantId, woRepo } = await this.ds();
    const wo = await woRepo.findOne({
      where: { id, tenantId },
      relations: ['operations'],
    });
    if (!wo) throw new NotFoundException(`İş emri bulunamadı: ${id}`);
    return wo;
  }

  /** TASLAK → PLANLI geçişi */
  async confirm(id: string): Promise<WorkOrder> {
    const { tenantId, woRepo } = await this.ds();
    const wo = await woRepo.findOne({ where: { id, tenantId }, relations: ['operations'] });
    if (!wo) throw new NotFoundException(`İş emri bulunamadı: ${id}`);
    if (wo.status !== 'TASLAK') {
      throw new ConflictException(`İş emri onaylanamaz: mevcut durum ${wo.status}`);
    }
    wo.status = 'PLANLI';
    const saved = await woRepo.save(wo);
    this.logger.log(`[${tenantId}] İş emri onaylandı: ${wo.woNumber}`);
    return saved;
  }

  /** PLANLI → URETIMDE geçişi */
  async startProduction(id: string): Promise<WorkOrder> {
    const { tenantId, woRepo } = await this.ds();
    const wo = await woRepo.findOne({ where: { id, tenantId }, relations: ['operations'] });
    if (!wo) throw new NotFoundException(`İş emri bulunamadı: ${id}`);
    if (wo.status !== 'PLANLI') {
      throw new ConflictException(`Üretim başlatılamaz: mevcut durum ${wo.status}`);
    }
    wo.status = 'URETIMDE';
    wo.actualStartDate = new Date();
    const saved = await woRepo.save(wo);
    this.logger.log(`[${tenantId}] Üretim başladı: ${wo.woNumber}`);
    return saved;
  }

  /**
   * URETIMDE → TAMAMLANDI geçişi.
   * Hammadde CIKIS + mamul GIRIS hareketleri stock-service'e gönderilir.
   * Hata durumunda compensating transaction çalışır.
   */
  async complete(
    id: string,
    dto: CompleteWorkOrderDto,
    authToken?: string,
  ): Promise<WorkOrder> {
    const { tenantId, woRepo, bomRepo } = await this.ds();

    const wo = await woRepo.findOne({ where: { id, tenantId }, relations: ['operations'] });
    if (!wo) throw new NotFoundException(`İş emri bulunamadı: ${id}`);
    if (wo.status !== 'URETIMDE') {
      throw new ConflictException(`İş emri tamamlanamaz: mevcut durum ${wo.status}`);
    }

    const bom = await bomRepo.findOne({
      where: { id: wo.bomId, tenantId },
      relations: ['lines'],
    });
    if (!bom) throw new NotFoundException(`Reçete bulunamadı: ${wo.bomId}`);

    const stockUrl = this.config.get<string>('STOCK_SERVICE_URL', 'http://localhost:3004');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = authToken;

    const createdMovementIds: string[] = [];

    try {
      // 1. Her hammadde için CIKIS hareketi
      for (const line of bom.lines) {
        const grossQty =
          dto.producedQuantity *
          Number(line.quantity) *
          (1 + Number(line.scrapRate) / 100);

        const payload: StockMovementPayload = {
          productId:     line.materialId,
          warehouseId:   line.warehouseId ?? wo.warehouseId ?? '',
          type:          'CIKIS',
          quantity:      Math.round(grossQty * 1000) / 1000,
          referenceType: 'work_order',
          referenceId:   wo.woNumber,
          notes:         `İş Emri: ${wo.woNumber} — hammadde tüketimi`,
        };

        if (!payload.warehouseId) {
          throw new BadRequestException(
            `Hammadde depo bilgisi eksik: materialId=${line.materialId}`,
          );
        }

        const res = await firstValueFrom(
          this.httpService.post<{ id: string }>(
            `${stockUrl}/api/v1/movements`,
            payload,
            { headers },
          ),
        );
        createdMovementIds.push(res.data.id);
      }

      // 2. Mamul için GIRIS hareketi
      if (!wo.warehouseId) {
        throw new BadRequestException('İş emrinde çıkış deposu (warehouseId) tanımlı değil.');
      }

      const fgRes = await firstValueFrom(
        this.httpService.post<{ id: string }>(
          `${stockUrl}/api/v1/movements`,
          {
            productId:     wo.productId,
            warehouseId:   wo.warehouseId,
            type:          'GIRIS',
            quantity:      dto.producedQuantity,
            referenceType: 'work_order',
            referenceId:   wo.woNumber,
            notes:         `İş Emri: ${wo.woNumber} — mamul girişi`,
          } satisfies StockMovementPayload,
          { headers },
        ),
      );
      createdMovementIds.push(fgRes.data.id);
    } catch (err: unknown) {
      // Compensating: oluşturulan hareketleri geri al
      for (const movId of createdMovementIds) {
        await this.httpService
          .delete(`${stockUrl}/api/v1/movements/${movId}`, { headers })
          .toPromise()
          .catch((delErr: unknown) =>
            this.logger.warn(
              `[${tenantId}] Compensating hareket silinemedi: ${movId} — ${String(delErr)}`,
            ),
          );
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Stok hareketi kaydedilemedi: ${msg}`);
    }

    // 3. İş emrini tamamlandı olarak işaretle
    wo.status = 'TAMAMLANDI';
    wo.producedQuantity = dto.producedQuantity;
    wo.actualEndDate = new Date();
    if (dto.notes) wo.notes = dto.notes;

    const saved = await woRepo.save(wo);
    this.logger.log(
      `[${tenantId}] İş emri tamamlandı: ${wo.woNumber} — üretilen: ${dto.producedQuantity}`,
    );
    return saved;
  }

  /** İptal et */
  async cancel(id: string): Promise<WorkOrder> {
    const { tenantId, woRepo } = await this.ds();
    const wo = await woRepo.findOne({ where: { id, tenantId }, relations: ['operations'] });
    if (!wo) throw new NotFoundException(`İş emri bulunamadı: ${id}`);
    if (['TAMAMLANDI', 'IPTAL'].includes(wo.status)) {
      throw new ConflictException(`İş emri iptal edilemez: mevcut durum ${wo.status}`);
    }
    wo.status = 'IPTAL';
    const saved = await woRepo.save(wo);
    this.logger.log(`[${tenantId}] İş emri iptal edildi: ${wo.woNumber}`);
    return saved;
  }
}

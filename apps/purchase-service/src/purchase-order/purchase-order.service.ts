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
import { PurchaseOrder }      from './entities/purchase-order.entity';
import { PurchaseOrderLine }  from './entities/purchase-order-line.entity';
import { GoodsReceipt }       from '../goods-receipt/entities/goods-receipt.entity';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { WaybillEventsPublisher } from '../events/waybill-events.publisher';

/** PO numarası üreteci — format: PO-{YYYY}-{NNNN} */
async function generatePoNumber(ds: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await ds.query<[{ seq: string }]>(
    `SELECT LPAD(nextval('po_seq_${year}')::text, 4, '0') AS seq`,
  ).catch(async () => {
    await ds.query(`CREATE SEQUENCE IF NOT EXISTS po_seq_${year} START 1`);
    const r = await ds.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('po_seq_${year}')::text, 4, '0') AS seq`,
    );
    return r;
  });
  return `PO-${year}-${result[0].seq}`;
}

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    private readonly dsManager:        TenantDataSourceManager,
    private readonly httpService:      HttpService,
    private readonly config:           ConfigService,
    private readonly waybillPublisher: WaybillEventsPublisher,
  ) {}

  private async ds(): Promise<DataSource> {
    const { tenantId } = getTenantContext();
    return this.dsManager.getDataSource(tenantId);
  }

  /** Yeni satın alma siparişi oluştur */
  async create(dto: CreatePurchaseOrderDto, createdBy: string): Promise<PurchaseOrder> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    if (!dto.lines?.length) {
      throw new BadRequestException('En az bir sipariş kalemi gereklidir.');
    }

    const poNumber = await generatePoNumber(ds);

    // Toplam hesapla
    let kdv = 0;
    const lineRepo  = ds.getRepository(PurchaseOrderLine);
    const lines = dto.lines.map(l => {
      const lineTotal = Math.round(l.quantity * l.unitPriceKurus);
      const lineKdv   = Math.round(lineTotal * l.kdvRate / 100);
      kdv            += lineKdv;
      return lineRepo.create({
        tenantId,
        productId:      l.productId,
        productName:    l.productName,
        unitCode:       l.unitCode ?? 'ADET',
        quantity:       l.quantity,
        receivedQuantity: 0,
        unitPriceKurus: l.unitPriceKurus,
        kdvRate:        l.kdvRate,
        lineTotalKurus: lineTotal,
      });
    });

    const total = lines.reduce((s, l) => s + Number(l.lineTotalKurus), 0);

    const orderRepo = ds.getRepository(PurchaseOrder);
    const order = orderRepo.create({
      tenantId,
      poNumber,
      vendorId:            dto.vendorId,
      vendorName:          dto.vendorName,
      status:              'draft',
      orderDate:           new Date(dto.orderDate),
      expectedDeliveryDate: dto.expectedDeliveryDate ? new Date(dto.expectedDeliveryDate) : undefined,
      subtotalKurus:       total,
      kdvKurus:            kdv,
      totalKurus:          total + kdv,
      notes:               dto.notes,
      createdBy,
      lines,
    });

    return orderRepo.save(order);
  }

  /** PO listesi */
  async findAll(params?: {
    status?: string;
    vendorId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: PurchaseOrder[]; total: number }> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const qb = ds.getRepository(PurchaseOrder).createQueryBuilder('po')
      .leftJoinAndSelect('po.lines', 'line')
      .where('po.tenant_id = :tenantId', { tenantId })
      .orderBy('po.created_at', 'DESC');

    if (params?.status)   qb.andWhere('po.status = :status',     { status: params.status });
    if (params?.vendorId) qb.andWhere('po.vendor_id = :vendorId', { vendorId: params.vendorId });

    const limit  = Math.min(params?.limit  ?? 50, 200);
    const offset = params?.offset ?? 0;

    const [data, total] = await qb.limit(limit).offset(offset).getManyAndCount();
    return { data, total };
  }

  /** PO detayı */
  async findOne(id: string): Promise<PurchaseOrder> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();
    const order = await ds.getRepository(PurchaseOrder).findOne({
      where:     { id, tenantId },
      relations: ['lines'],
    });
    if (!order) throw new NotFoundException(`Satın alma siparişi bulunamadı: ${id}`);
    return order;
  }

  /** Onaycıya gönder / tedarikçiye ilet */
  async submitForApproval(id: string): Promise<PurchaseOrder> {
    const order = await this.findOne(id);
    if (order.status !== 'draft') {
      throw new ConflictException(`Sipariş onay akışına gönderilemez: mevcut durum ${order.status}`);
    }
    order.status = 'sent';
    return (await this.ds()).getRepository(PurchaseOrder).save(order);
  }

  /** Onayla */
  async approve(id: string, approvedBy: string): Promise<PurchaseOrder> {
    const order = await this.findOne(id);
    if (order.status !== 'sent') {
      throw new ConflictException(`Sipariş onaylanamaz: mevcut durum ${order.status}`);
    }
    order.approvedBy = approvedBy;
    order.approvedAt = new Date();
    return (await this.ds()).getRepository(PurchaseOrder).save(order);
  }

  /** İptal et */
  async cancel(id: string): Promise<PurchaseOrder> {
    const order = await this.findOne(id);
    if (['received', 'cancelled'].includes(order.status)) {
      throw new ConflictException(`Sipariş iptal edilemez: mevcut durum ${order.status}`);
    }
    order.status = 'cancelled';
    return (await this.ds()).getRepository(PurchaseOrder).save(order);
  }

  /**
   * Mal Kabul (Goods Receipt)
   *
   * 1. GRN belgesi oluştur
   * 2. Her kalem için stock-service GIRIS hareketi gönder (HTTP)
   * 3. PO'daki receivedQuantity'leri güncelle
   * 4. Tüm kalemler teslim alındıysa PO → received, değilse partial
   *
   * Compensating transaction: stock HTTP başarısız olursa GRN silinir.
   */
  async createGoodsReceipt(
    orderId: string,
    items: Array<{
      productId:     string;
      productName:   string;
      warehouseId:   string;
      quantity:      number;
      unitCostKurus: number;
    }>,
    receivedBy: string,
    receiptDate: string,
    notes?: string,
    authToken?: string,
  ): Promise<GoodsReceipt> {
    const { tenantId } = getTenantContext();
    const ds    = await this.ds();
    const order = await this.findOne(orderId);

    if (!['sent', 'partial'].includes(order.status)) {
      throw new ConflictException(`Mal kabul yapılamaz: sipariş durumu ${order.status}`);
    }

    const year   = new Date().getFullYear();
    const grnNum = await this.generateGrnNumber(ds, year);
    const grRepo = ds.getRepository(GoodsReceipt);

    // 1. GRN kaydet (önce — sonra stock sync)
    const grn = await grRepo.save(
      grRepo.create({
        tenantId,
        purchaseOrderId: orderId,
        grnNumber:       grnNum,
        receivedBy,
        receiptDate:     new Date(receiptDate),
        items:           items.map(i => ({ ...i })),
        stockSynced:     false,
        notes,
      }),
    );

    // 2. Stock-service'e GIRIS hareketi gönder
    const stockUrl = this.config.get('STOCK_SERVICE_URL', 'http://localhost:3004');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = authToken;

    let syncError: string | undefined;
    const syncedItems = [...grn.items];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const res = await firstValueFrom(
          this.httpService.post<{ id: string }>(
            `${stockUrl}/api/v1/movements`,
            {
              productId:     item.productId,
              warehouseId:   item.warehouseId,
              type:          'GIRIS',
              quantity:      item.quantity,
              unitCostKurus: item.unitCostKurus,
              referenceType: 'purchase_order',
              referenceId:   order.poNumber,
              notes:         `Mal Kabul: ${grnNum}`,
            },
            { headers },
          ),
        );
        syncedItems[i].movementId = res.data.id;
      } catch (err: unknown) {
        syncError = `Ürün ${item.productId}: ${String(err)}`;
        this.logger.error(`[${tenantId}] Stock sync hatası GRN ${grnNum}: ${syncError}`);
        break;
      }
    }

    if (syncError) {
      // Compensating: GRN sil (kısmi sync güvenli değil)
      await grRepo.delete(grn.id);
      throw new BadRequestException(`Stok hareketi kaydedilemedi: ${syncError}`);
    }

    // 3. GRN'i güncelle (movementId'ler ile)
    grn.items       = syncedItems;
    grn.stockSynced = true;
    await grRepo.save(grn);

    // 4. PO satırlarındaki receivedQuantity'leri güncelle
    await ds.transaction(async (em) => {
      for (const item of items) {
        const line = order.lines.find(l => l.productId === item.productId);
        if (line) {
          line.receivedQuantity = Number(line.receivedQuantity) + item.quantity;
          await em.save(PurchaseOrderLine, line);
        }
      }

      // PO durumunu güncelle
      const allReceived = order.lines.every(
        l => Number(l.receivedQuantity) >= Number(l.quantity),
      );
      order.status = allReceived ? 'received' : 'partial';
      await em.save(PurchaseOrder, order);
    });

    // 5. Financial-service'e otomatik ALIS faturası oluştur (fire-and-forget)
    const financialUrl = this.config.get('FINANCIAL_SERVICE_URL', 'http://localhost:3003');
    firstValueFrom(
      this.httpService.post(
        `${financialUrl}/invoices`,
        {
          invoiceType:  'INVOICE',
          direction:    'IN',
          vendorId:     order.vendorId,
          issueDate:    receiptDate,
          currency:     'TRY',
          exchangeRate: 1,
          notes:        `Otomatik oluşturuldu — GRN: ${grnNum} / PO: ${order.poNumber}`,
          lines: items.map(item => {
            const poLine = order.lines.find(l => l.productId === item.productId);
            return {
              productId:   item.productId,
              description: item.productName,
              quantity:    item.quantity,
              unit:        poLine?.unitCode ?? 'ADET',
              unitPrice:   item.unitCostKurus / 100,
              kdvRate:     poLine?.kdvRate ?? 20,
            };
          }),
        },
        { headers },
      ),
    ).catch(err =>
      this.logger.warn(`[${tenantId}] Otomatik alış faturası oluşturulamadı (GRN: ${grnNum}): ${String(err)}`),
    );

    // waybill-service'e event gönder — ALIS irsaliyesi otomatik oluşturulsun
    this.waybillPublisher.publishGoodsReceiptCreated({
      tenantId,
      grnId:           grn.id,
      grnNumber:       grnNum,
      purchaseOrderId: orderId,
      poNumber:        order.poNumber,
      receiptDate:     new Date(receiptDate).toISOString().slice(0, 10),
      vendorName:      '',
      items: items.map(i => ({
        productId:   i.productId,
        productName: i.productName,
        sku:         undefined,
        unitCode:    'ADET',
        quantity:    i.quantity,
        warehouseId: i.warehouseId,
      })),
    });

    this.logger.log(`[${tenantId}] Mal kabul tamamlandı: ${grnNum} (PO: ${order.poNumber})`);
    return grn;
  }

  private async generateGrnNumber(ds: DataSource, year: number): Promise<string> {
    const result = await ds.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('grn_seq_${year}')::text, 4, '0') AS seq`,
    ).catch(async () => {
      await ds.query(`CREATE SEQUENCE IF NOT EXISTS grn_seq_${year} START 1`);
      return ds.query<[{ seq: string }]>(
        `SELECT LPAD(nextval('grn_seq_${year}')::text, 4, '0') AS seq`,
      );
    });
    return `GRN-${year}-${result[0].seq}`;
  }
}

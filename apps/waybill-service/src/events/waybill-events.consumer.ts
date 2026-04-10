import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { TenantDataSourceManager } from '@enkap/database';
import { WaybillService }  from '../waybill/waybill.service';
import { Waybill }         from '../waybill/entities/waybill.entity';
import { GibOutbox }       from '../outbox/outbox.entity';

// ─── Event payload tipleri ────────────────────────────────────────────────────

interface DeliveryCreatedPayload {
  tenantId:       string;
  deliveryId:     string;
  deliveryNumber: string;
  salesOrderId:   string;
  soNumber:       string;
  shipDate:       string;
  customerName:   string;
  customerVknTckn?: string;
  customerAddress?: string;
  carrierName?:   string;
  trackingNumber?: string;
  vehiclePlate?:  string;
  driverName?:    string;
  driverTckn?:    string;
  items: Array<{
    productId:   string;
    productName: string;
    sku?:        string;
    unitCode:    string;
    quantity:    number;
    warehouseId: string;
  }>;
}

interface GoodsReceiptCreatedPayload {
  tenantId:          string;
  grnId:             string;
  grnNumber:         string;
  purchaseOrderId:   string;
  poNumber:          string;
  receiptDate:       string;
  vendorName:        string;
  vendorVkn?:        string;
  vendorAddress?:    string;
  items: Array<{
    productId:   string;
    productName: string;
    sku?:        string;
    unitCode:    string;
    quantity:    number;
    warehouseId: string;
  }>;
}

interface StockTransferCreatedPayload {
  tenantId:       string;
  movementId:     string;
  shipDate:       string;
  fromWarehouseId:  string;
  toWarehouseId:    string;
  fromWarehouseName?: string;
  toWarehouseName?:   string;
  items: Array<{
    productId:   string;
    productName: string;
    sku?:        string;
    unitCode:    string;
    quantity:    number;
  }>;
}

interface ReturnCreatedPayload {
  tenantId:       string;
  returnId:       string;
  returnNumber:   string;
  refType:        'sales_order' | 'purchase_order';
  refId:          string;
  refNumber:      string;
  direction:      'MUSTERIDEN' | 'TEDARIKCIYE';
  shipDate:       string;
  partyName:      string;
  partyVknTckn?:  string;
  items: Array<{
    productId:   string;
    productName: string;
    sku?:        string;
    unitCode:    string;
    quantity:    number;
    warehouseId: string;
  }>;
}

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';
const QUEUE         = 'waybill.events';

/**
 * Waybill servisinin RabbitMQ consumer'ı.
 *
 * Dinlenen routing key'ler:
 *   waybill.satis.created    → order-service sevkiyat tamamlandı
 *   waybill.alis.created     → purchase-service mal kabul tamamlandı
 *   waybill.transfer.created → stock-service depo transferi tamamlandı
 *   waybill.iade.created     → iade hareketi tamamlandı
 *
 * Her event → TASLAK irsaliye otomatik oluşturulur.
 * Kullanıcı sonra onaylayıp GİB'e gönderir.
 */
@Injectable()
export class WaybillEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger     = new Logger(WaybillEventsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;

  constructor(
    private readonly config:         ConfigService,
    private readonly dsManager:      TenantDataSourceManager,
    private readonly waybillService: WaybillService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');

    try {
      const conn = await connect(url);
      const ch   = await conn.createChannel();

      this.connection = conn;
      this.channel    = ch;

      await ch.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      // DLQ
      await ch.assertQueue(`${QUEUE}.dlq`, { durable: true });

      // Ana kuyruk
      await ch.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange':    '',
          'x-dead-letter-routing-key': `${QUEUE}.dlq`,
          'x-message-ttl':             60_000,
        },
      });

      // Tüm irsaliye event'lerini dinle
      await ch.bindQueue(QUEUE, EXCHANGE, 'waybill.#');
      await ch.prefetch(1);

      await ch.consume(QUEUE, (msg) => {
        if (msg) {
          this.handleMessage(msg).catch((err: Error) => {
            this.logger.error(`Mesaj işleme hatası: ${err.message}`, err.stack);
            ch.nack(msg, false, false);
          });
        }
      });

      this.logger.log(`RabbitMQ consumer başlatıldı: queue=${QUEUE}`);
    } catch (err) {
      this.logger.warn(`RabbitMQ consumer başlatılamadı: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const routingKey = msg.fields.routingKey;
    this.logger.debug(`Mesaj: ${routingKey}`);

    const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;

    switch (routingKey) {
      case 'waybill.satis.created':
        await this.onDeliveryCreated(payload as unknown as DeliveryCreatedPayload);
        break;
      case 'waybill.alis.created':
        await this.onGoodsReceiptCreated(payload as unknown as GoodsReceiptCreatedPayload);
        break;
      case 'waybill.transfer.created':
        await this.onTransferCreated(payload as unknown as StockTransferCreatedPayload);
        break;
      case 'waybill.iade.created':
        await this.onReturnCreated(payload as unknown as ReturnCreatedPayload);
        break;
      default:
        this.logger.warn(`Bilinmeyen routing key: ${routingKey}`);
    }

    this.channel?.ack(msg);
  }

  /** Satış sevkiyatı → SATIS irsaliyesi */
  private async onDeliveryCreated(p: DeliveryCreatedPayload): Promise<void> {
    await this.createWaybillForTenant(p.tenantId, {
      type:             'SATIS',
      shipDate:         p.shipDate,
      senderName:       '',    // PDF'de tenant profilinden doldurulur
      receiverName:     p.customerName,
      receiverVknTckn:  p.customerVknTckn,
      receiverAddress:  p.customerAddress,
      carrierName:      p.carrierName,
      trackingNumber:   p.trackingNumber,
      vehiclePlate:     p.vehiclePlate,
      driverName:       p.driverName,
      driverTckn:       p.driverTckn,
      refType:          'sales_order',
      refId:            p.salesOrderId,
      refNumber:        p.soNumber,
      lines: p.items.map(i => ({
        productId:   i.productId,
        productName: i.productName,
        sku:         i.sku,
        unitCode:    i.unitCode ?? 'ADET',
        quantity:    i.quantity,
        warehouseId: i.warehouseId,
      })),
    });
    this.logger.log(`[${p.tenantId}] SATIS irsaliyesi oluşturuldu: ${p.deliveryNumber}`);
  }

  /** Mal kabul → ALIS irsaliyesi */
  private async onGoodsReceiptCreated(p: GoodsReceiptCreatedPayload): Promise<void> {
    await this.createWaybillForTenant(p.tenantId, {
      type:            'ALIS',
      shipDate:        p.receiptDate,
      senderName:      p.vendorName,
      senderVkn:       p.vendorVkn,
      senderAddress:   p.vendorAddress,
      receiverName:    '',   // PDF'de tenant profilinden doldurulur
      refType:         'purchase_order',
      refId:           p.purchaseOrderId,
      refNumber:       p.poNumber,
      lines: p.items.map(i => ({
        productId:   i.productId,
        productName: i.productName,
        sku:         i.sku,
        unitCode:    i.unitCode ?? 'ADET',
        quantity:    i.quantity,
        warehouseId: i.warehouseId,
      })),
    });
    this.logger.log(`[${p.tenantId}] ALIS irsaliyesi oluşturuldu: ${p.grnNumber}`);
  }

  /** Depo transferi → TRANSFER irsaliyesi */
  private async onTransferCreated(p: StockTransferCreatedPayload): Promise<void> {
    await this.createWaybillForTenant(p.tenantId, {
      type:        'TRANSFER',
      shipDate:    p.shipDate,
      senderName:  p.fromWarehouseName ?? 'Kaynak Depo',
      receiverName: p.toWarehouseName  ?? 'Hedef Depo',
      refType:     'stock_transfer',
      refId:       p.movementId,
      lines: p.items.map(i => ({
        productId:         i.productId,
        productName:       i.productName,
        sku:               i.sku,
        unitCode:          i.unitCode ?? 'ADET',
        quantity:          i.quantity,
        warehouseId:       p.fromWarehouseId,
        targetWarehouseId: p.toWarehouseId,
      })),
    });
    this.logger.log(`[${p.tenantId}] TRANSFER irsaliyesi oluşturuldu`);
  }

  /** İade → IADE irsaliyesi */
  private async onReturnCreated(p: ReturnCreatedPayload): Promise<void> {
    await this.createWaybillForTenant(p.tenantId, {
      type:            'IADE',
      shipDate:        p.shipDate,
      senderName:      p.direction === 'MUSTERIDEN' ? p.partyName : '',
      receiverName:    p.direction === 'TEDARIKCIYE' ? p.partyName : '',
      receiverVknTckn: p.partyVknTckn,
      returnDirection: p.direction,
      refType:         p.refType,
      refId:           p.refId,
      refNumber:       p.refNumber,
      lines: p.items.map(i => ({
        productId:   i.productId,
        productName: i.productName,
        sku:         i.sku,
        unitCode:    i.unitCode ?? 'ADET',
        quantity:    i.quantity,
        warehouseId: i.warehouseId,
      })),
    });
    this.logger.log(`[${p.tenantId}] IADE irsaliyesi oluşturuldu: ${p.returnNumber}`);
  }

  /**
   * Tenant context'ini simüle ederek irsaliye oluştur.
   *
   * RabbitMQ consumer'da HTTP request yok — tenant context AsyncLocalStorage
   * ile manuel olarak set edilmesi gerekir. WaybillService.create() içinde
   * getTenantContext() çağrısı yapıldığı için, burada TenantDataSourceManager
   * üzerinden direkt DataSource alarak işlem yapıyoruz.
   */
  private async createWaybillForTenant(
    tenantId: string,
    data: {
      type: 'SATIS' | 'ALIS' | 'TRANSFER' | 'IADE';
      shipDate: string;
      senderName: string;
      senderVkn?: string;
      senderAddress?: string;
      receiverName: string;
      receiverVknTckn?: string;
      receiverAddress?: string;
      carrierName?: string;
      trackingNumber?: string;
      vehiclePlate?: string;
      driverName?: string;
      driverTckn?: string;
      returnDirection?: 'MUSTERIDEN' | 'TEDARIKCIYE';
      refType?: string;
      refId?: string;
      refNumber?: string;
      lines: Array<{
        productId?: string;
        productName: string;
        sku?: string;
        unitCode: string;
        quantity: number;
        warehouseId?: string;
        targetWarehouseId?: string;
      }>;
    },
  ): Promise<void> {
    // TenantDataSourceManager kullanarak direkt erişim (context bypass)
    const ds         = await this.dsManager.getDataSource(tenantId);
    const waybillRepo = ds.getRepository(Waybill);
    const outboxRepo  = ds.getRepository(GibOutbox);

    // Numaralama için sequence
    const year   = new Date().getFullYear();
    const result = await ds.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('irs_wb_seq_${year}')::text, 4, '0') AS seq`,
    ).catch(async () => {
      await ds.query(`CREATE SEQUENCE IF NOT EXISTS irs_wb_seq_${year} START 1`);
      return ds.query<[{ seq: string }]>(
        `SELECT LPAD(nextval('irs_wb_seq_${year}')::text, 4, '0') AS seq`,
      );
    });
    const waybillNumber = `IRS-${year}-${result[0].seq}`;

    const waybill = waybillRepo.create({
      tenantId,
      waybillNumber,
      type:            data.type,
      status:          'TASLAK',
      shipDate:        new Date(data.shipDate),
      senderName:      data.senderName,
      senderVkn:       data.senderVkn,
      senderAddress:   data.senderAddress,
      receiverName:    data.receiverName,
      receiverVknTckn: data.receiverVknTckn,
      receiverAddress: data.receiverAddress,
      carrierName:     data.carrierName,
      trackingNumber:  data.trackingNumber,
      vehiclePlate:    data.vehiclePlate,
      driverName:      data.driverName,
      driverTckn:      data.driverTckn,
      returnDirection: data.returnDirection,
      refType:         data.refType,
      refId:           data.refId,
      refNumber:       data.refNumber,
      createdBy:       'system',
      lines:           data.lines.map(l => ({
        tenantId,
        productId:         l.productId,
        productName:       l.productName,
        sku:               l.sku,
        unitCode:          l.unitCode,
        quantity:          l.quantity,
        warehouseId:       l.warehouseId,
        targetWarehouseId: l.targetWarehouseId,
      })),
    });

    await waybillRepo.save(waybill);
    this.logger.debug(`[${tenantId}] İrsaliye oluşturuldu: ${waybillNumber}`);
  }
}

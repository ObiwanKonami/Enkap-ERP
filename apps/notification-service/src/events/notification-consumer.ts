import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { NotificationService } from '../notification/notification.service';

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';
const QUEUE         = 'notification.events';

// ─── Event payload tipleri ────────────────────────────────────────────────────

interface InvoiceApprovedPayload {
  tenantId:      string;
  invoiceId:     string;
  invoiceNumber: string;
  customerName:  string;
  totalAmount?:  number; // kuruş
}

interface InvoiceGibPayload {
  tenantId:      string;
  invoiceId:     string;
  invoiceNumber: string;
  status:        'GIB_ONAYLANDI' | 'GIB_REDDEDILDI';
  errorMessage?: string;
}

interface StockBelowReorderPayload {
  tenantId:      string;
  productId:     string;
  productName:   string;
  sku?:          string;
  currentStock:  number;
  reorderPoint:  number;
  warehouseName?: string;
}

interface LeaveRequestPayload {
  tenantId:       string;
  requestId:      string;
  employeeName:   string;
  leaveType:      string;
  startDate:      string;
  endDate:        string;
  dayCount:       number;
}

interface PurchaseOrderApprovedPayload {
  tenantId:    string;
  orderId:     string;
  orderNumber: string;
  vendorName:  string;
  totalAmount: number;
}

interface WaybillCreatedPayload {
  tenantId:       string;
  waybillId:      string;
  waybillNumber:  string;
  type:           'SATIS' | 'ALIS' | 'TRANSFER' | 'IADE';
  partyName?:     string;
}

/**
 * Notification servisinin merkezi RabbitMQ consumer'ı.
 *
 * Dinlenen routing key'ler:
 *   invoice.approved           → Fatura onaylandı (finans/info)
 *   invoice.gib.approved       → GİB onayı (finans/success)
 *   invoice.gib.rejected       → GİB reddi (finans/error)
 *   stock.below_reorder        → Kritik stok (stok/warning)
 *   leave.request.created      → İzin talebi (ik/info)
 *   purchase.order.approved    → Satın alma onayı (finans/info)
 *   waybill.satis.created      → Satış irsaliyesi (stok/info)
 *   waybill.alis.created       → Alış irsaliyesi (stok/info)
 *   waybill.transfer.created   → Transfer irsaliyesi (stok/info)
 *   waybill.iade.created       → İade irsaliyesi (stok/warning)
 */
@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger     = new Logger(NotificationConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;

  constructor(
    private readonly config:        ConfigService,
    private readonly notifService:  NotificationService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');

    try {
      const conn = await connect(url);
      const ch   = await conn.createChannel();

      this.connection = conn;
      this.channel    = ch;

      await ch.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      // DLQ — başarısız mesajlar buraya düşer
      await ch.assertQueue(`${QUEUE}.dlq`, { durable: true });

      // Ana kuyruk
      await ch.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange':    '',
          'x-dead-letter-routing-key': `${QUEUE}.dlq`,
          'x-message-ttl':             300_000, // 5 dakika
        },
      });

      // Dinlenecek routing key'ler
      const bindingKeys = [
        'invoice.approved',
        'invoice.gib.*',
        'stock.below_reorder',
        'leave.request.created',
        'purchase.order.approved',
        'waybill.#',
      ];

      for (const key of bindingKeys) {
        await ch.bindQueue(QUEUE, EXCHANGE, key);
      }

      await ch.prefetch(5);

      await ch.consume(QUEUE, (msg) => {
        if (msg) {
          this.handleMessage(msg).catch((err: Error) => {
            this.logger.error(`Mesaj işleme hatası: ${err.message}`, err.stack);
            ch.nack(msg, false, false);
          });
        }
      });

      this.logger.log(`RabbitMQ consumer başlatıldı: queue=${QUEUE} keys=${bindingKeys.join(',')}`);
    } catch (err) {
      this.logger.warn(`RabbitMQ consumer başlatılamadı: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const key     = msg.fields.routingKey;
    const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;

    this.logger.debug(`Mesaj: ${key}`);

    if (key === 'invoice.approved') {
      await this.onInvoiceApproved(payload as unknown as InvoiceApprovedPayload);
    } else if (key === 'invoice.gib.approved' || key === 'invoice.gib.rejected') {
      await this.onInvoiceGib(payload as unknown as InvoiceGibPayload);
    } else if (key === 'stock.below_reorder') {
      await this.onStockBelowReorder(payload as unknown as StockBelowReorderPayload);
    } else if (key === 'leave.request.created') {
      await this.onLeaveRequestCreated(payload as unknown as LeaveRequestPayload);
    } else if (key === 'purchase.order.approved') {
      await this.onPurchaseOrderApproved(payload as unknown as PurchaseOrderApprovedPayload);
    } else if (key.startsWith('waybill.')) {
      await this.onWaybillCreated(key, payload as unknown as WaybillCreatedPayload);
    } else {
      this.logger.debug(`Bilinmeyen routing key (atlandı): ${key}`);
    }

    this.channel?.ack(msg);
  }

  private async onInvoiceApproved(p: InvoiceApprovedPayload): Promise<void> {
    await this.notifService.create({
      tenantId:   p.tenantId,
      category:   'finans',
      level:      'info',
      title:      'Fatura Onaylandı',
      body:       `${p.invoiceNumber} — ${p.customerName} faturası onaylandı.`,
      href:       '/faturalar',
      sourceType: 'invoice',
      sourceId:   p.invoiceId,
    });
  }

  private async onInvoiceGib(p: InvoiceGibPayload): Promise<void> {
    const approved = p.status === 'GIB_ONAYLANDI';
    await this.notifService.create({
      tenantId:   p.tenantId,
      category:   'finans',
      level:      approved ? 'success' : 'error',
      title:      approved ? 'e-Fatura GİB Onayı' : 'e-Fatura GİB Reddedildi',
      body:       approved
        ? `${p.invoiceNumber} nolu fatura GİB tarafından onaylandı.`
        : `${p.invoiceNumber} nolu fatura GİB tarafından reddedildi.${p.errorMessage ? ` Neden: ${p.errorMessage}` : ''}`,
      href:       '/faturalar',
      sourceType: 'invoice',
      sourceId:   p.invoiceId,
    });
  }

  private async onStockBelowReorder(p: StockBelowReorderPayload): Promise<void> {
    await this.notifService.create({
      tenantId:   p.tenantId,
      category:   'stok',
      level:      'warning',
      title:      'Kritik Stok Uyarısı',
      body:       `${p.productName}${p.sku ? ` (${p.sku})` : ''} — Mevcut: ${p.currentStock}, Yeniden sipariş noktası: ${p.reorderPoint}${p.warehouseName ? ` (${p.warehouseName})` : ''}.`,
      href:       '/stok',
      sourceType: 'product',
      sourceId:   p.productId,
    });
  }

  private async onLeaveRequestCreated(p: LeaveRequestPayload): Promise<void> {
    await this.notifService.create({
      tenantId:   p.tenantId,
      category:   'ik',
      level:      'info',
      title:      'Yeni İzin Talebi',
      body:       `${p.employeeName} — ${p.dayCount} günlük ${p.leaveType} talebi onay bekliyor. (${p.startDate} – ${p.endDate})`,
      href:       '/izin',
      sourceType: 'leave_request',
      sourceId:   p.requestId,
    });
  }

  private async onPurchaseOrderApproved(p: PurchaseOrderApprovedPayload): Promise<void> {
    await this.notifService.create({
      tenantId:   p.tenantId,
      category:   'finans',
      level:      'info',
      title:      'Satın Alma Siparişi Onaylandı',
      body:       `${p.orderNumber} — ${p.vendorName} siparişi onaylandı.`,
      href:       '/satin-alma',
      sourceType: 'purchase_order',
      sourceId:   p.orderId,
    });
  }

  private async onWaybillCreated(
    routingKey: string,
    p: WaybillCreatedPayload,
  ): Promise<void> {
    const typeLabels: Record<string, string> = {
      'waybill.satis.created':    'Satış irsaliyesi oluşturuldu',
      'waybill.alis.created':     'Alış irsaliyesi oluşturuldu',
      'waybill.transfer.created': 'Transfer irsaliyesi oluşturuldu',
      'waybill.iade.created':     'İade irsaliyesi oluşturuldu',
    };

    const title = typeLabels[routingKey] ?? 'İrsaliye oluşturuldu';
    const body  = p.waybillNumber
      ? `${p.waybillNumber}${p.partyName ? ` — ${p.partyName}` : ''} irsaliyesi taslak olarak oluşturuldu.`
      : 'Yeni irsaliye taslak olarak oluşturuldu.';

    await this.notifService.create({
      tenantId:   p.tenantId,
      category:   'stok',
      level:      routingKey === 'waybill.iade.created' ? 'warning' : 'info',
      title,
      body,
      href:       '/irsaliyeler',
      sourceType: 'waybill',
      sourceId:   p.waybillId,
    });
  }
}

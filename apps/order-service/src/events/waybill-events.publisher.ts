import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel } from 'amqplib';

export interface DeliveryCreatedEvent {
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

export interface ReturnCreatedEvent {
  tenantId:      string;
  returnId:      string;
  returnNumber:  string;
  refType:       'sales_order';
  refId:         string;
  refNumber:     string;
  direction:     'MUSTERIDEN';
  shipDate:      string;
  partyName:     string;
  partyVknTckn?: string;
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

/**
 * order-service → waybill-service event publisher.
 * RabbitMQ hazır değilse event yoksayılır (graceful degradation).
 */
@Injectable()
export class WaybillEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaybillEventsPublisher.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
    try {
      this.connection = await connect(url);
      this.channel    = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
      this.ready = true;
      this.logger.log('RabbitMQ (waybill publisher) bağlandı');
    } catch (err) {
      this.logger.warn(`RabbitMQ bağlantısı kurulamadı (waybill events): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  publishDeliveryCreated(event: DeliveryCreatedEvent): void {
    this.publish('waybill.satis.created', event);
  }

  publishReturnCreated(event: ReturnCreatedEvent): void {
    this.publish('waybill.iade.created', event);
  }

  private publish(routingKey: string, payload: unknown): void {
    if (!this.ready || !this.channel) {
      this.logger.debug(`RabbitMQ hazır değil — event yayınlanamadı: ${routingKey}`);
      return;
    }
    this.channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      { persistent: true, contentType: 'application/json', timestamp: Math.floor(Date.now() / 1000) },
    );
    this.logger.debug(`Event yayınlandı: ${routingKey}`);
  }
}

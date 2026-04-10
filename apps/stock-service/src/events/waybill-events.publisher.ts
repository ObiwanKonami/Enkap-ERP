import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel } from 'amqplib';

export interface StockTransferCreatedEvent {
  tenantId:          string;
  movementId:        string;
  shipDate:          string;
  fromWarehouseId:   string;
  toWarehouseId:     string;
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

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';

/**
 * stock-service → waybill-service event publisher.
 * TRANSFER stok hareketi tamamlandığında TRANSFER irsaliyesi oluşturulsun.
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
      this.logger.log('RabbitMQ (stock waybill publisher) bağlandı');
    } catch (err) {
      this.logger.warn(`RabbitMQ bağlanamadı (stock waybill): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  publishTransferCreated(event: StockTransferCreatedEvent): void {
    if (!this.ready || !this.channel) return;
    this.channel.publish(
      EXCHANGE,
      'waybill.transfer.created',
      Buffer.from(JSON.stringify(event)),
      { persistent: true, contentType: 'application/json', timestamp: Math.floor(Date.now() / 1000) },
    );
    this.logger.debug(`Event yayınlandı: waybill.transfer.created movementId=${event.movementId}`);
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel } from 'amqplib';

export interface PaymentCreatedEvent {
  tenantId:        string;
  transactionId:   string;
  accountId:       string;
  transactionType: string;
  amountKurus:     number;
  transactionDate: string;
  /** Fatura referansı (referenceType === 'INVOICE' ise dolu) */
  invoiceId?:      string;
  referenceType?:  string;
  referenceId?:    string;
  description?:    string;
  createdBy:       string;
}

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';

/**
 * Treasury → Financial event publisher.
 *
 * Ödeme (TEDIYE) veya tahsilat (TAHSILAT) gerçekleştiğinde
 * financial-service'e bildirim gönderir.
 * Financial-service bu event'i dinleyerek:
 *  - AP taksitini "ödendi" olarak işaretler
 *  - Yevmiye kaydı oluşturur (320 Satıcılar / 102 Bankalar)
 */
@Injectable()
export class TreasuryEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TreasuryEventsPublisher.name);
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
      this.logger.log('RabbitMQ (treasury events publisher) bağlandı');
    } catch (err) {
      this.logger.warn(`RabbitMQ bağlanamadı (treasury): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  publishPaymentCreated(event: PaymentCreatedEvent): void {
    if (!this.ready || !this.channel) return;
    this.channel.publish(
      EXCHANGE,
      'treasury.payment.created',
      Buffer.from(JSON.stringify(event)),
      { persistent: true, contentType: 'application/json', timestamp: Math.floor(Date.now() / 1000) },
    );
    this.logger.debug(
      `Event yayınlandı: treasury.payment.created txId=${event.transactionId} invoiceId=${event.invoiceId ?? '-'}`,
    );
  }
}

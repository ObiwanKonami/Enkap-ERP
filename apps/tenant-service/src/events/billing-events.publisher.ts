import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel } from 'amqplib';

/**
 * Tenant → Billing servisine gönderilen event.
 * tenant.billing.subscription.created routing key'i ile yayınlanır.
 */
export interface SubscriptionCreatedEvent {
  tenantId:    string;
  planId:      string;
  email:       string;
  companyName: string;
  card?: {
    cardHolderName: string;
    cardNumber:     string;
    expireMonth:    string;
    expireYear:     string;
    cvc:            string;
  };
}

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';
const ROUTING_KEY   = 'tenant.billing.subscription.created';

/**
 * RabbitMQ event publisher — tenant-service → billing-service.
 *
 * Topic exchange "enkap" üzerinden olayları yayınlar.
 * RabbitMQ bağlantısı yoksa olayı yoksayar ve log'a yazar (graceful degradation).
 */
@Injectable()
export class BillingEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingEventsPublisher.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel   | null = null;
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');

    try {
      this.connection = await connect(url);
      this.channel    = await this.connection.createChannel();

      await this.channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      this.ready = true;
      this.logger.log(`RabbitMQ bağlandı: ${url} (exchange=${EXCHANGE})`);
    } catch (err) {
      // RabbitMQ yoksa servis yine de çalışır — HTTP fallback devreye girer
      this.logger.warn(
        `RabbitMQ bağlantısı kurulamadı — event publishing devre dışı: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  /**
   * Abonelik oluşturma olayını yayınlar.
   * RabbitMQ hazır değilse false döner (caller HTTP fallback uygulayabilir).
   */
  publishSubscriptionCreated(event: SubscriptionCreatedEvent): boolean {
    if (!this.ready || !this.channel) {
      this.logger.debug('RabbitMQ hazır değil — event yayınlanamadı');
      return false;
    }

    const payload = Buffer.from(JSON.stringify(event));

    this.channel.publish(
      EXCHANGE,
      ROUTING_KEY,
      payload,
      {
        persistent:  true,
        contentType: 'application/json',
        timestamp:   Math.floor(Date.now() / 1000),
        headers:     { source: 'tenant-service', version: '1' },
      },
    );

    this.logger.debug(
      `Event yayınlandı: ${ROUTING_KEY} tenant=${event.tenantId}`,
    );

    return true;
  }
}

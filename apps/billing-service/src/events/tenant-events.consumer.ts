import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { SubscriptionService } from '../subscription/subscription.service';

/** tenant.billing.subscription.created event payload */
interface SubscriptionCreatedPayload {
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
const QUEUE         = 'billing.tenant-events';
const ROUTING_KEY   = 'tenant.billing.#';

/**
 * Tenant servisinden gelen olayları tüketen RabbitMQ consumer.
 *
 * Dinlenen olaylar:
 *  - tenant.billing.subscription.created → yeni abonelik oluştur
 *
 * DLQ: Başarısız mesajlar "billing.tenant-events.dlq" kuyruğuna düşer.
 */
@Injectable()
export class TenantEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantEventsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel   | null = null;

  constructor(
    private readonly config:              ConfigService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');

    try {
      const conn = await connect(url);
      const ch   = await conn.createChannel();

      this.connection = conn;
      this.channel    = ch;

      // Exchange kur
      await ch.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      // Dead letter queue kur
      await ch.assertQueue('billing.tenant-events.dlq', { durable: true });

      // Ana kuyruk kur (DLQ bağlı)
      await ch.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange':    '',
          'x-dead-letter-routing-key': 'billing.tenant-events.dlq',
          'x-message-ttl':             60_000,
        },
      });

      await ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

      // Aynı anda max 1 mesaj işle (prefetch)
      await ch.prefetch(1);

      // Mesajları dinlemeye başla
      await ch.consume(QUEUE, (msg) => {
        if (msg) {
          this.handleMessage(msg).catch((err: Error) => {
            this.logger.error(`Mesaj işleme hatası: ${err.message}`, err.stack);
            // nack → DLQ'ya gönder, tekrar kuyruğa alma
            ch.nack(msg, false, false);
          });
        }
      });

      this.logger.log(
        `RabbitMQ consumer başlatıldı: queue=${QUEUE} routing=${ROUTING_KEY}`,
      );
    } catch (err) {
      this.logger.warn(
        `RabbitMQ consumer başlatılamadı: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();         } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close();      } catch { /* yoksay */ }
  }

  private async handleMessage(msg: ConsumeMessage): Promise<void> {
    const routingKey = msg.fields.routingKey;

    this.logger.debug(`Mesaj alındı: ${routingKey}`);

    if (routingKey === 'tenant.billing.subscription.created') {
      const payload = JSON.parse(msg.content.toString()) as SubscriptionCreatedPayload;
      await this.handleSubscriptionCreated(payload);
    } else {
      this.logger.warn(`Bilinmeyen routing key: ${routingKey} — mesaj atlandı`);
    }

    this.channel?.ack(msg);
  }

  private async handleSubscriptionCreated(
    payload: SubscriptionCreatedPayload,
  ): Promise<void> {
    this.logger.log(
      `Yeni abonelik oluşturuluyor: tenant=${payload.tenantId} plan=${payload.planId}`,
    );

    await this.subscriptionService.startSubscription({
      tenantId:    payload.tenantId,
      planId:      payload.planId,
      email:       payload.email,
      companyName: payload.companyName,
      card:        payload.card,
    });

    this.logger.log(`Abonelik oluşturuldu: tenant=${payload.tenantId}`);
  }
}

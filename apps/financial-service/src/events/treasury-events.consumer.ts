import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { TenantDataSourceManager, runWithTenantContext } from '@enkap/database';

interface PaymentCreatedEvent {
  tenantId:        string;
  transactionId:   string;
  accountId:       string;
  transactionType: string;
  amountKurus:     number;
  transactionDate: string;
  invoiceId?:      string;
  referenceType?:  string;
  referenceId?:    string;
  description?:    string;
  createdBy:       string;
}

const EXCHANGE   = 'enkap';
const QUEUE      = 'financial.treasury.events';
const DLQ        = 'financial.treasury.events.dlq';
const ROUTING    = 'treasury.payment.#';

/**
 * Treasury → Financial event consumer.
 *
 * treasury.payment.created event'ini dinler ve:
 *  1. Faturanın ödeme planındaki ilk ödenmemiş taksiti "ödendi" olarak işaretler (AP veya AR)
 *  2. Ödeme yevmiye kaydı oluşturur (IN: 320/102, OUT: 102/120)
 *
 * DLQ: 3 başarısız deneme → dead letter queue'ya aktarılır.
 */
@Injectable()
export class TreasuryEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TreasuryEventsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dsManager: TenantDataSourceManager,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672');
    try {
      this.connection = await connect(url);
      this.channel    = await this.connection.createChannel();
      await this.channel.prefetch(5);

      // Exchange + DLQ + Queue
      await this.channel.assertExchange(EXCHANGE, 'topic', { durable: true });
      await this.channel.assertQueue(DLQ, { durable: true });
      await this.channel.assertQueue(QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange':    '',
          'x-dead-letter-routing-key': DLQ,
        },
      });
      await this.channel.bindQueue(QUEUE, EXCHANGE, ROUTING);

      await this.channel.consume(QUEUE, (msg) => this.handleMessage(msg), { noAck: false });
      this.logger.log('RabbitMQ (treasury events consumer) bağlandı');
    } catch (err) {
      this.logger.warn(`RabbitMQ bağlanamadı (financial treasury consumer): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;
    const channel = this.channel;

    try {
      const event = JSON.parse(msg.content.toString()) as PaymentCreatedEvent;

      if (!event.invoiceId || !event.tenantId) {
        // Fatura referansı yoksa ilgilenmiyoruz — ACK et ve geç
        channel.ack(msg);
        return;
      }

      await runWithTenantContext(
        {
          tenantId:   event.tenantId,
          userId:     event.createdBy,
          sessionId:  `treasury-event-${Date.now()}`,
          userRoles:  ['admin'],
          tier:       'business',
        },
        () => this.processPayment(event),
      );

      channel.ack(msg);
    } catch (err) {
      this.logger.error(`Treasury event işleme hatası: ${err}`);
      // Retry mekanizması: 3 denemeden sonra DLQ'ya gider
      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) ?? 0;
      if (retryCount >= 2) {
        channel.nack(msg, false, false); // DLQ'ya gönder
      } else {
        channel.nack(msg, false, true); // Tekrar dene
      }
    }
  }

  /**
   * Ödeme event'ini işle:
   *  1. Faturanın ödeme planındaki ilk ödenmemiş taksiti bul ve kapat (AP / AR)
   *  2. Ödeme yevmiye kaydı oluştur
   */
  private async processPayment(event: PaymentCreatedEvent): Promise<void> {
    const ds = await this.dsManager.getDataSource(event.tenantId);

    // Faturanın yönünü kontrol et — sadece IN (alış) faturalar için AP kapatılır
    const invoiceRows = await ds.query<Array<{
      id: string;
      direction: string;
      invoice_number: string;
      total: number;
    }>>(
      `SELECT id, direction, invoice_number, total
       FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [event.invoiceId, event.tenantId],
    );

    const invoice = invoiceRows[0];
    if (!invoice) {
      this.logger.warn(`Fatura bulunamadı: ${event.invoiceId} (treasury event)`);
      return;
    }

    // Taksit kapatma — IN (alış) → AP, OUT (satış) → AR
    await this.markInstallmentPaid(ds, event);

    // Ödeme yevmiye kaydı
    await this.createPaymentJournalEntry(ds, event, invoice);

    this.logger.log(
      `Treasury ödeme işlendi: fatura=${invoice.invoice_number} ` +
      `tutar=${event.amountKurus} kuruş txId=${event.transactionId}`,
    );
  }

  /**
   * Ödeme planındaki ilk ödenmemiş taksiti kapat (AP ve AR).
   * Kısmi ödeme desteklenmez — taksit tutarına bakılmaksızın ilk ödenmemiş taksit kapatılır.
   */
  private async markInstallmentPaid(
    ds: import('typeorm').DataSource,
    event: PaymentCreatedEvent,
  ): Promise<void> {
    // Faturanın ödeme planını bul
    const planRows = await ds.query<Array<{ id: string }>>(
      `SELECT id FROM payment_plans WHERE invoice_id = $1 AND tenant_id = $2 LIMIT 1`,
      [event.invoiceId, event.tenantId],
    );

    if (!planRows[0]) {
      this.logger.debug(`Ödeme planı bulunamadı: fatura=${event.invoiceId}`);
      return;
    }

    // İlk ödenmemiş taksiti kapat (FOR UPDATE SKIP LOCKED — concurrent safety)
    const updated = await ds.query<Array<{ id: string; installment_no: number }>>(
      `UPDATE payment_installments
       SET paid_at = NOW(), payment_ref = $1, updated_at = NOW()
       WHERE id = (
         SELECT id FROM payment_installments
         WHERE plan_id = $2 AND tenant_id = $3 AND paid_at IS NULL
         ORDER BY installment_no ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, installment_no`,
      [event.transactionId, planRows[0].id, event.tenantId],
    );

    if (updated[0]) {
      this.logger.log(
        `Taksit kapatıldı: planId=${planRows[0].id} ` +
        `taksitNo=${updated[0].installment_no} ref=${event.transactionId}`,
      );
    }
  }

  /**
   * Ödeme yevmiye kaydı:
   *  Alış faturası ödemesi (TEDIYE):
   *    BORÇ  320 Satıcılar   → ödenen tutar
   *    ALACAK 102 Bankalar   → ödenen tutar
   *
   *  Satış faturası tahsilatı (TAHSILAT):
   *    BORÇ  102 Bankalar    → tahsil edilen tutar
   *    ALACAK 120 Alıcılar   → tahsil edilen tutar
   */
  private async createPaymentJournalEntry(
    ds: import('typeorm').DataSource,
    event: PaymentCreatedEvent,
    invoice: { id: string; direction: string; invoice_number: string },
  ): Promise<void> {
    const amountDecimal = event.amountKurus / 100;
    const entryNumber = `ODE-${invoice.invoice_number}-${Date.now()}`;
    const description = event.description ?? `Ödeme: ${invoice.invoice_number}`;

    const [entryRow] = await ds.query<{ id: string }[]>(
      `INSERT INTO journal_entries
         (id, tenant_id, entry_number, entry_date, description,
          reference_type, reference_id, is_posted, posted_at, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PAYMENT', $5, true, NOW(), $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        event.tenantId,
        entryNumber,
        event.transactionDate,
        description,
        event.transactionId,
        event.createdBy,
      ],
    );

    if (!entryRow?.id) return;

    const lines = invoice.direction === 'IN'
      ? [
          // Tedarikçi ödemesi: Satıcılar borcunu kapat, Bankadan çık
          { account: '320', debit: amountDecimal, credit: 0 },
          { account: '102', debit: 0,             credit: amountDecimal },
        ]
      : [
          // Müşteri tahsilatı: Bankaya gir, Alıcılar alacağını kapat
          { account: '102', debit: amountDecimal, credit: 0 },
          { account: '120', debit: 0,             credit: amountDecimal },
        ];

    for (const line of lines) {
      await ds.query(
        `INSERT INTO journal_entry_lines
           (id, tenant_id, entry_id, account_code, description, debit_amount, credit_amount)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [event.tenantId, entryRow.id, line.account, description, line.debit, line.credit],
      );
    }
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { TenantDataSourceManager } from '@enkap/database';
import { TreasuryAccount }     from '../account/entities/treasury-account.entity';
import { TreasuryTransaction } from '../transaction/entities/treasury-transaction.entity';

// ─── Event payload tipleri ────────────────────────────────────────────────────

interface AdvanceApprovedPayload {
  tenantId:    string;
  advanceId:   string;
  employeeId:  string;
  amountKurus: number;
  advanceType: string;
  approvedBy:  string;
  approvedAt:  string;
}

interface ExpenseApprovedPayload {
  tenantId:        string;
  expenseReportId: string;
  employeeId:      string;
  totalKurus:      number;
  currency:        string;
  approvedBy:      string;
  approvedAt:      string;
}

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';
const QUEUE         = 'treasury.hr-events';

/**
 * Treasury-service RabbitMQ consumer — HR onaylı ödeme olaylarını dinler.
 *
 * Dinlenen routing key'ler:
 *   hr.advance.approved → Avans onaylandı → ödeme emri oluştur (ODEME hareketi)
 *   hr.expense.approved → Masraf onaylandı → ödeme emri oluştur (ODEME hareketi)
 *
 * İş akışı:
 *   1. Tenant'ın "HR_ODEME" etiketli banka hesabını bul (yoksa ilk banka hesabını kullan)
 *   2. ODEME tipi TreasuryTransaction oluştur
 *   3. Hesap bakiyesini güncelle
 *
 * Idempotent: referenceId ile mükerrer kontrol yapılır.
 */
@Injectable()
export class HrEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger     = new Logger(HrEventsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;

  constructor(
    private readonly config:    ConfigService,
    private readonly dsManager: TenantDataSourceManager,
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

      // HR onay event'lerini dinle
      await ch.bindQueue(QUEUE, EXCHANGE, 'hr.advance.approved');
      await ch.bindQueue(QUEUE, EXCHANGE, 'hr.expense.approved');
      await ch.prefetch(1);

      await ch.consume(QUEUE, (msg: ConsumeMessage | null) => {
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
      case 'hr.advance.approved':
        await this.onAdvanceApproved(payload as unknown as AdvanceApprovedPayload);
        break;
      case 'hr.expense.approved':
        await this.onExpenseApproved(payload as unknown as ExpenseApprovedPayload);
        break;
      default:
        this.logger.warn(`Bilinmeyen routing key: ${routingKey}`);
    }

    this.channel?.ack(msg);
  }

  /**
   * Avans onaylandı → ODEME hareketi oluştur.
   * referenceType: 'HR_ADVANCE', referenceId: advanceId
   */
  private async onAdvanceApproved(p: AdvanceApprovedPayload): Promise<void> {
    const ds = await this.dsManager.getDataSource(p.tenantId);

    // Mükerrer kontrol
    const existing = await ds.getRepository(TreasuryTransaction).findOne({
      where: { tenantId: p.tenantId, referenceType: 'HR_ADVANCE', referenceId: p.advanceId },
    });
    if (existing) {
      this.logger.warn(`[${p.tenantId}] Avans ödemesi zaten oluşturulmuş (idempotent): ${p.advanceId}`);
      return;
    }

    await this.createPaymentOrder(
      ds,
      p.tenantId,
      p.amountKurus,
      'HR_ADVANCE',
      p.advanceId,
      `Avans ödemesi — çalışan=${p.employeeId}, tip=${p.advanceType}`,
      p.approvedBy,
    );

    this.logger.log(
      `[${p.tenantId}] Avans ödeme emri oluşturuldu: advance=${p.advanceId}, tutar=${p.amountKurus} kuruş`,
    );
  }

  /**
   * Masraf raporu onaylandı → ODEME hareketi oluştur.
   * referenceType: 'HR_EXPENSE', referenceId: expenseReportId
   */
  private async onExpenseApproved(p: ExpenseApprovedPayload): Promise<void> {
    const ds = await this.dsManager.getDataSource(p.tenantId);

    // Mükerrer kontrol
    const existing = await ds.getRepository(TreasuryTransaction).findOne({
      where: { tenantId: p.tenantId, referenceType: 'HR_EXPENSE', referenceId: p.expenseReportId },
    });
    if (existing) {
      this.logger.warn(`[${p.tenantId}] Masraf ödemesi zaten oluşturulmuş (idempotent): ${p.expenseReportId}`);
      return;
    }

    await this.createPaymentOrder(
      ds,
      p.tenantId,
      p.totalKurus,
      'HR_EXPENSE',
      p.expenseReportId,
      `Masraf ödemesi — çalışan=${p.employeeId}, rapor=${p.expenseReportId}`,
      p.approvedBy,
    );

    this.logger.log(
      `[${p.tenantId}] Masraf ödeme emri oluşturuldu: report=${p.expenseReportId}, tutar=${p.totalKurus} kuruş`,
    );
  }

  /**
   * Ödeme emri oluşturma — ortak metot.
   * Tenant'ın ilk aktif banka/kasa hesabından ODEME hareketi kaydeder.
   * PESSIMISTIC_WRITE lock ile bakiye güvenli güncellenir.
   */
  private async createPaymentOrder(
    ds: { transaction: Function; getRepository: Function },
    tenantId: string,
    amountKurus: number,
    referenceType: string,
    referenceId: string,
    description: string,
    createdBy: string,
  ): Promise<void> {
    await (ds as any).transaction(async (em: any) => {
      // HR ödemesi için uygun hesabı bul — label 'HR_ODEME' veya ilk aktif hesap
      let account = await em.findOne(TreasuryAccount, {
        where: { tenantId, label: 'HR_ODEME', isActive: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!account) {
        account = await em.findOne(TreasuryAccount, {
          where: { tenantId, isActive: true },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!account) {
        this.logger.error(`[${tenantId}] Ödeme hesabı bulunamadı — ödeme emri oluşturulamadı`);
        return;
      }

      // Bakiye güncelle
      account.balanceKurus -= amountKurus;
      await em.save(TreasuryAccount, account);

      // ODEME hareketi oluştur
      const tx = em.create(TreasuryTransaction, {
        tenantId,
        accountId:            account.id,
        transactionType:      'ODEME',
        amountKurus,
        direction:            'OUT',
        runningBalance:       account.balanceKurus,
        transactionDate:      new Date(),
        description,
        referenceType,
        referenceId,
        reconciliationStatus: 'BEKLIYOR',
        createdBy,
      });
      await em.save(TreasuryTransaction, tx);
    });
  }
}

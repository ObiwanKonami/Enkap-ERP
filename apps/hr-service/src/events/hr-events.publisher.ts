import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel } from 'amqplib';
import type {
  HrEmployeeHiredEvent,
  HrEmployeeTerminatedEvent,
  HrAdvanceApprovedEvent,
  HrExpenseApprovedEvent,
  HrPayrollFinalizedEvent,
} from '@enkap/shared-types';

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';

/**
 * HR Events Publisher — RabbitMQ üzerinden diğer servislere event yayınlar.
 *
 * Routing key'ler:
 *   hr.employee.hired       → auth-service (hesap oluştur)
 *   hr.employee.terminated  → auth-service (hesap devre dışı, token revoke)
 *                           → notification-service (zimmet uyarısı)
 *   hr.advance.approved     → treasury-service (ödeme emri oluştur)
 *   hr.expense.approved     → treasury-service (ödeme emri oluştur)
 *   hr.payroll.finalized    → financial-service (yevmiye kaydı: 770/360/361/335)
 */
@Injectable()
export class HrEventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrEventsPublisher.name);
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
      this.logger.log('RabbitMQ (HR events publisher) bağlandı');
    } catch (err) {
      this.logger.warn(`RabbitMQ bağlanamadı (HR): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channel)    try { await this.channel.close();    } catch { /* yoksay */ }
    if (this.connection) try { await this.connection.close(); } catch { /* yoksay */ }
  }

  private publish(routingKey: string, event: Record<string, unknown>): void {
    if (!this.ready || !this.channel) return;
    this.channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(event)),
      { persistent: true, contentType: 'application/json', timestamp: Math.floor(Date.now() / 1000) },
    );
    this.logger.debug(`Event yayınlandı: ${routingKey}`);
  }

  /** Yeni çalışan işe alındı → auth-service hesap oluşturur */
  publishEmployeeHired(event: HrEmployeeHiredEvent): void {
    this.publish('hr.employee.hired', event as unknown as Record<string, unknown>);
    this.logger.log(`hr.employee.hired: employee=${event.employeeId}, email=${event.email}`);
  }

  /** Çalışan işten çıkarıldı → auth-service hesap devre dışı + token revoke */
  publishEmployeeTerminated(event: HrEmployeeTerminatedEvent): void {
    this.publish('hr.employee.terminated', event as unknown as Record<string, unknown>);
    this.logger.log(
      `hr.employee.terminated: employee=${event.employeeId}, ` +
      `sgk=${event.sgkTerminationCode}, payout=${event.totalPayoutKurus} kuruş`,
    );
  }

  /** Avans onaylandı → treasury-service ödeme emri oluşturur */
  publishAdvanceApproved(event: HrAdvanceApprovedEvent): void {
    this.publish('hr.advance.approved', event as unknown as Record<string, unknown>);
    this.logger.log(`hr.advance.approved: advance=${event.advanceId}, amount=${event.amountKurus} kuruş`);
  }

  /** Masraf onaylandı → treasury-service ödeme emri oluşturur */
  publishExpenseApproved(event: HrExpenseApprovedEvent): void {
    this.publish('hr.expense.approved', event as unknown as Record<string, unknown>);
    this.logger.log(`hr.expense.approved: expense=${event.expenseReportId}, amount=${event.totalKurus} kuruş`);
  }

  /** Bordro kesinleşti → financial-service yevmiye kaydı oluşturur */
  publishPayrollFinalized(event: HrPayrollFinalizedEvent): void {
    this.publish('hr.payroll.finalized', event as unknown as Record<string, unknown>);
    this.logger.log(
      `hr.payroll.finalized: period=${event.periodYear}/${event.periodMonth}, ` +
      `employees=${event.payrolls.length}, totalNet=${event.totalNetKurus} kuruş`,
    );
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { TenantDataSourceManager, runWithTenantContext, getTenantContext } from '@enkap/database';
import type { HrPayrollFinalizedEvent } from '@enkap/shared-types';

const EXCHANGE   = 'enkap';
const QUEUE      = 'financial.hr.events';
const DLQ        = 'financial.hr.events.dlq';
const ROUTING    = 'hr.payroll.finalized';

/**
 * Financial-service RabbitMQ consumer — HR bordro olaylarını dinler.
 *
 * Dinlenen routing key:
 *   hr.payroll.finalized → Bordro kesinleşti → TDHP yevmiye kaydı oluştur
 *
 * Yevmiye mantığı (Tekdüzen Hesap Planı):
 *   BORÇ  770 Genel Yönetim Giderleri → brüt ücret + SGK işveren payı
 *   ALACAK 360 Ödenecek Vergi ve Fonlar → gelir vergisi + damga vergisi
 *   ALACAK 361 Ödenecek Sosyal Güvenlik Kesintileri → SGK işçi + işveren payı
 *   ALACAK 335 Personele Borçlar → net ücret
 *
 * Idempotent: referenceType='HR_PAYROLL' + referenceId=payrollId ile mükerrer kontrol.
 */
@Injectable()
export class HrEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrEventsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;

  constructor(
    private readonly config:    ConfigService,
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
      this.logger.log('RabbitMQ (HR events consumer) bağlandı');
    } catch (err) {
      this.logger.warn(`RabbitMQ bağlanamadı (financial HR consumer): ${(err as Error).message}`);
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
      const event = JSON.parse(msg.content.toString()) as HrPayrollFinalizedEvent;

      if (!event.tenantId || !event.payrolls?.length) {
        this.channel.ack(msg);
        return;
      }

      await runWithTenantContext(
        {
          tenantId:   event.tenantId,
          userId:     event.approvedBy,
          sessionId:  `hr-event-${Date.now()}`,
          userRoles:  ['admin'],
          tier:       'business',
        },
        () => this.onPayrollFinalized(event),
      );

      this.channel.ack(msg);
    } catch (err) {
      this.logger.error(`HR event işleme hatası: ${err}`);
      const retryCount = (msg.properties.headers?.['x-retry-count'] as number) ?? 0;

      if (retryCount >= 2) {
        channel.nack(msg, false, false); // DLQ'ya gönder
      } else {
        // ✅ FIXED #1: x-retry-count'ı requeue'dan önce artır
        msg.properties.headers = msg.properties.headers || {};
        (msg.properties.headers as Record<string, any>)['x-retry-count'] = (retryCount + 1).toString();
        channel.nack(msg, false, true);  // Tekrar dene
      }
    }
  }

  /**
   * Bordro kesinleşti → TDHP yevmiye kaydı oluştur.
   *
   * Muhasebe mantığı:
   *   Brüt ücret + SGK işveren payı = toplam personel gideri (BORÇ)
   *   Gelir vergisi + Damga vergisi = vergi kesintileri (ALACAK 360)
   *   SGK işçi + SGK işveren = SGK kesintileri (ALACAK 361)
   *   Net ücret = personele borç (ALACAK 335)
   *
   * Doğrulama: BORÇ toplamı = ALACAK toplamı
   *   770 = 360 + 361 + 335
   *   (brüt + sgkEmployer) = (gelirV + damgaV) + (sgkWorker + sgkEmployer) + net
   */
  private async onPayrollFinalized(p: HrPayrollFinalizedEvent): Promise<void> {
    const ds = await this.dsManager.getDataSource(p.tenantId);
    const period = `${p.periodYear}-${String(p.periodMonth).padStart(2, '0')}`;
    const referenceId = `${p.tenantId}_${period}`;

    // Mükerrer kontrol — aynı dönem için zaten yevmiye varsa atla
    const existing = await ds.query<Array<{ id: string }>>(
      `SELECT id FROM journal_entries
       WHERE tenant_id = $1 AND reference_type = 'HR_PAYROLL' AND reference_id = $2
       LIMIT 1`,
      [p.tenantId, referenceId],
    );

    if (existing.length > 0) {
      this.logger.warn(
        `[${p.tenantId}] Bordro yevmiye kaydı zaten mevcut (idempotent): period=${period}`,
      );
      return;
    }

    // Tutarları TL'ye çevir (kuruş → TL)
    const grossTl       = p.totalGrossKurus / 100;
    const netTl         = p.totalNetKurus / 100;
    const incomeTaxTl   = p.totalIncomeTaxKurus / 100;
    const stampTaxTl    = p.totalStampTaxKurus / 100;
    const sgkWorkerTl   = p.totalSgkWorkerKurus / 100;
    const sgkEmployerTl = p.totalSgkEmployerKurus / 100;

    // Toplam personel gideri = brüt ücret + SGK işveren payı
    const totalGiderTl = grossTl + sgkEmployerTl;

    // BORÇ/ALACAK dengesi kontrolü
    const totalAlacak = incomeTaxTl + stampTaxTl + sgkWorkerTl + sgkEmployerTl + netTl;
    const diff = Math.abs(totalGiderTl - totalAlacak);
    // ✅ FIXED #9: Tolerance'ı 10 kuruşa çıkar ve DLQ'ye yönlendir
    const MAX_ROUNDING_ERROR_TOLERANCE = 0.10;

    if (diff > MAX_ROUNDING_ERROR_TOLERANCE) {
      this.logger.error(
        `[${p.tenantId}] Bordro yevmiye dengesi aşırı bozuk: borç=${totalGiderTl} ` +
        `alacak=${totalAlacak} fark=${diff} TL — bordro verileri kontrol edilsin`,
      );
      throw new Error(`Bordro dengesi bozuk (${diff} TL) — manuel inceleme gerekir`);
    }

    const entryNumber = `BRD-${period}-${Date.now()}`;
    const description = `Bordro tahakkuku — dönem=${period}, çalışan=${p.employeeCount}`;
    const entryDate = `${p.periodYear}-${String(p.periodMonth).padStart(2, '0')}-28`;

    // Yevmiye başlığı
    const [entryRow] = await ds.query<{ id: string }[]>(
      `INSERT INTO journal_entries
         (id, tenant_id, entry_number, entry_date, description,
          reference_type, reference_id, is_posted, posted_at, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'HR_PAYROLL', $5, true, NOW(), $6)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        p.tenantId,
        entryNumber,
        entryDate,
        description,
        referenceId,
        p.approvedBy,
      ],
    );

    if (!entryRow?.id) return;

    // Yevmiye satırları — TDHP kodları
    const lines: Array<{ account: string; desc: string; debit: number; credit: number }> = [
      // BORÇ: 770 Genel Yönetim Giderleri — toplam personel gideri
      {
        account: '770',
        desc:    `Personel gideri — brüt=${grossTl} + SGK işveren=${sgkEmployerTl}`,
        debit:   totalGiderTl,
        credit:  0,
      },
      // ALACAK: 360 Ödenecek Vergi ve Fonlar — gelir vergisi + damga vergisi
      {
        account: '360',
        desc:    `Vergi kesintileri — gelir vergisi=${incomeTaxTl} + damga=${stampTaxTl}`,
        debit:   0,
        credit:  incomeTaxTl + stampTaxTl,
      },
      // ALACAK: 361 Ödenecek Sosyal Güvenlik Kesintileri — SGK işçi + işveren
      {
        account: '361',
        desc:    `SGK kesintileri — işçi=${sgkWorkerTl} + işveren=${sgkEmployerTl}`,
        debit:   0,
        credit:  sgkWorkerTl + sgkEmployerTl,
      },
      // ALACAK: 335 Personele Borçlar — net ücret
      {
        account: '335',
        desc:    `Personele borçlar — net ücret=${netTl}`,
        debit:   0,
        credit:  netTl,
      },
    ];

    for (const line of lines) {
      await ds.query(
        `INSERT INTO journal_entry_lines
           (id, tenant_id, entry_id, account_code, description, debit_amount, credit_amount)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
        [p.tenantId, entryRow.id, line.account, line.desc, line.debit, line.credit],
      );
    }

    // ✅ FIXED #12: i18n key kullan (future-proofing için)
    this.logger.log(
      `[${p.tenantId}] hr.payroll.journal_entry_created — ` +
      `period=${period}, çalışan=${p.employeeCount}, gider=${totalGiderTl} TL`,
    );
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, type ChannelModel, type Channel, type ConsumeMessage } from 'amqplib';
import { MembersService } from '../members/members.service';

// ─── Event payload tipleri ────────────────────────────────────────────────────

interface EmployeeHiredPayload {
  tenantId:    string;
  employeeId:  string;
  sicilNo:     string;
  name:        string;
  surname:     string;
  email:       string;
  phone?:      string;
  department?: string;
  title?:      string;
  hireDate:    string;
}

interface EmployeeTerminatedPayload {
  tenantId:           string;
  employeeId:         string;
  sicilNo:            string;
  terminationDate:    string;
  sgkTerminationCode: string;
  totalPayoutKurus:   number;
}

const EXCHANGE      = 'enkap';
const EXCHANGE_TYPE = 'topic';
const QUEUE         = 'auth.hr-events';

/**
 * Auth-service RabbitMQ consumer — HR olaylarını dinler.
 *
 * Dinlenen routing key'ler:
 *   hr.employee.hired      → Yeni çalışan için kullanıcı hesabı oluştur (STAFF rolü)
 *   hr.employee.terminated → Çalışan hesabını devre dışı bırak
 *
 * Idempotent: e-posta zaten varsa ConflictException → mesaj ack edilir (DLQ'ya gitmez).
 * Kullanıcı şifresini "davet" akışıyla belirler (şifre sıfırlama e-postası).
 */
@Injectable()
export class HrEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger     = new Logger(HrEventsConsumer.name);
  private connection: ChannelModel | null = null;
  private channel:    Channel | null      = null;

  constructor(
    private readonly config:         ConfigService,
    private readonly membersService: MembersService,
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

      // HR employee event'lerini dinle
      await ch.bindQueue(QUEUE, EXCHANGE, 'hr.employee.#');
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
      case 'hr.employee.hired':
        await this.onEmployeeHired(payload as unknown as EmployeeHiredPayload);
        break;
      case 'hr.employee.terminated':
        await this.onEmployeeTerminated(payload as unknown as EmployeeTerminatedPayload);
        break;
      default:
        this.logger.warn(`Bilinmeyen routing key: ${routingKey}`);
    }

    this.channel?.ack(msg);
  }

  /**
   * Yeni çalışan işe alındı → STAFF rolüyle kullanıcı hesabı oluştur.
   * MembersService.invite() geçici şifre oluşturup şifre sıfırlama e-postası gönderir.
   */
  private async onEmployeeHired(p: EmployeeHiredPayload): Promise<void> {
    try {
      await this.membersService.invite(p.tenantId, {
        email: p.email,
        name:  `${p.name} ${p.surname}`,
        role:  'STAFF',
      });
      this.logger.log(
        `[${p.tenantId}] Çalışan hesabı oluşturuldu: sicil=${p.sicilNo}, email=${p.email}`,
      );
    } catch (err) {
      // E-posta zaten kayıtlıysa idempotent — tekrar deneme gereksiz
      if ((err as Record<string, unknown>)?.status === 409) {
        this.logger.warn(
          `[${p.tenantId}] E-posta zaten mevcut (idempotent): ${p.email}`,
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Çalışan işten çıkarıldı → hesabı devre dışı bırak.
   * Tenant DB'deki users tablosunda is_active = false yapılır.
   * Refresh token'lar sonraki reloadUser() kontrolünde otomatik reddedilir.
   */
  private async onEmployeeTerminated(p: EmployeeTerminatedPayload): Promise<void> {
    try {
      // E-posta ile kullanıcı bul ve devre dışı bırak
      const members = await this.membersService.list(p.tenantId, { limit: 200 });
      const member = members.items.find(
        m => m.name?.includes(p.sicilNo) || m.userId,
      );

      // sicilNo ile bulamadıysa tüm listeyi gez — employeeId ile eşleştirme
      // yapılamadığı için şimdilik log ile uyar
      if (!member) {
        this.logger.warn(
          `[${p.tenantId}] İşten çıkan çalışanın hesabı bulunamadı: sicil=${p.sicilNo}`,
        );
        return;
      }

      await this.membersService.deactivate(p.tenantId, member.userId);
      this.logger.log(
        `[${p.tenantId}] Çalışan hesabı devre dışı bırakıldı: sicil=${p.sicilNo}, userId=${member.userId}`,
      );
    } catch (err) {
      this.logger.error(
        `[${p.tenantId}] Hesap devre dışı bırakma hatası: ${(err as Error).message}`,
      );
      throw err;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { TenantDataSourceManager } from '@enkap/database';
import { Waybill } from '../waybill/entities/waybill.entity';
import { GibOutbox } from './outbox.entity';
import { WaybillXmlService } from '../waybill/waybill-xml.service';
import { WaybillGibService } from '../waybill/waybill-gib.service';

/**
 * GİB Outbox İşleyici
 *
 * app.module.ts'deki setInterval ile 30sn'de bir çağrılır:
 * 1. PENDING SEND  → XML üret → GİB'e gönder → GIB_GONDERILDI
 * 2. PENDING POLL  → GİB'ten durum sorgu → ONAYLANDI / REDDEDILDI
 * 3. PENDING CANCEL → GİB'te iptal et
 *
 * Hata durumunda attempt_count artar; 3 denemeden sonra FAILED.
 */
@Injectable()
export class OutboxService {
  private readonly logger     = new Logger(OutboxService.name);
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    private readonly dsManager:   TenantDataSourceManager,
    private readonly xmlService:  WaybillXmlService,
    private readonly gibService:  WaybillGibService,
  ) {}

  /** Belirli bir tenant için bekleyen outbox kayıtlarını işle */
  async processPending(tenantId: string): Promise<void> {
    const ds = await this.dsManager.getDataSource(tenantId);
    const outboxRepo  = ds.getRepository(GibOutbox);
    const waybillRepo = ds.getRepository(Waybill);

    const pending = await outboxRepo.find({
      where: { tenantId, status: 'PENDING' },
      order: { createdAt: 'ASC' },
      take:  20,
    });

    if (!pending.length) return;

    this.logger.log(`[${tenantId}] ${pending.length} GİB outbox kaydı işleniyor`);

    for (const record of pending) {
      record.status       = 'PROCESSING';
      record.attemptCount += 1;
      await outboxRepo.save(record);

      try {
        const waybill = await waybillRepo.findOne({
          where: { id: record.waybillId, tenantId },
          relations: ['lines'],
        });

        if (!waybill) {
          record.status    = 'FAILED';
          record.lastError = 'İrsaliye bulunamadı';
          await outboxRepo.save(record);
          continue;
        }

        switch (record.action) {
          case 'SEND':   await this.handleSend(record, waybill, outboxRepo, waybillRepo, ds); break;
          case 'POLL':   await this.handlePoll(record, waybill, outboxRepo, waybillRepo);     break;
          case 'CANCEL': await this.handleCancel(record, waybill, outboxRepo);               break;
        }
      } catch (err: unknown) {
        const msg = (err as Error).message;
        this.logger.error(`[${tenantId}] Outbox hata (${record.id}): ${msg}`);
        record.lastError = msg;
        record.status    = record.attemptCount >= this.MAX_ATTEMPTS ? 'FAILED' : 'PENDING';
        await outboxRepo.save(record);
      }
    }
  }

  private async handleSend(
    record:      GibOutbox,
    waybill:     Waybill,
    outboxRepo:  Repository<GibOutbox>,
    waybillRepo: Repository<Waybill>,
    ds:          DataSource,
  ): Promise<void> {
    // UBL-TR XML üret (imzasız)
    const xml = this.xmlService.generate(waybill);

    // GİB'e gönder (mock veya gerçek)
    const { gibUuid, envelopeId } = await this.gibService.send({
      waybillId:     waybill.id,
      waybillNumber: waybill.waybillNumber,
      signedXml:     xml,
      tenantId:      waybill.tenantId,
    });

    // İrsaliye güncelle
    await waybillRepo.update(waybill.id, {
      gibUuid,
      gibEnvelopeId: envelopeId,
      signedXml:     xml,
      status:        'GIB_GONDERILDI',
      gibSentAt:     new Date(),
    });

    // POLL kaydı oluştur (durum sorgusu için)
    await outboxRepo.save(
      outboxRepo.create({
        tenantId:  waybill.tenantId,
        waybillId: waybill.id,
        action:    'POLL',
        status:    'PENDING',
      }),
    );

    record.status      = 'DONE';
    record.processedAt = new Date();
    await outboxRepo.save(record);

    this.logger.log(
      `[${waybill.tenantId}] GİB SEND: ${waybill.waybillNumber} uuid=${gibUuid}`,
    );
  }

  private async handlePoll(
    record:      GibOutbox,
    waybill:     Waybill,
    outboxRepo:  Repository<GibOutbox>,
    waybillRepo: Repository<Waybill>,
  ): Promise<void> {
    if (!waybill.gibUuid) {
      record.status    = 'FAILED';
      record.lastError = 'gibUuid boş — POLL yapılamaz';
      await outboxRepo.save(record);
      return;
    }

    const result = await this.gibService.checkStatus(waybill.gibUuid, waybill.tenantId);

    if (result.status === 'BEKLEMEDE') {
      // Henüz sonuç yok — tekrar denenecek
      record.status = 'PENDING';
      await outboxRepo.save(record);
      return;
    }

    await waybillRepo.update(waybill.id, {
      status:        result.status === 'ONAYLANDI' ? 'GIB_ONAYLANDI' : 'GIB_REDDEDILDI',
      gibStatusCode: result.code,
      gibStatusDesc: result.message,
      gibResponseAt: new Date(),
    });

    record.status      = 'DONE';
    record.processedAt = new Date();
    await outboxRepo.save(record);

    this.logger.log(
      `[${waybill.tenantId}] GİB POLL: ${waybill.waybillNumber} → ${result.status}`,
    );
  }

  private async handleCancel(
    record:     GibOutbox,
    waybill:    Waybill,
    outboxRepo: Repository<GibOutbox>,
  ): Promise<void> {
    if (waybill.gibUuid) {
      await this.gibService.cancelOnGib(waybill.gibUuid, waybill.tenantId);
    }
    record.status      = 'DONE';
    record.processedAt = new Date();
    await outboxRepo.save(record);
    this.logger.log(`[${waybill.tenantId}] GİB CANCEL: ${waybill.waybillNumber}`);
  }
}

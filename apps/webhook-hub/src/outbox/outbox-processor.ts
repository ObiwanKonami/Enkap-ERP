import { OutboxRepository } from './outbox.repository';
import { deliverWebhook } from '../delivery/webhook-delivery.service';
import { nextAttemptAt, isDead } from '../delivery/retry.strategy';

/** Polling aralığı: 5 saniye */
const POLL_INTERVAL_MS = 5_000;

/** Batch başına işlenecek maksimum olay sayısı */
const BATCH_SIZE = 50;

/**
 * Outbox polling motoru.
 *
 * Davranış:
 *  - Her 5 saniyede bir outbox_events tablosunu SKIP LOCKED ile okur
 *  - Her olay için tenant'ın eşleşen aboneliklerini bulur
 *  - Her aboneliğe paralel teslimat dener
 *  - Başarı → 'sent', hata → retry planla veya 'dead'
 *  - Hiç abonelik yoksa olay direkt 'sent' sayılır (sessiz drop)
 *
 * Ölçekleme:
 *  - SKIP LOCKED sayesinde birden fazla instance sorunsuz çalışır
 *  - Her instance aynı eventi işlemez
 */
export class OutboxProcessor {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;

  constructor(private readonly repo: OutboxRepository) {}

  /** Polling döngüsünü başlatır */
  start(): void {
    console.log(
      `[Processor] Outbox polling başlatıldı (interval=${POLL_INTERVAL_MS}ms, batch=${BATCH_SIZE})`,
    );
    this.timer = setInterval(() => {
      // Önceki batch hâlâ işleniyorsa atla
      if (!this.processing) {
        void this.processBatch();
      }
    }, POLL_INTERVAL_MS);
  }

  /** Polling döngüsünü durdurur */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Processor] Outbox polling durduruldu.');
  }

  /**
   * Tek bir batch işlemi.
   * Tüm olayları paralel işler (aralarında bağımlılık yok).
   */
  private async processBatch(): Promise<void> {
    this.processing = true;

    try {
      const events = await this.repo.claimPendingEvents(BATCH_SIZE);

      if (!events.length) {
        return; // Bekleyen olay yok
      }

      console.log(`[Processor] ${events.length} olay işleniyor...`);

      // Her olayı paralel işle
      await Promise.allSettled(
        events.map((event) => this.processEvent(event)),
      );

    } catch (err) {
      console.error('[Processor] Batch hatası:', (err as Error).message);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Tek bir olayı işler:
   *  1. Eşleşen abonelikleri bul
   *  2. Her aboneliğe paralel teslimat yap
   *  3. En az bir başarı varsa → sent, tümü hata → failed/dead
   */
  private async processEvent(
    event: { id: string; tenantId: string; eventType: string; attempts: number;
             payload: Record<string, unknown>; status: string }
  ): Promise<void> {
    try {
      const subscriptions = await this.repo.getMatchingSubscriptions(
        event.tenantId,
        event.eventType,
      );

      // Hiç abonelik yoksa sessizce tamamla
      if (!subscriptions.length) {
        await this.repo.markSent(event.id);
        return;
      }

      // Tüm aboneliklere paralel teslimat
      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          const result = await deliverWebhook(
            {
              id: event.id,
              tenantId: event.tenantId,
              eventType: event.eventType,
              payload: event.payload,
              status: event.status as 'pending',
              attempts: event.attempts,
              nextAttemptAt: new Date(),
              lastError: null,
              createdAt: new Date(),
              processedAt: null,
            },
            sub,
          );

          // Teslimat log'u kaydet (hata da olsa)
          await this.repo.logDelivery(
            event.id,
            sub.id,
            event.attempts + 1,
            result.httpStatus,
            result.error ?? null,
            result.durationMs,
          ).catch((logErr) => {
            console.warn('[Processor] Log kaydı başarısız:', (logErr as Error).message);
          });

          return result;
        }),
      );

      // En az bir başarılı teslimat varsa olay tamamlandı
      const anySuccess = results.some(
        (r) => r.status === 'fulfilled' && r.value.success,
      );

      if (anySuccess) {
        await this.repo.markSent(event.id);
        console.log(
          `[Processor] ✓ Teslim edildi: eventId=${event.id} type=${event.eventType}`,
        );
      } else {
        // Tüm teslimatlar başarısız
        const firstError = results
          .map((r) => (r.status === 'fulfilled' ? r.value.error : (r as PromiseRejectedResult).reason))
          .filter(Boolean)[0];

        const errorMsg = String(firstError ?? 'Bilinmeyen hata');
        const nextAttempt = nextAttemptAt(event.attempts + 1);

        await this.repo.markFailed(event.id, errorMsg, nextAttempt);

        if (isDead(event.attempts + 1)) {
          console.warn(
            `[Processor] ✗ Dead-letter: eventId=${event.id} type=${event.eventType}`,
          );
        } else {
          console.warn(
            `[Processor] ✗ Yeniden denenecek: eventId=${event.id} ` +
            `sonraki=${nextAttempt?.toISOString() ?? 'yok'}`,
          );
        }
      }
    } catch (err) {
      console.error(
        `[Processor] İşlem hatası: eventId=${event.id}`,
        (err as Error).message,
      );
    }
  }
}

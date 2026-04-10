/**
 * Webhook yeniden deneme zamanlama stratejisi.
 *
 * Maksimum 5 deneme, üstel geri-çekilme:
 *  Deneme 1 → hemen
 *  Deneme 2 → +1 saniye
 *  Deneme 3 → +5 saniye
 *  Deneme 4 → +30 saniye
 *  Deneme 5 → +5 dakika
 *
 * 5 denemeden sonra status = 'dead' (dead-letter).
 */

const MAX_ATTEMPTS = 5;

/** Saniye cinsinden bekleme süresi (deneme sırası 0-indexed) */
const BACKOFF_SECONDS = [0, 1, 5, 30, 300] as const;

/**
 * Bir sonraki deneme zamanını hesaplar.
 * @param attempt Mevcut deneme sayısı (başarısız olan)
 * @returns Bir sonraki deneme zamanı; null ise dead-letter
 */
export function nextAttemptAt(attempt: number): Date | null {
  if (attempt >= MAX_ATTEMPTS) return null; // dead

  const delaySec = BACKOFF_SECONDS[attempt] ?? 300;
  const next = new Date();
  next.setSeconds(next.getSeconds() + delaySec);
  return next;
}

/**
 * Mevcut deneme sayısına göre ölü mü?
 */
export function isDead(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}

export { MAX_ATTEMPTS };

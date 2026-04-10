import { randomUUID } from 'crypto';
import { signPayload, decryptSecret } from './hmac';
import type { OutboxEvent, WebhookSubscription, DeliveryResult } from '../types';

/** Teslimat HTTP timeout — alıcı en fazla bu kadar sürede yanıt vermeli */
const DELIVERY_TIMEOUT_MS = 10_000; // 10 saniye

/**
 * Webhook teslimat motoru.
 *
 * Her teslimat:
 *  1. Payload'ı JSON'a serialize et
 *  2. HMAC-SHA256 imzası üret (X-Enkap-Signature header'ı)
 *  3. HTTPS POST gönder (10 saniye timeout)
 *  4. 2xx → başarılı, diğerleri → hata
 *
 * Alıcı endpoint'in 2xx dönmesi yeterli — response body önemsiz.
 */
export async function deliverWebhook(
  event: OutboxEvent,
  subscription: WebhookSubscription,
): Promise<DeliveryResult> {
  const deliveryId = randomUUID();
  const timestamp  = Math.floor(Date.now() / 1000); // Unix saniye
  const startMs    = Date.now();

  const body = JSON.stringify({
    id:        deliveryId,
    eventType: event.eventType,
    tenantId:  event.tenantId,
    timestamp,
    data:      event.payload,
  });

  // Abonelik secret'ını çöz ve imzala
  const secret    = decryptSecret(subscription.secretEnc);
  const signature = signPayload(body, secret);

  try {
    const response = await fetch(subscription.url, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'X-Enkap-Signature':  signature,
        'X-Enkap-Event':      event.eventType,
        'X-Enkap-Delivery':   deliveryId,
        'X-Enkap-Timestamp':  String(timestamp),
        'User-Agent':         'Enkap-Webhook/1.0',
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    const durationMs = Date.now() - startMs;

    if (response.ok) {
      return { success: true, httpStatus: response.status, durationMs };
    }

    // 4xx/5xx → hata (retry planlanacak)
    const responseText = await response.text().catch(() => '');
    return {
      success:    false,
      httpStatus: response.status,
      durationMs,
      error:      `HTTP ${response.status}: ${responseText.slice(0, 200)}`,
    };

  } catch (err) {
    const durationMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);

    return {
      success:    false,
      httpStatus: null,
      durationMs,
      error:      message.slice(0, 500),
    };
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import type { PushNotificationPayload } from './notification-templates';

/**
 * Firebase Cloud Messaging Servisi.
 *
 * Başlatma: FIREBASE_SERVICE_ACCOUNT ortam değişkeninden JSON okur.
 * Production'da Vault Agent bu değişkeni inject eder.
 *
 * KVKK: FCM üçüncü taraf (Google) — bildirim gövdesinde KİŞİSEL VERİ yok.
 * Sadece referans numaraları ve genel mesajlar gönderilir.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: admin.messaging.Messaging | null = null;

  onModuleInit(): void {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!serviceAccountJson) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT ortam değişkeni bulunamadı — FCM devre dışı',
      );
      return;
    }

    try {
      // Firebase Admin SDK zaten başlatıldıysa mevcut örneği kullan
      if (admin.apps.length === 0) {
        const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }

      this.messaging = admin.messaging();
      this.logger.log('Firebase Admin SDK başlatıldı');
    } catch (err) {
      this.logger.error('Firebase Admin SDK başlatma hatası', err);
    }
  }

  /**
   * Tek bir FCM tokenına bildirim gönderir.
   * @returns true → başarılı, false → token geçersiz (silinmeli)
   */
  async sendToToken(
    fcmToken: string,
    payload: PushNotificationPayload,
  ): Promise<boolean> {
    if (!this.messaging) {
      this.logger.debug('FCM devre dışı — bildirim atlandı');
      return true;
    }

    const isSilent = payload.data?.['silent'] === 'true';

    try {
      await this.messaging.send({
        token: fcmToken,
        // Sessiz bildirim → sadece data (notification bloğu yok)
        ...(isSilent
          ? {}
          : {
              notification: {
                title: payload.title,
                body: payload.body,
                ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
              },
            }),
        data: payload.data ?? {},
        android: {
          priority: isSilent ? 'normal' : 'high',
          ...(isSilent
            ? {}
            : {
                notification: {
                  channelId: 'enkap_default',
                  clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                },
              }),
        },
        apns: {
          headers: {
            'apns-priority': isSilent ? '5' : '10',
            'apns-push-type': isSilent ? 'background' : 'alert',
          },
          payload: {
            aps: isSilent
              ? { 'content-available': 1 }
              : { alert: { title: payload.title, body: payload.body }, sound: 'default' },
          },
        },
      });

      return true;
    } catch (err) {
      return this.handleSendError(err, fcmToken);
    }
  }

  /**
   * Birden fazla tokena aynı bildirimi gönderir.
   * FCM MulticastMessage: maksimum 500 token/istek
   *
   * @returns Geçersiz tokenların listesi (DB'den silinmeli)
   */
  async sendToTokens(
    fcmTokens: string[],
    payload: PushNotificationPayload,
  ): Promise<{ invalidTokens: string[] }> {
    if (!this.messaging || fcmTokens.length === 0) {
      return { invalidTokens: [] };
    }

    const invalidTokens: string[] = [];
    const isSilent = payload.data?.['silent'] === 'true';

    // FCM batch limiti: 500 token/istek
    const chunks = chunkArray(fcmTokens, 500);

    for (const chunk of chunks) {
      try {
        const response = await this.messaging.sendEachForMulticast({
          tokens: chunk,
          ...(isSilent
            ? {}
            : {
                notification: {
                  title: payload.title,
                  body: payload.body,
                  ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
                },
              }),
          data: payload.data ?? {},
          android: {
            priority: isSilent ? 'normal' : 'high',
          },
          apns: {
            headers: {
              'apns-priority': isSilent ? '5' : '10',
              'apns-push-type': isSilent ? 'background' : 'alert',
            },
            payload: {
              aps: isSilent
                ? { 'content-available': 1 }
                : { alert: { title: payload.title, body: payload.body }, sound: 'default' },
            },
          },
        });

        // Başarısız tokenları tespit et
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = (resp.error as { code?: string } | undefined)?.code;
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token'
            ) {
              invalidTokens.push(chunk[idx]!);
            }
          }
        });

        this.logger.debug(
          `FCM multicast: ${response.successCount}/${chunk.length} başarılı`,
        );
      } catch (err) {
        this.logger.error('FCM multicast hatası', err);
      }
    }

    return { invalidTokens };
  }

  private handleSendError(err: unknown, token: string): boolean {
    const code = (err as { code?: string } | undefined)?.code;

    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      this.logger.debug(`Geçersiz FCM token (silinecek): ${token.slice(0, 20)}...`);
      return false;
    }

    this.logger.error(`FCM gönderim hatası: ${String(err)}`);
    return true;  // Geçici hata — token silme
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

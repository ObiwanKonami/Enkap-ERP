import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore anahtarları.
 * iOS: Keychain Services  |  Android: Android Keystore
 * AsyncStorage'dan farklı olarak şifreli — jailbreak'li cihazlarda bile korumalı.
 */
const KEYS = {
  ACCESS_TOKEN: 'enkap_access_token',
  REFRESH_TOKEN: 'enkap_refresh_token',
  TENANT_ID: 'enkap_tenant_id',
  USER_ID: 'enkap_user_id',
  EXPIRES_AT: 'enkap_token_expires_at', // Unix timestamp (ms)
} as const;

/** Access token'ın sona ermesine kaç ms kaldığında yenileme yapılır */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 dakika

export interface StoredCredentials {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  userId: string;
  expiresAt: number;
}

/**
 * Cihaz üzerinde güvenli token yönetimi.
 *
 * Tüm hassas veriler expo-secure-store aracılığıyla
 * platform native şifreleme mekanizmalarında saklanır.
 *
 * KURAL: Token'lar ASLA AsyncStorage'a yazılmaz.
 */
export class TokenManager {
  /** Tüm kimlik bilgilerini güvenli depoya yazar. */
  static async save(credentials: StoredCredentials): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, credentials.accessToken),
      SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, credentials.refreshToken),
      SecureStore.setItemAsync(KEYS.TENANT_ID, credentials.tenantId),
      SecureStore.setItemAsync(KEYS.USER_ID, credentials.userId),
      SecureStore.setItemAsync(
        KEYS.EXPIRES_AT,
        credentials.expiresAt.toString(),
      ),
    ]);
  }

  /** Güvenli depodan kimlik bilgilerini okur. */
  static async load(): Promise<StoredCredentials | null> {
    const [accessToken, refreshToken, tenantId, userId, expiresAtStr] =
      await Promise.all([
        SecureStore.getItemAsync(KEYS.ACCESS_TOKEN),
        SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
        SecureStore.getItemAsync(KEYS.TENANT_ID),
        SecureStore.getItemAsync(KEYS.USER_ID),
        SecureStore.getItemAsync(KEYS.EXPIRES_AT),
      ]);

    if (!accessToken || !refreshToken || !tenantId || !userId) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      tenantId,
      userId,
      expiresAt: parseInt(expiresAtStr ?? '0', 10),
    };
  }

  /** Tüm token'ları güvenli depodan siler (logout). */
  static async clear(): Promise<void> {
    await Promise.all(
      Object.values(KEYS).map((key) =>
        SecureStore.deleteItemAsync(key).catch(() => undefined),
      ),
    );
  }

  /**
   * Access token'ın yenilenmesi gerekip gerekmediğini kontrol eder.
   * Sona ermesine REFRESH_THRESHOLD_MS kaldığında true döner.
   */
  static isExpiringSoon(expiresAt: number): boolean {
    return Date.now() >= expiresAt - REFRESH_THRESHOLD_MS;
  }

  /** Yalnızca access token'ı günceller (refresh sonrası). */
  static async updateAccessToken(
    accessToken: string,
    expiresAt: number,
  ): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken),
      SecureStore.setItemAsync(KEYS.EXPIRES_AT, expiresAt.toString()),
    ]);
  }
}

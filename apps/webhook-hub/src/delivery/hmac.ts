import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

/**
 * Webhook teslimat HMAC-SHA256 imzalama.
 *
 * İmza formatı (GitHub webhook standardıyla uyumlu):
 *   X-Enkap-Signature: sha256=<hex_digest>
 *
 * Alıcı doğrulama kodu örneği (Node.js):
 *   const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
 *   const safe = timingSafeEqual(Buffer.from(received), Buffer.from(expected));
 *
 * Güvenlik:
 *  - HMAC secret her abonelik için benzersiz (256 bit rastgele)
 *  - Timing-safe compare (brute-force önleme)
 *  - Timestamp header (replay saldırısı önleme — 5 dakika tolerans)
 */

/**
 * İstek gövdesini HMAC-SHA256 ile imzalar.
 * @param body   JSON string (teslimat payload'ı)
 * @param secret Aboneliğe ait gizli anahtar (plain text, DB'de şifreli saklanır)
 */
export function signPayload(body: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${digest}`;
}

/**
 * Gelen imzayı doğrular (timing-safe).
 * Webhook alıcıları bunu kendi tarafında çalıştırır.
 */
export function verifySignature(
  body: string,
  secret: string,
  receivedSignature: string,
): boolean {
  const expected = signPayload(body, secret);
  try {
    return timingSafeEqual(
      Buffer.from(receivedSignature),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

/**
 * Yeni abonelik için güvenli 256-bit secret üretir.
 * DB'ye kayıttan önce AES-256 ile şifrelenmeli.
 * TODO: Vault entegrasyonu ile şifreleme
 */
export function generateSecret(): string {
  return randomBytes(32).toString('hex'); // 64 hex karakter
}

/**
 * Abonelik secret'ını "şifreler" (şimdilik placeholder).
 * TODO: Vault transit engine ile gerçek şifreleme
 */
export function encryptSecret(plain: string): string {
  // STUB — production'da Vault transit encrypt kullanılır
  return `enc:${Buffer.from(plain).toString('base64')}`;
}

/**
 * Şifreli secret'ı çözer.
 * TODO: Vault transit engine ile gerçek çözme
 */
export function decryptSecret(encrypted: string): string {
  // STUB — production'da Vault transit decrypt kullanılır
  if (encrypted.startsWith('enc:')) {
    return Buffer.from(encrypted.slice(4), 'base64').toString();
  }
  return encrypted;
}

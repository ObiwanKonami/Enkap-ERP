import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * Marketplace Credential Şifreleme Servisi
 *
 * Marketplace API anahtarları (Trendyol, Hepsiburada) DB'de AES-256-GCM ile şifrelenir.
 * Şifreleme anahtarı: MARKETPLACE_ENCRYPTION_KEY env var'ından türetilir.
 *
 * Production'da bu anahtar HashiCorp Vault'tan inject edilir:
 *   vault kv get -field=marketplace_key secret/enkap/stock-service
 *
 * Depolanan format (JSONB):
 *   { iv: "<hex>", authTag: "<hex>", encrypted: "<hex>" }
 */
@Injectable()
export class CredentialEncryptionService {
  private readonly logger = new Logger(CredentialEncryptionService.name);
  private readonly key: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';

  constructor(private readonly config: ConfigService) {
    const rawKey = config.get<string>('MARKETPLACE_ENCRYPTION_KEY');

    if (!rawKey) {
      // Geliştirme modunda uyar — üretimde validateEnv ile yakalanır
      this.logger.warn(
        'MARKETPLACE_ENCRYPTION_KEY tanımlanmamış — geliştirme modu aktif',
      );
      // Geliştirme için sabit 32 byte anahtar (asla üretimde kullanılmaz)
      this.key = Buffer.from('dev-only-key-do-not-use-in-prod!!', 'utf8');
    } else {
      // Vault'tan gelen hex veya string'i 32 byte'a türet
      this.key = scryptSync(rawKey, 'enkap-marketplace-salt', 32);
    }
  }

  /**
   * Credentials objesini şifreler.
   * @returns Şifrelenmiş JSONB kaydı — doğrudan `credentials_enc` alanına yazılabilir
   */
  encrypt(credentials: Record<string, string>): Record<string, string> {
    const iv = randomBytes(12); // GCM için 12 byte önerilir
    const cipher = createCipheriv(this.ALGORITHM, this.key, iv);

    const plaintext = JSON.stringify(credentials);
    const encryptedBuf = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      iv:        iv.toString('hex'),
      authTag:   authTag.toString('hex'),
      encrypted: encryptedBuf.toString('hex'),
    };
  }

  /**
   * Şifrelenmiş JSONB kaydını çözer.
   * @returns Orijinal credentials objesi
   */
  decrypt(encryptedRecord: Record<string, string>): Record<string, string> {
    const iv        = Buffer.from(encryptedRecord['iv'],        'hex');
    const authTag   = Buffer.from(encryptedRecord['authTag'],   'hex');
    const encrypted = Buffer.from(encryptedRecord['encrypted'], 'hex');

    const decipher = createDecipheriv(this.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');

    return JSON.parse(decrypted) as Record<string, string>;
  }

  /**
   * JSONB kaydının şifrelenmiş format olup olmadığını kontrol eder.
   * Eski düz metin kayıtlar için migration desteği.
   */
  isEncrypted(record: Record<string, string>): boolean {
    return !!(record['iv'] && record['authTag'] && record['encrypted']);
  }
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * GİB Zarf (Envelope) Takip Entity'si
 *
 * EF-VAP protokolüne göre GİB ile haberleşme "Zarf" bazlıdır.
 * Her belge (fatura/irsaliye) bir zarfa konur ve GİB'e bu zarfla iletilir.
 *
 * Zarf türleri:
 *  - SENDERENVELOPE:  Giden fatura veya irsaliye
 *  - POSTBOXENVELOPE: Uygulama yanıtı (Kabul/Red)
 *  - SYSTEMENVELOPE:  GİB sistem yanıtı (gelen hata/başarı)
 *
 * GİB durum kodu akışı:
 *  1000/1100 → PROCESSING (kuyrukta)
 *  1140-1160 → FAILED (şema hatası — fatura DRAFT'a düşer)
 *  1163/1164 → FAILED (tekil numara çakışması)
 *  1200      → PROCESSING (alıcıya iletildi)
 *  1210/1215 → FAILED (alıcıya ulaşılamadı)
 *  1220      → PROCESSING (hedef yanıt vermedi — polling devam)
 *  1230      → FAILED (hedef reddetti)
 *  1300      → SUCCESS (başarıyla tamamlandı)
 */
@Entity('gib_envelopes')
export class GibEnvelope {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /**
   * Zarf türü:
   * SENDERENVELOPE  → Giden fatura/irsaliye
   * POSTBOXENVELOPE → Uygulama yanıtı (Kabul/Red)
   * SYSTEMENVELOPE  → GİB sistem yanıtı
   */
  @Column({ name: 'type', type: 'varchar', length: 20 })
  type!: 'SENDERENVELOPE' | 'POSTBOXENVELOPE' | 'SYSTEMENVELOPE';

  /** Yön: OUT = Giden, IN = Gelen */
  @Column({ name: 'direction', type: 'varchar', length: 3 })
  direction!: 'IN' | 'OUT';

  /** Gönderici GB/PK etiketi (Örn: urn:mail:defaultgb@enkap.com.tr) */
  @Column({ name: 'sender_alias', type: 'varchar', length: 200 })
  senderAlias!: string;

  /** Alıcı GB/PK etiketi (Örn: urn:mail:defaultpk@alici.com.tr) */
  @Column({ name: 'receiver_alias', type: 'varchar', length: 200 })
  receiverAlias!: string;

  /** Zarfın içindeki belge UUID listesi */
  @Column({ name: 'document_ids', type: 'uuid', array: true, default: '{}' })
  documentIds!: string[];

  /** ZIP dosyasının MD5 hash'i (GİB SOAP sendDocument'a gönderilir) */
  @Column({ name: 'zip_md5_hash', type: 'varchar', length: 64, nullable: true })
  zipMd5Hash?: string;

  /** SHA-256 hash (ISO 27001 audit için) */
  @Column({ name: 'zip_sha256_hash', type: 'varchar', length: 128, nullable: true })
  zipSha256Hash?: string;

  /** ZIP dosyası adı (Örn: ENK2024000000001.zip) */
  @Column({ name: 'zip_filename', type: 'varchar', length: 100, nullable: true })
  zipFilename?: string;

  /**
   * GİB sistem yanıt kodu.
   * Örn: 1000, 1200, 1300, 1160 vb.
   */
  @Column({ name: 'gib_status_code', type: 'int', nullable: true })
  gibStatusCode?: number;

  /** GİB sistem yanıt açıklaması */
  @Column({ name: 'gib_status_message', type: 'varchar', length: 500, nullable: true })
  gibStatusMessage?: string;

  /**
   * Enkap içi zarf durumu.
   * PENDING    → Gönderilmeyi bekliyor
   * PROCESSING → GİB'e gönderildi, yanıt bekleniyor
   * SUCCESS    → GİB 1300 döndü (başarıyla tamamlandı)
   * FAILED     → GİB hata döndü (1140-1160, 1210, 1215, 1230 vb.)
   */
  @Column({ name: 'status', type: 'varchar', length: 15, default: 'PENDING' })
  status!: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

  /** GİB'e gönderim zamanı */
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date;

  /** Son GİB sorgu zamanı (polling) */
  @Column({ name: 'last_polled_at', type: 'timestamptz', nullable: true })
  lastPolledAt?: Date;

  /** Sonraki polling zamanı */
  @Column({ name: 'next_poll_at', type: 'timestamptz', nullable: true })
  nextPollAt?: Date;

  /** Toplam polling deneme sayısı */
  @Column({ name: 'poll_attempt_count', type: 'int', default: 0 })
  pollAttemptCount!: number;

  /** SOAP response'dan gelen ham GİB yanıtı (debug/audit için) */
  @Column({ name: 'raw_gib_response', type: 'text', nullable: true })
  rawGibResponse?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

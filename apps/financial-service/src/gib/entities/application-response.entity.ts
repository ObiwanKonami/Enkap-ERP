import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * Uygulama Yanıtı (ApplicationResponse) Entity'si
 *
 * Ticari faturalarda (TICARIFATURA profile) alıcının 8 gün içinde
 * verdiği Kabul veya Red yanıtını temsil eder.
 *
 * VUK 509 gereği:
 *  - Gelen TICARIFATURA için 8 gün (192 saat) içinde KABUL veya RED göndermek zorunludur.
 *  - 8 günü geçen faturaların ApplicationResponse'u ASLA GİB'e gönderilemez.
 *  - Backend bu kuralı zorunlu kılar — UI kontrolü ek güvence sağlar.
 *
 * Zarf türü: POSTBOXENVELOPE
 */
@Entity('application_responses')
export class ApplicationResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  /** Yanıt verilen fatura ID'si */
  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  /** Fatura zarfı UUID (kaynak SENDERENVELOPE) */
  @Column({ name: 'invoice_envelope_id', type: 'uuid', nullable: true })
  invoiceEnvelopeId?: string;

  /** Bu yanıtın zarfı (POSTBOXENVELOPE) */
  @Column({ name: 'response_envelope_id', type: 'uuid', nullable: true })
  responseEnvelopeId?: string;

  /**
   * Yanıt türü:
   * KABUL → Fatura kabul edildi
   * RED   → Fatura reddedildi (sebep zorunlu)
   */
  @Column({ name: 'response_type', type: 'varchar', length: 5 })
  responseType!: 'KABUL' | 'RED';

  /** Red gerekçesi (responseType=RED ise zorunlu) */
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  /** Yanıtı oluşturan kullanıcı */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  /**
   * GİB'e gönderim durumu:
   * DRAFT      → Henüz gönderilmedi
   * SENT       → GİB'e gönderildi (POSTBOXENVELOPE oluşturuldu)
   * FAILED     → Gönderim başarısız
   */
  @Column({ name: 'status', type: 'varchar', length: 10, default: 'DRAFT' })
  status!: 'DRAFT' | 'SENT' | 'FAILED';

  /** UBL ApplicationResponse XML (imzalanmadan önce) */
  @Column({ name: 'ubl_xml', type: 'text', nullable: true })
  ublXml?: string;

  /** Hata mesajı */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

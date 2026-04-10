import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ExpenseReport } from './expense-report.entity';

/**
 * Masraf kategorisi.
 * Muhasebe hesap planına (TDHP) eşleme kolaylığı için Türkçe değerler kullanılır.
 */
export type ExpenseCategory =
  | 'YEMEK'       // Yemek ve ikram (740.01)
  | 'ULASIM'      // Ulaşım: taksi, metro, otobüs, uçak (740.02)
  | 'YAKIT'       // Araç yakıt giderleri (740.03)
  | 'KONAKLAMA'   // Otel ve konaklama (740.04)
  | 'TEMSIL'      // Temsil ve ağırlama (760.01)
  | 'KIRTASIYE'   // Kırtasiye ve ofis malzemeleri (740.05)
  | 'TEKNIK'      // Teknik/IT malzeme ve ekipman (740.06)
  | 'EGITIM'      // Eğitim, seminer ve kongre (740.07)
  | 'DIGER';      // Diğer giderler (740.08)

/**
 * Masraf Kalemi.
 *
 * Her kalem tek bir harcama belgesine (fatura/fiş/makbuz) karşılık gelir.
 * KDV tutarı ayrıca takip edilir; muhasebe entegrasyonu ve KDV iade süreçleri için.
 *
 * Tutarlar kuruş cinsinden saklanır (bigint): 1 TL = 100 kuruş.
 */
@Entity('expense_lines')
export class ExpenseLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Bağlı masraf raporu UUID'si */
  @Column({ name: 'report_id', type: 'uuid' })
  reportId!: string;

  @ManyToOne(() => ExpenseReport, (report) => report.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report!: ExpenseReport;

  @Column({ name: 'category', type: 'varchar', length: 20 })
  category!: ExpenseCategory;

  /** Harcama açıklaması (örn. "İstanbul-Ankara uçak bileti") */
  @Column({ name: 'description', type: 'varchar', length: 300 })
  description!: string;

  /** Harcamanın gerçekleştiği tarih */
  @Column({ name: 'expense_date', type: 'date' })
  expenseDate!: string;

  /** KDV dahil toplam tutar — kuruş */
  @Column({
    name: 'amount_kurus',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  amountKurus!: number;

  /** Ayrıştırılmış KDV tutarı — kuruş (KDV iade takibi için) */
  @Column({
    name: 'kdv_kurus',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
  })
  kdvKurus!: number;

  /**
   * Makbuz/fatura dosyasının depolama URL'si.
   * Object storage (MinIO/S3) üzerinde saklanır; KVKK kapsamında erişim kısıtlıdır.
   */
  @Column({ name: 'receipt_url', type: 'varchar', length: 500, nullable: true })
  receiptUrl!: string | null;

  /** Kalem düzeyinde açıklama notları */
  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}

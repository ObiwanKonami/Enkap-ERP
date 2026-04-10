import { Model } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import type { Relation } from '@nozbe/watermelondb';

/**
 * Offline fatura WatermelonDB modeli.
 *
 * Sadece görüntüleme ve arama için offline saklanır.
 * Oluşturma/güncelleme işlemleri backend API'ye gönderilir,
 * sync sırasında yerel veritabanı güncellenir.
 *
 * _status alanı WatermelonDB tarafından otomatik yönetilir:
 *   synced   → backend ile eşleşiyor
 *   created  → offline oluşturuldu, henüz push edilmedi
 *   updated  → offline güncellendi, henüz push edilmedi
 *   deleted  → offline silindi, henüz push edilmedi
 */
export class LocalInvoice extends Model {
  static table = 'invoices';

  static associations = {
    invoice_lines: { type: 'has_many' as const, foreignKey: 'invoice_id' },
  };

  @field('server_id') serverId!: string | null;
  @field('invoice_number') invoiceNumber!: string;
  @field('invoice_type') invoiceType!: string;
  @field('direction') direction!: string;
  @field('status') status!: string;
  @field('buyer_name') buyerName!: string;
  @field('buyer_tax_id') buyerTaxId!: string | null;
  @field('subtotal') subtotal!: number;
  @field('kdv_total') kdvTotal!: number;
  @field('discount_total') discountTotal!: number;
  @field('total') total!: number;
  @field('currency') currency!: string;
  @date('issue_date') issueDate!: Date;
  @date('due_date') dueDate!: Date | null;
  @field('notes') notes!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  get isOverdue(): boolean {
    if (!this.dueDate) return false;
    return this.dueDate < new Date() && this.status !== 'ACCEPTED_GIB' && this.status !== 'CANCELLED';
  }

  get statusLabel(): string {
    const labels: Record<string, string> = {
      DRAFT: 'Taslak',
      PENDING_GIB: 'GİB Bekliyor',
      ACCEPTED_GIB: 'GİB Onaylı',
      REJECTED_GIB: 'GİB Reddetti',
      CANCELLED: 'İptal',
    };
    return labels[this.status] ?? this.status;
  }

  get typeLabel(): string {
    return this.invoiceType === 'E_FATURA' ? 'e-Fatura' : 'e-Arşiv';
  }
}

import { Injectable } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';

/**
 * Cari hesap mutabakat belgesi satırı.
 * Fatura bazında borç / alacak hareketi.
 */
export interface ReconciliationLine {
  invoiceId:    string;
  invoiceNo:    string;
  /** "dd.MM.yyyy" */
  invoiceDate:  string;
  /** "dd.MM.yyyy" veya null */
  dueDate:      string | null;
  direction:    'IN' | 'OUT';   // IN=borç (alış), OUT=alacak (satış)
  /** Kuruş cinsinden */
  amount:       number;
  status:       string;
  isPaid:       boolean;
}

export interface ReconciliationStatement {
  tenantId:    string;
  contactId:   string;
  contactName: string;
  contactType: 'customer' | 'vendor';
  /** "dd.MM.yyyy" */
  generatedAt: string;
  lines:       ReconciliationLine[];
  /** Kuruş cinsinden toplam alacak (OUT) */
  totalReceivable: number;
  /** Kuruş cinsinden toplam borç (IN) */
  totalPayable:    number;
  /** Net bakiye: pozitif = alacak, negatif = borç */
  netBalance:      number;
}

/**
 * Cari Hesap Mutabakat Belgesi servisi.
 *
 * Belirli bir müşteri veya tedarikçi için tüm faturaları listeler,
 * alacak/borç dengesi hesaplar. Türkiye muhasebe uygulamasında
 * periyodik olarak karşı tarafa imzalatılır.
 */
@Injectable()
export class ReconciliationService {
  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Belirtilen cari için mutabakat belgesi oluşturur.
   *
   * Önce customers, bulamazsa vendors tablosuna bakar.
   * Her iki tabloda da yoksa NotFoundException fırlatır.
   */
  async generate(contactId: string): Promise<ReconciliationStatement> {
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    // Cari bilgisini belirle (müşteri mi tedarikçi mi?)
    const { contactName, contactType, direction } = await this.resolveContact(ds, contactId, tenantId);

    // Tüm faturaları çek (iptal edilmemiş)
    const rows = await ds.query<{
      id:           string;
      invoice_no:   string;
      invoice_date: string;
      due_date:     string | null;
      direction:    'IN' | 'OUT';
      total:        string;
      status:       string;
    }[]>(
      `SELECT
         id,
         invoice_number                                    AS invoice_no,
         TO_CHAR(issue_date, 'DD.MM.YYYY')                AS invoice_date,
         CASE WHEN due_date IS NOT NULL THEN TO_CHAR(due_date, 'DD.MM.YYYY') ELSE NULL END AS due_date,
         direction,
         total,
         status
       FROM invoices
       WHERE tenant_id = $1
         AND COALESCE(counterparty_id, customer_id, vendor_id) = $2
         AND status NOT IN ('DRAFT', 'CANCELLED')
       ORDER BY issue_date ASC, created_at ASC`,
      [tenantId, contactId],
    );

    const lines: ReconciliationLine[] = rows.map((r) => ({
      invoiceId:   r.id,
      invoiceNo:   r.invoice_no,
      invoiceDate: r.invoice_date,
      dueDate:     r.due_date,
      direction:   r.direction,
      amount:      Math.round(parseFloat(r.total)),
      status:      r.status,
      isPaid:      r.status === 'PAID',
    }));

    const totalReceivable = lines
      .filter((l) => l.direction === 'OUT')
      .reduce((s, l) => s + l.amount, 0);

    const totalPayable = lines
      .filter((l) => l.direction === 'IN')
      .reduce((s, l) => s + l.amount, 0);

    const today = new Date();
    const generatedAt = today.toLocaleDateString('tr-TR', {
      day:   '2-digit',
      month: '2-digit',
      year:  'numeric',
    }).replace(/\//g, '.');

    return {
      tenantId,
      contactId,
      contactName,
      contactType,
      generatedAt,
      lines,
      totalReceivable,
      totalPayable,
      netBalance: totalReceivable - totalPayable,
    };
  }

  // ─── Yardımcı ─────────────────────────────────────────────────────────────

  private async resolveContact(
    ds: Awaited<ReturnType<TenantDataSourceManager['getDataSource']>>,
    contactId: string,
    tenantId:  string,
  ): Promise<{ contactName: string; contactType: 'customer' | 'vendor'; direction: 'OUT' | 'IN' }> {
    // crm_contacts'tan bak (contact_type ile yön belirle)
    const rows = await ds.query<{ name: string; contact_type: string }[]>(
      `SELECT COALESCE(company_name, first_name || COALESCE(' ' || last_name, '')) AS name,
              contact_type
       FROM crm_contacts WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [contactId, tenantId],
    );

    if (rows.length > 0) {
      const c = rows[0]!;
      const isVendor = c.contact_type === 'VENDOR';
      return {
        contactName: (c.name ?? '').trim() || contactId,
        contactType: isVendor ? 'vendor' : 'customer',
        direction:   isVendor ? 'IN' : 'OUT',
      };
    }

    // Bulunamadı — boş kayıt döndür (Not found yerine boş statement)
    return {
      contactName: contactId,
      contactType: 'customer',
      direction:   'OUT',
    };
  }
}

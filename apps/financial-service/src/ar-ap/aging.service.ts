import { Injectable } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';

/** Vade dilimleri (gün cinsinden) */
export interface AgingBucket {
  label:        string;
  minDays:      number;
  maxDays:      number;
  count:        number;
  totalAmount:  number;  // NUMERIC olarak döner, number'a parse edilir
}

export interface AgingReportRow {
  /** Müşteri veya tedarikçi ID'si */
  partyId:     string;
  partyName:   string;  // customers veya vendors tablosundan JOIN
  direction:   'OUT' | 'IN';  // OUT=alacak, IN=borç
  buckets:     AgingBucket[];
  totalOverdue: number;
}

export interface AgingSummary {
  direction:    'OUT' | 'IN';
  notDue:       { count: number; amount: number };
  days1_30:     { count: number; amount: number };
  days31_60:    { count: number; amount: number };
  days61_90:    { count: number; amount: number };
  days90plus:   { count: number; amount: number };
  grandTotal:   number;
}

/**
 * Cari Hesap Vade Analizi (Aging Report).
 *
 * Türkiye muhasebe standardına göre vade dilimleri:
 *  Vadesi gelmemiş | 1-30 gün | 31-60 gün | 61-90 gün | 90+ gün
 *
 * Kaynak: invoices tablosu (mevcut) — yeni tablo gerekmez.
 * Sadece ödenmemiş (status ≠ 'CANCELLED', 'REJECTED') ve due_date dolu faturalar alınır.
 */
@Injectable()
export class AgingService {
  constructor(private readonly dsManager: TenantDataSourceManager) {}

  private async ds() {
    const { tenantId } = getTenantContext();
    return this.dsManager.getDataSource(tenantId);
  }

  /**
   * Özet aging raporu (dashboard widget için).
   * Tüm müşteriler/tedarikçiler toplamı.
   */
  async getSummary(direction: 'OUT' | 'IN'): Promise<AgingSummary> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    const rows = await ds.query<{
      bucket:  string;
      cnt:     string;
      amount:  string;
    }[]>(
      `SELECT
         CASE
           WHEN due_date > CURRENT_DATE                             THEN 'not_due'
           WHEN CURRENT_DATE - due_date BETWEEN 1  AND 30          THEN '1_30'
           WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60          THEN '31_60'
           WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90          THEN '61_90'
           ELSE                                                          '90_plus'
         END                           AS bucket,
         COUNT(*)                      AS cnt,
         COALESCE(SUM(total), 0)       AS amount
       FROM invoices
       WHERE tenant_id  = $1
         AND direction  = $2
         AND due_date   IS NOT NULL
         AND status NOT IN ('DRAFT','CANCELLED','REJECTED')
       GROUP BY bucket`,
      [tenantId, direction],
    );

    const get = (key: string) => {
      const row = rows.find((r) => r.bucket === key);
      return {
        count:  parseInt(row?.cnt    ?? '0', 10),
        amount: parseFloat(row?.amount ?? '0'),
      };
    };

    const buckets  = ['not_due', '1_30', '31_60', '61_90', '90_plus'];
    const grandTotal = rows.reduce((s, r) => s + parseFloat(r.amount), 0);

    return {
      direction,
      notDue:     get('not_due'),
      days1_30:   get('1_30'),
      days31_60:  get('31_60'),
      days61_90:  get('61_90'),
      days90plus: get('90_plus'),
      grandTotal,
    };
  }

  /**
   * Parti bazında aging detayı.
   * direction=OUT → müşteri alacakları, direction=IN → tedarikçi borçları.
   */
  async getDetailByParty(direction: 'OUT' | 'IN'): Promise<AgingReportRow[]> {
    const { tenantId } = getTenantContext();
    const ds = await this.ds();

    // crm_contacts'tan isim JOIN (counterparty_id veya eski customer/vendor_id üzerinden)
    const partyJoin = `LEFT JOIN crm_contacts p ON p.id = COALESCE(i.counterparty_id, i.customer_id, i.vendor_id)`;

    const partyId = `COALESCE(i.counterparty_id, i.customer_id, i.vendor_id)`;

    const rows = await ds.query<{
      party_id:   string;
      party_name: string;
      bucket:     string;
      cnt:        string;
      amount:     string;
    }[]>(
      `SELECT
         ${partyId}                AS party_id,
         COALESCE(p.name, 'Bilinmeyen') AS party_name,
         CASE
           WHEN due_date > CURRENT_DATE                    THEN 'not_due'
           WHEN CURRENT_DATE - due_date BETWEEN 1  AND 30  THEN '1_30'
           WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60  THEN '31_60'
           WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90  THEN '61_90'
           ELSE                                                  '90_plus'
         END                      AS bucket,
         COUNT(*)                  AS cnt,
         COALESCE(SUM(i.total),0)  AS amount
       FROM invoices i
       ${partyJoin}
       WHERE i.tenant_id = $1
         AND i.direction = $2
         AND i.due_date IS NOT NULL
         AND i.status NOT IN ('DRAFT','CANCELLED','REJECTED')
         AND COALESCE(i.counterparty_id, i.customer_id, i.vendor_id) IS NOT NULL
       GROUP BY ${partyId}, party_name, bucket
       ORDER BY party_name, bucket`,
      [tenantId, direction],
    );

    // Satırları parti bazında grupla
    const partyMap = new Map<string, AgingReportRow>();

    for (const row of rows) {
      if (!partyMap.has(row.party_id)) {
        partyMap.set(row.party_id, {
          partyId:      row.party_id,
          partyName:    row.party_name,
          direction,
          buckets:      [],
          totalOverdue: 0,
        });
      }

      const entry = partyMap.get(row.party_id)!;
      const amount = parseFloat(row.amount);

      entry.buckets.push({
        label:       row.bucket,
        minDays:     this.bucketMinDays(row.bucket),
        maxDays:     this.bucketMaxDays(row.bucket),
        count:       parseInt(row.cnt, 10),
        totalAmount: amount,
      });

      // Vadesi geçmişler (not_due hariç) toplam
      if (row.bucket !== 'not_due') {
        entry.totalOverdue += amount;
      }
    }

    return Array.from(partyMap.values())
      .sort((a, b) => b.totalOverdue - a.totalOverdue);
  }

  private bucketMinDays(bucket: string): number {
    const map: Record<string, number> = {
      not_due: -999, '1_30': 1, '31_60': 31, '61_90': 61, '90_plus': 91,
    };
    return map[bucket] ?? 0;
  }

  private bucketMaxDays(bucket: string): number {
    const map: Record<string, number> = {
      not_due: 0, '1_30': 30, '31_60': 60, '61_90': 90, '90_plus': 9999,
    };
    return map[bucket] ?? 9999;
  }
}

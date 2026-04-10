import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';

/**
 * Ba/Bs eşiği: ₺5.000 (GİB mevzuatı — KDV hariç)
 * Vergi Usul Kanunu Genel Tebliği (Sıra No: 396).
 */
const BA_BS_THRESHOLD = 5000; // TL (KDV hariç)

export interface BaLineItem {
  /** Tedarikçi VKN veya TCKN */
  vergiKimlikNo: string;
  /** Tedarikçi unvanı */
  unvan: string;
  /** Toplam KDV hariç tutar (TL) */
  matrah: number;
  /** Fatura sayısı */
  faturaSayisi: number;
}

export interface BsLineItem {
  /** Müşteri VKN veya TCKN */
  vergiKimlikNo: string;
  unvan: string;
  matrah: number;
  faturaSayisi: number;
}

export interface BaFormData {
  tenantId: string;
  vkn: string;
  unvan: string;
  year: number;
  month: number;
  items: BaLineItem[];
  /** Genel toplam matrah */
  toplamMatrah: number;
  /** Toplam fatura adedi */
  toplamFaturaSayisi: number;
}

export interface BsFormData {
  tenantId: string;
  vkn: string;
  unvan: string;
  year: number;
  month: number;
  items: BsLineItem[];
  toplamMatrah: number;
  toplamFaturaSayisi: number;
}

/**
 * Ba/Bs Form Servisi.
 *
 * Yasal dayanak:
 *  VUK Genel Tebliği 396 (Mal ve Hizmet Alımları ile Satışlarının Bildirilmesi)
 *
 *  Ba Formu → Aylık alış bildirimi (gelen faturalar — direction: IN)
 *  Bs Formu → Aylık satış bildirimi (giden faturalar — direction: OUT)
 *
 *  Kapsam:
 *   - KDV hariç tutarı aylık ₺5.000 veya üzeri olan alış/satışlar
 *   - Tek tedarikçi veya müşterinin aylık toplam tutarı ₺5.000'i geçiyorsa dahil edilir
 *   - e-Fatura kapsamındaki faturalar da dahildir
 *
 *  Gönderim:
 *   - Her ayın sonraki ayın son günü mesai bitimine kadar
 *   - GİB İnteraktif Vergi Dairesi üzerinden elektronik
 */
@Injectable()
export class BaBsService {
  private readonly logger = new Logger(BaBsService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Ba Formu verilerini üretir.
   * direction='IN' (gelen/alış) faturalarından tedarikçi bazlı toplar.
   */
  async generateBa(year: number, month: number): Promise<BaFormData> {
    this.validatePeriod(year, month);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    // Tenant VKN ve ünvanını çek (control_plane'den ya da tenant schema'sından)
    const tenantProfile = await this.getTenantProfile(ds, tenantId);

    const rows = await ds.query<{
      vergi_kimlik_no: string;
      unvan: string;
      toplam_matrah: string;
      fatura_sayisi: string;
    }[]>(
      `SELECT
         COALESCE(v.tax_id, 'BILINMIYOR') AS vergi_kimlik_no,
         COALESCE(v.name, 'BILINMIYOR')   AS unvan,
         SUM(i.subtotal)                  AS toplam_matrah,
         COUNT(i.id)                      AS fatura_sayisi
       FROM invoices i
       LEFT JOIN vendors v ON v.id = i.vendor_id
       WHERE i.tenant_id = $1
         AND i.direction = 'IN'
         AND i.status NOT IN ('DRAFT', 'CANCELLED')
         AND EXTRACT(YEAR  FROM i.issue_date) = $2
         AND EXTRACT(MONTH FROM i.issue_date) = $3
       GROUP BY v.tax_id, v.name
       HAVING SUM(i.subtotal) >= $4
       ORDER BY SUM(i.subtotal) DESC`,
      [tenantId, year, month, BA_BS_THRESHOLD],
    );

    const items: BaLineItem[] = rows.map((r) => ({
      vergiKimlikNo: r.vergi_kimlik_no,
      unvan:         r.unvan,
      matrah:        parseFloat(r.toplam_matrah),
      faturaSayisi:  parseInt(r.fatura_sayisi, 10),
    }));

    const toplamMatrah      = items.reduce((s, i) => s + i.matrah, 0);
    const toplamFaturaSayisi = items.reduce((s, i) => s + i.faturaSayisi, 0);

    this.logger.log(
      `Ba formu üretildi: ${year}/${month}, ${items.length} satır, ` +
      `toplam=₺${toplamMatrah.toFixed(2)} — tenant=${tenantId}`,
    );

    return {
      tenantId,
      vkn:   tenantProfile.vkn,
      unvan: tenantProfile.unvan,
      year,
      month,
      items,
      toplamMatrah,
      toplamFaturaSayisi,
    };
  }

  /**
   * Bs Formu verilerini üretir.
   * direction='OUT' (giden/satış) faturalarından müşteri bazlı toplar.
   */
  async generateBs(year: number, month: number): Promise<BsFormData> {
    this.validatePeriod(year, month);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    const tenantProfile = await this.getTenantProfile(ds, tenantId);

    const rows = await ds.query<{
      vergi_kimlik_no: string;
      unvan: string;
      toplam_matrah: string;
      fatura_sayisi: string;
    }[]>(
      `SELECT
         COALESCE(c.vkn, c.tckn, 'BIREYSEL')                              AS vergi_kimlik_no,
         COALESCE(c.company_name, CONCAT(c.first_name, ' ', c.last_name),
                  'BIREYSEL')                                               AS unvan,
         SUM(i.subtotal)                                                    AS toplam_matrah,
         COUNT(i.id)                                                        AS fatura_sayisi
       FROM invoices i
       LEFT JOIN crm_contacts c ON c.id = i.customer_id
       WHERE i.tenant_id = $1
         AND i.direction = 'OUT'
         AND i.status NOT IN ('DRAFT', 'CANCELLED')
         AND EXTRACT(YEAR  FROM i.issue_date) = $2
         AND EXTRACT(MONTH FROM i.issue_date) = $3
       GROUP BY c.vkn, c.tckn, c.company_name, c.first_name, c.last_name
       HAVING SUM(i.subtotal) >= $4
       ORDER BY SUM(i.subtotal) DESC`,
      [tenantId, year, month, BA_BS_THRESHOLD],
    );

    const items: BsLineItem[] = rows.map((r) => ({
      vergiKimlikNo: r.vergi_kimlik_no,
      unvan:         r.unvan,
      matrah:        parseFloat(r.toplam_matrah),
      faturaSayisi:  parseInt(r.fatura_sayisi, 10),
    }));

    const toplamMatrah       = items.reduce((s, i) => s + i.matrah, 0);
    const toplamFaturaSayisi = items.reduce((s, i) => s + i.faturaSayisi, 0);

    this.logger.log(
      `Bs formu üretildi: ${year}/${month}, ${items.length} satır, ` +
      `toplam=₺${toplamMatrah.toFixed(2)} — tenant=${tenantId}`,
    );

    return {
      tenantId,
      vkn:   tenantProfile.vkn,
      unvan: tenantProfile.unvan,
      year,
      month,
      items,
      toplamMatrah,
      toplamFaturaSayisi,
    };
  }

  // ─── Özel yardımcılar ──────────────────────────────────────────────────────

  private validatePeriod(year: number, month: number): void {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Geçersiz ay: 1-12 arası olmalıdır.');
    }
    if (year < 2020 || year > 2099) {
      throw new BadRequestException('Geçersiz yıl.');
    }
  }

  private async getTenantProfile(
    ds: Awaited<ReturnType<TenantDataSourceManager['getDataSource']>>,
    tenantId: string,
  ): Promise<{ vkn: string; unvan: string }> {
    // tenant_profiles control plane'de — bu sorgu tenant schema'sında çalışır
    // Gerçek implementasyonda: InjectDataSource('control_plane') ile alınır
    // Şimdilik tenant schema'sında company_settings veya profile tablosu kullanılır
    const rows = await ds.query<{ vkn: string | null; company_name: string }[]>(
      `SELECT vkn, company_name FROM company_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    ).catch(() => []);

    return {
      vkn:   rows[0]?.vkn ?? '0000000000',
      unvan: rows[0]?.company_name ?? tenantId,
    };
  }
}

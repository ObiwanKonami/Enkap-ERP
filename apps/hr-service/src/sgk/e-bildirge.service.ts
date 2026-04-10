import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { buildEBildirgeXml, EBildirgeData, SgkSigortaliBilgisi } from './e-bildirge.builder';

/**
 * SGK e-Bildirge Servisi.
 *
 * 5510 Sayılı Kanun gereği her ay SGK'ya sigortalı bildirimi yapılmalıdır.
 * Bildirge, onaylanmış (APPROVED) bordro kayıtlarından otomatik üretilir.
 *
 * Akış:
 *  1. Onaylanmış bordrolar çekil
 *  2. Çalışan TCKN/SGK bilgileri ile eşleştir
 *  3. e-Bildirge XML üret
 *  4. (TODO: Faz 6) SGK web servisine SOAP ile gönder
 *
 * Prim gün sayısı:
 *  Normal ay: 30 gün (SGK 30 gün prensibini uygular)
 *  Ücretsiz izin, işe giriş/çıkış varsa gerçek gün hesaplanır
 */
@Injectable()
export class EBildirgeService {
  private readonly logger = new Logger(EBildirgeService.name);

  constructor(private readonly dsManager: TenantDataSourceManager) {}

  /**
   * Döneme ait e-Bildirge verilerini üretir.
   * Onaylanmış bordro kayıtlarından oluşturulur.
   */
  async generateBildirgePeriod(year: number, month: number): Promise<EBildirgeData> {
    this.validatePeriod(year, month);
    const { tenantId } = getTenantContext();
    const ds = await this.dsManager.getDataSource(tenantId);

    // Onaylanmış bordrolar
    const payrolls = await ds.query<{
      employee_id:       string;
      tckn:              string;
      name:              string;
      surname:           string;
      sgk_no:            string | null;
      working_days:      number;
      gross_kurus:       number;
      sgk_worker_kurus:  number;
      sgk_employer_kurus: number;
    }[]>(
      `SELECT
         p.employee_id,
         e.tckn,
         e.name,
         e.surname,
         e.sgk_no,
         p.working_days,
         p.gross_kurus,
         p.sgk_worker_kurus,
         p.sgk_employer_kurus
       FROM payrolls p
       JOIN employees e ON e.id = p.employee_id
       WHERE p.tenant_id = $1
         AND p.period_year  = $2
         AND p.period_month = $3
         AND p.status = 'APPROVED'
       ORDER BY e.surname, e.name`,
      [tenantId, year, month],
    );

    if (payrolls.length === 0) {
      throw new NotFoundException(
        `${year}/${month} dönemine ait onaylanmış bordro bulunamadı.`,
      );
    }

    // SGK tavan kontrolü (165.785,03 TL — 16.578.503 kuruş)
    const SGK_CEILING_KURUS = 16_578_503;

    const sigortalilar: SgkSigortaliBilgisi[] = payrolls.map((p) => {
      const sgkMatrahKurus = Math.min(p.gross_kurus, SGK_CEILING_KURUS);

      return {
        tckn:            p.tckn,
        adSoyad:         `${p.name} ${p.surname}`,
        sgkNo:           p.sgk_no,
        primGunSayisi:   Math.min(p.working_days, 30),
        brutUcretKurus:  p.gross_kurus,
        sgkMatrahKurus,
        sgkIsciKurus:    p.sgk_worker_kurus,
        sgkIsverenKurus: p.sgk_employer_kurus,
      };
    });

    // Tenant SGK sicil bilgisi (company_settings tablosundan)
    const settingRows = await ds.query<{
      sgk_sicil_no: string | null;
      company_name: string;
    }[]>(
      `SELECT sgk_sicil_no, company_name FROM company_settings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    ).catch(() => []);

    const sgkSicilNo = settingRows[0]?.sgk_sicil_no ?? '000000000';
    const isyeriAdi  = settingRows[0]?.company_name  ?? tenantId;

    const data: EBildirgeData = {
      sgkSicilNo,
      isyeriAdi,
      year,
      month,
      sigortalilar,
      toplamBrut:       sigortalilar.reduce((s, i) => s + i.brutUcretKurus, 0),
      toplamSgkIsci:    sigortalilar.reduce((s, i) => s + i.sgkIsciKurus, 0),
      toplamSgkIsveren: sigortalilar.reduce((s, i) => s + i.sgkIsverenKurus, 0),
    };

    this.logger.log(
      `e-Bildirge üretildi: ${year}/${month}, ${sigortalilar.length} sigortalı — tenant=${tenantId}`,
    );

    return data;
  }

  /** Döneme ait e-Bildirge XML'ini döner (GİB formatı) */
  async generateXml(year: number, month: number): Promise<string> {
    const data = await this.generateBildirgePeriod(year, month);
    return buildEBildirgeXml(data);
  }

  private validatePeriod(year: number, month: number): void {
    if (month < 1 || month > 12) {
      throw new BadRequestException('Geçersiz ay: 1-12 arası olmalıdır.');
    }
    if (year < 2020 || year > 2099) {
      throw new BadRequestException('Geçersiz yıl.');
    }
  }
}

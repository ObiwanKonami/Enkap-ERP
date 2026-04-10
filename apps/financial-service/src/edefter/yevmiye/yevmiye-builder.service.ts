import { Injectable, Logger } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { donemLabel, type DonemDto } from '../dto/donem.dto';

/**
 * Yevmiye Defteri XML üreticisi (GİB e-Defter).
 *
 * GİB e-Defter standardı (Yevmiye):
 *  - Tüm muhasebe fişleri kronolojik sırayla listelenir
 *  - Her fişin borç/alacak satırları hesap kodu ile belirtilir
 *  - Dönem toplam borç = dönem toplam alacak (çift taraflı muhasebe)
 *
 * XML namespace: GİB e-Defter şeması (teknik şartname, versiyon 1.7)
 * İmzalama: XAdES-T (Java servisi — GibSubmissionService ile aynı mimari)
 */
@Injectable()
export class YevmiyeBuilderService {
  private readonly logger = new Logger(YevmiyeBuilderService.name);

  // Java imzalama servisi endpoint'i (GibSubmissionService ile aynı)
  private readonly SIGNER_ENDPOINT =
    process.env.GIB_SIGNER_ENDPOINT ?? 'http://gib-signer:8080';

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Belirtilen dönem için Yevmiye Defteri XML'i üretir.
   *
   * Akış:
   *  1. Tenant DB'den dönemin tüm yevmiye kayıtlarını çek
   *  2. Her kayıt için borç/alacak satırlarını dahil et
   *  3. GİB şemasına uygun XML oluştur
   *  4. Ham XML'i döndür (imzalama EdEfterService'de yapılır)
   */
  async buildYevmiyeXml(
    donem: DonemDto,
    vkn: string,
    unvan: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    this.logger.log(
      `Yevmiye XML üretiliyor: tenant=${tenantId} dönem=${donemLabel(donem)}`,
    );

    // Dönemin tüm onaylanmış yevmiye fişlerini ve satırlarını çek
    const fisler = await dataSource.query<RawFis[]>(
      `SELECT
         je.id,
         je.entry_number  AS "fisNo",
         je.entry_date    AS "tarih",
         je.description   AS "aciklama",
         je.reference_type AS "referansTipi",
         je.reference_id   AS "referansId",
         json_agg(
           json_build_object(
             'hesapKodu',    jel.account_code,
             'aciklama',     COALESCE(jel.description, je.description),
             'borc',         jel.debit_amount,
             'alacak',       jel.credit_amount
           ) ORDER BY jel.account_code
         ) AS satirlar
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.entry_id = je.id
       WHERE je.tenant_id = $1
         AND je.entry_date BETWEEN $2 AND $3
         AND je.is_posted = true
       GROUP BY je.id, je.entry_number, je.entry_date, je.description,
                je.reference_type, je.reference_id
       ORDER BY je.entry_date, je.entry_number`,
      [tenantId, periodStart, periodEnd],
    );

    // Dönem toplamları (XML'e yazılır — validasyon için)
    const toplamBorc = fisler.reduce(
      (acc, f) =>
        acc +
        (f.satirlar as Satir[]).reduce(
          (s, l) => s + parseFloat(l.borc),
          0,
        ),
      0,
    );
    const toplamAlacak = fisler.reduce(
      (acc, f) =>
        acc +
        (f.satirlar as Satir[]).reduce(
          (s, l) => s + parseFloat(l.alacak),
          0,
        ),
      0,
    );

    this.logger.debug(
      `Yevmiye: ${fisler.length} fiş, ` +
      `toplam borç=${toplamBorc.toFixed(2)}, alacak=${toplamAlacak.toFixed(2)}`,
    );

    return this.renderYevmiyeXml({
      donem,
      vkn,
      unvan,
      periodStart,
      periodEnd,
      fisler,
      toplamBorc,
      toplamAlacak,
    });
  }

  /**
   * Ham XML metnini üretir.
   *
   * GİB Yevmiye Defteri şeması (teknik şartname 1.7):
   *  - Kodlama: UTF-8
   *  - Ondalık ayraç: nokta (.)
   *  - Tarih formatı: YYYY-MM-DD
   */
  private renderYevmiyeXml(ctx: RenderContext): string {
    const periodStartStr = toGibDate(ctx.periodStart);
    const periodEndStr   = toGibDate(ctx.periodEnd);
    const nowStr         = toGibDateTime(new Date());

    const fislerXml = ctx.fisler
      .map((fis) => this.renderFis(fis))
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<YevmiyeDefteri
  xmlns="urn:gib:edefter:yevmiye:1.7"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:gib:edefter:yevmiye:1.7 YevmiyeDefteri_v1.7.xsd">

  <!-- Defter Bilgileri -->
  <DefterBilgileri>
    <DefterTuru>YevmiyeDefteri</DefterTuru>
    <Donem>
      <BaslangicTarihi>${periodStartStr}</BaslangicTarihi>
      <BitisTarihi>${periodEndStr}</BitisTarihi>
    </Donem>
    <OlusturmaTarihi>${nowStr}</OlusturmaTarihi>
  </DefterBilgileri>

  <!-- Mükellef Bilgileri -->
  <MukellefBilgileri>
    <VKN>${escXml(ctx.vkn)}</VKN>
    <UnvanAdi>${escXml(ctx.unvan)}</UnvanAdi>
  </MukellefBilgileri>

  <!-- Yevmiye Kayıtları -->
  <YevmiyeKayitlari>
${fislerXml}
  </YevmiyeKayitlari>

  <!-- Dönem Toplamları -->
  <DonemToplami>
    <ToplamBorc>${ctx.toplamBorc.toFixed(2)}</ToplamBorc>
    <ToplamAlacak>${ctx.toplamAlacak.toFixed(2)}</ToplamAlacak>
    <FisAdedi>${ctx.fisler.length}</FisAdedi>
  </DonemToplami>

</YevmiyeDefteri>`;
  }

  private renderFis(fis: RawFis): string {
    const satirlar = (fis.satirlar as Satir[])
      .map(
        (s) => `      <Satir>
        <HesapKodu>${escXml(s.hesapKodu)}</HesapKodu>
        <Aciklama>${escXml(s.aciklama)}</Aciklama>
        <Borc>${parseFloat(s.borc).toFixed(2)}</Borc>
        <Alacak>${parseFloat(s.alacak).toFixed(2)}</Alacak>
      </Satir>`,
      )
      .join('\n');

    return `    <YevmiyeKaydi>
      <FisNo>${escXml(fis.fisNo)}</FisNo>
      <Tarih>${toGibDate(new Date(fis.tarih))}</Tarih>
      <Aciklama>${escXml(fis.aciklama)}</Aciklama>
      <Satirlar>
${satirlar}
      </Satirlar>
    </YevmiyeKaydi>`;
  }
}

// ─── Tip tanımları ─────────────────────────────────────────────────────────

interface Satir {
  hesapKodu: string;
  aciklama:  string;
  borc:      string;  // NUMERIC string
  alacak:    string;  // NUMERIC string
}

interface RawFis {
  id:          string;
  fisNo:       string;
  tarih:       string;
  aciklama:    string;
  referansTipi: string | null;
  referansId:   string | null;
  satirlar:    Satir[] | string;
}

interface RenderContext {
  donem:         DonemDto;
  vkn:           string;
  unvan:         string;
  periodStart:   Date;
  periodEnd:     Date;
  fisler:        RawFis[];
  toplamBorc:    number;
  toplamAlacak:  number;
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

/** GİB tarih formatı: YYYY-MM-DD */
function toGibDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** GİB tarih-saat formatı: YYYY-MM-DDTHH:mm:ss */
function toGibDateTime(d: Date): string {
  return d.toISOString().slice(0, 19);
}

/** XML özel karakterleri kaçış karakterine çevir */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

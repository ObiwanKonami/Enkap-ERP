import { Injectable, Logger } from '@nestjs/common';
import { getTenantContext, TenantDataSourceManager } from '@enkap/database';
import { donemLabel, type DonemDto } from '../dto/donem.dto';

/**
 * Büyük Defter (General Ledger) servisi.
 *
 * Büyük Defter: her hesap için dönem içindeki tüm hareketleri
 * ve açılış/kapanış bakiyelerini gösterir.
 *
 * GİB e-Defter gereksinimi:
 *  - Yevmiye ile aynı dönem olmalı
 *  - Her hesap için: açılış borç/alacak, hareket toplamları, kapanış bakiyesi
 *  - Hesap kodları TDHP (Tekdüzen Hesap Planı) uyumlu olmalı
 */
@Injectable()
export class BuyukDefterService {
  private readonly logger = new Logger(BuyukDefterService.name);

  constructor(
    private readonly dataSourceManager: TenantDataSourceManager,
  ) {}

  /**
   * Dönem için Büyük Defter XML üretir.
   *
   * Hesaplama:
   *  - Açılış bakiyesi: dönem başı öncesi tüm hareketlerin net toplamı
   *  - Dönem hareketleri: belirtilen dönem içindeki journal_entry_lines
   *  - Kapanış bakiyesi: açılış + dönem net hareketi
   */
  async buildBuyukDefterXml(
    donem: DonemDto,
    vkn: string,
    unvan: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string> {
    const { tenantId } = getTenantContext();
    const dataSource = await this.dataSourceManager.getDataSource(tenantId);

    this.logger.log(
      `Büyük Defter XML üretiliyor: tenant=${tenantId} dönem=${donemLabel(donem)}`,
    );

    // Her hesap için açılış, dönem hareketleri ve kapanış tek sorguda
    const hesaplar = await dataSource.query<RawHesapHareketi[]>(
      `SELECT
         a.code              AS "hesapKodu",
         a.name              AS "hesapAdi",
         a.type              AS "hesapTuru",
         a.normal_balance    AS "normalBakiye",

         -- Açılış bakiyesi: dönem öncesindeki kümülatif hareketler
         COALESCE(SUM(jel.debit_amount)  FILTER (
           WHERE je.entry_date < $2 AND je.is_posted = true
         ), 0) AS "acilisBorc",
         COALESCE(SUM(jel.credit_amount) FILTER (
           WHERE je.entry_date < $2 AND je.is_posted = true
         ), 0) AS "acilisAlacak",

         -- Dönem hareketleri
         COALESCE(SUM(jel.debit_amount)  FILTER (
           WHERE je.entry_date BETWEEN $2 AND $3 AND je.is_posted = true
         ), 0) AS "donemBorc",
         COALESCE(SUM(jel.credit_amount) FILTER (
           WHERE je.entry_date BETWEEN $2 AND $3 AND je.is_posted = true
         ), 0) AS "donemAlacak",

         -- Dönem içi hareket sayısı
         COUNT(jel.id) FILTER (
           WHERE je.entry_date BETWEEN $2 AND $3 AND je.is_posted = true
         ) AS "hareketSayisi"

       FROM accounts a
       LEFT JOIN journal_entry_lines jel
         ON jel.account_code = a.code AND jel.tenant_id = $1
       LEFT JOIN journal_entries je
         ON je.id = jel.entry_id
       WHERE a.tenant_id = $1
         AND a.is_postable = true
       GROUP BY a.code, a.name, a.type, a.normal_balance
       HAVING
         -- Açılış bakiyesi olan veya dönem hareketi olan hesapları dahil et
         COALESCE(SUM(jel.debit_amount),  0) > 0 OR
         COALESCE(SUM(jel.credit_amount), 0) > 0
       ORDER BY a.code`,
      [tenantId, periodStart, periodEnd],
    );

    this.logger.debug(
      `Büyük Defter: ${hesaplar.length} hesap, dönem=${donemLabel(donem)}`,
    );

    return this.renderBuyukDefterXml({
      donem,
      vkn,
      unvan,
      periodStart,
      periodEnd,
      hesaplar,
    });
  }

  private renderBuyukDefterXml(ctx: RenderContext): string {
    const hesaplarXml = ctx.hesaplar
      .map((h) => this.renderHesap(h))
      .join('\n');

    const toplamDonemBorc   = ctx.hesaplar.reduce((s, h) => s + parseFloat(h.donemBorc),   0);
    const toplamDonemAlacak = ctx.hesaplar.reduce((s, h) => s + parseFloat(h.donemAlacak), 0);

    return `<?xml version="1.0" encoding="UTF-8"?>
<BuyukDefter
  xmlns="urn:gib:edefter:buyukdefter:1.7"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="urn:gib:edefter:buyukdefter:1.7 BuyukDefter_v1.7.xsd">

  <!-- Defter Bilgileri -->
  <DefterBilgileri>
    <DefterTuru>BuyukDefter</DefterTuru>
    <Donem>
      <BaslangicTarihi>${toGibDate(ctx.periodStart)}</BaslangicTarihi>
      <BitisTarihi>${toGibDate(ctx.periodEnd)}</BitisTarihi>
    </Donem>
    <OlusturmaTarihi>${toGibDateTime(new Date())}</OlusturmaTarihi>
  </DefterBilgileri>

  <!-- Mükellef Bilgileri -->
  <MukellefBilgileri>
    <VKN>${escXml(ctx.vkn)}</VKN>
    <UnvanAdi>${escXml(ctx.unvan)}</UnvanAdi>
  </MukellefBilgileri>

  <!-- Hesap Hareketleri -->
  <HesapHareketleri>
${hesaplarXml}
  </HesapHareketleri>

  <!-- Dönem Özeti -->
  <DonemOzeti>
    <HesapAdedi>${ctx.hesaplar.length}</HesapAdedi>
    <ToplamDonemBorc>${toplamDonemBorc.toFixed(2)}</ToplamDonemBorc>
    <ToplamDonemAlacak>${toplamDonemAlacak.toFixed(2)}</ToplamDonemAlacak>
  </DonemOzeti>

</BuyukDefter>`;
  }

  private renderHesap(h: RawHesapHareketi): string {
    const acilisBorc   = parseFloat(h.acilisBorc);
    const acilisAlacak = parseFloat(h.acilisAlacak);
    const donemBorc    = parseFloat(h.donemBorc);
    const donemAlacak  = parseFloat(h.donemAlacak);

    // Kapanış bakiyesi: borç normal bakiyeli hesaplar için (B - A)
    // alacak normal bakiyeli hesaplar için (A - B)
    const kapanis =
      h.normalBakiye === 'DEBIT'
        ? (acilisBorc + donemBorc) - (acilisAlacak + donemAlacak)
        : (acilisAlacak + donemAlacak) - (acilisBorc + donemBorc);

    return `    <HesapHareketi>
      <HesapKodu>${escXml(h.hesapKodu)}</HesapKodu>
      <HesapAdi>${escXml(h.hesapAdi)}</HesapAdi>
      <HesapTuru>${escXml(h.hesapTuru)}</HesapTuru>
      <AcilisBakiyesi>
        <Borc>${acilisBorc.toFixed(2)}</Borc>
        <Alacak>${acilisAlacak.toFixed(2)}</Alacak>
      </AcilisBakiyesi>
      <DonemHareketleri>
        <ToplamBorc>${donemBorc.toFixed(2)}</ToplamBorc>
        <ToplamAlacak>${donemAlacak.toFixed(2)}</ToplamAlacak>
        <HareketSayisi>${h.hareketSayisi}</HareketSayisi>
      </DonemHareketleri>
      <KapanisBakiyesi>${kapanis.toFixed(2)}</KapanisBakiyesi>
    </HesapHareketi>`;
  }
}

// ─── Tip tanımları ─────────────────────────────────────────────────────────

interface RawHesapHareketi {
  hesapKodu:      string;
  hesapAdi:       string;
  hesapTuru:      string;
  normalBakiye:   string;
  acilisBorc:     string;
  acilisAlacak:   string;
  donemBorc:      string;
  donemAlacak:    string;
  hareketSayisi:  string;
}

interface RenderContext {
  donem:       DonemDto;
  vkn:         string;
  unvan:       string;
  periodStart: Date;
  periodEnd:   Date;
  hesaplar:    RawHesapHareketi[];
}

// ─── Yardımcılar ───────────────────────────────────────────────────────────

function toGibDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toGibDateTime(d: Date): string {
  return d.toISOString().slice(0, 19);
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

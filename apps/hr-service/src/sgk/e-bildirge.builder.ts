/**
 * SGK e-Bildirge XML Üreticisi.
 *
 * Yasal dayanak: 5510 Sayılı Kanun + SGK e-Bildirge Teknik Kılavuzu
 * Web servis: https://ebildirge.sgk.gov.tr (SOAP/REST)
 *
 * Bu builder GİB-uyumlu XML üretir. Gerçek gönderim için SGK web servis
 * entegrasyonu ve sertifika tabanlı kimlik doğrulama gerekir.
 *
 * XML Yapısı (4a — Aylık Prim ve Hizmet Belgesi):
 *  <EBildirge>
 *    <IsyeriBilgileri>
 *      <SgkSicilNo>...</SgkSicilNo>
 *      <IsyeriAdi>...</IsyeriAdi>
 *    </IsyeriBilgileri>
 *    <Donem>YYYY-MM</Donem>
 *    <SigortaliListesi>
 *      <Sigortalı>
 *        <Tckn>...</Tckn>
 *        <AdSoyad>...</AdSoyad>
 *        <SgkNo>...</SgkNo>
 *        <PrimGunSayisi>N</PrimGunSayisi>
 *        <BrutUcretKurus>N</BrutUcretKurus>
 *        <SgkMatrahKurus>N</SgkMatrahKurus>
 *        <SgkIsciKurus>N</SgkIsciKurus>
 *        <SgkIsverenKurus>N</SgkIsverenKurus>
 *      </Sigortalı>
 *    </SigortaliListesi>
 *    <ToplamBilgileri>...</ToplamBilgileri>
 *  </EBildirge>
 */

export interface SgkSigortaliBilgisi {
  tckn:             string;
  adSoyad:          string;
  sgkNo:            string | null;
  primGunSayisi:    number;
  brutUcretKurus:   number;
  sgkMatrahKurus:   number;
  sgkIsciKurus:     number;
  sgkIsverenKurus:  number;
}

export interface EBildirgeData {
  sgkSicilNo:       string;
  isyeriAdi:        string;
  year:             number;
  month:            number;
  sigortalilar:     SgkSigortaliBilgisi[];
  toplamBrut:       number;
  toplamSgkIsci:    number;
  toplamSgkIsveren: number;
}

export function buildEBildirgeXml(data: EBildirgeData): string {
  const period = `${data.year}-${String(data.month).padStart(2, '0')}`;

  const sigortaliXml = data.sigortalilar
    .map(
      (s) => `    <Sigortalı>
      <Tckn>${s.tckn}</Tckn>
      <AdSoyad>${escapeXml(s.adSoyad)}</AdSoyad>
      <SgkNo>${s.sgkNo ?? ''}</SgkNo>
      <PrimGunSayisi>${s.primGunSayisi}</PrimGunSayisi>
      <BrutUcretKurus>${s.brutUcretKurus}</BrutUcretKurus>
      <SgkMatrahKurus>${s.sgkMatrahKurus}</SgkMatrahKurus>
      <SgkIsciKurus>${s.sgkIsciKurus}</SgkIsciKurus>
      <SgkIsverenKurus>${s.sgkIsverenKurus}</SgkIsverenKurus>
    </Sigortalı>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<EBildirge xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <IsyeriBilgileri>
    <SgkSicilNo>${escapeXml(data.sgkSicilNo)}</SgkSicilNo>
    <IsyeriAdi>${escapeXml(data.isyeriAdi)}</IsyeriAdi>
  </IsyeriBilgileri>
  <Donem>${period}</Donem>
  <SigortaliListesi>
${sigortaliXml}
  </SigortaliListesi>
  <ToplamBilgileri>
    <SigortaliSayisi>${data.sigortalilar.length}</SigortaliSayisi>
    <ToplamBrutUcretKurus>${data.toplamBrut}</ToplamBrutUcretKurus>
    <ToplamSgkIsciKurus>${data.toplamSgkIsci}</ToplamSgkIsciKurus>
    <ToplamSgkIsverenKurus>${data.toplamSgkIsveren}</ToplamSgkIsverenKurus>
  </ToplamBilgileri>
</EBildirge>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

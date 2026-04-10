import type { BaFormData } from './ba-bs.service';

/**
 * Ba Formu XML Üreticisi.
 *
 * GİB İnteraktif Vergi Dairesi Ba Formu formatı:
 *  Kaynak: GİB Ba-Bs Form Teknik Kılavuzu (VUK 396 Tebliği)
 *
 * XML şeması:
 *  <BAFormu>
 *    <BildirimDonemi> YYYY-MM </BildirimDonemi>
 *    <MukellefBilgileri>
 *      <VKN>XXXXXXXXXX</VKN>
 *      <Unvan>...</Unvan>
 *    </MukellefBilgileri>
 *    <AlisListesi>
 *      <Alis>
 *        <SaticiVKN>...</SaticiVKN>
 *        <SaticiUnvan>...</SaticiUnvan>
 *        <Matrah>NNNN.NN</Matrah>
 *        <FaturaSayisi>N</FaturaSayisi>
 *      </Alis>
 *      ...
 *    </AlisListesi>
 *    <ToplamBilgileri>
 *      <ToplamMatrah>...</ToplamMatrah>
 *      <ToplamFaturaSayisi>...</ToplamFaturaSayisi>
 *    </ToplamBilgileri>
 *  </BAFormu>
 */
export function buildBaXml(data: BaFormData): string {
  const period = `${data.year}-${String(data.month).padStart(2, '0')}`;

  const alislerXml = data.items
    .map(
      (item) => `    <Alis>
      <SaticiVKN>${escapeXml(item.vergiKimlikNo)}</SaticiVKN>
      <SaticiUnvan>${escapeXml(item.unvan)}</SaticiUnvan>
      <Matrah>${item.matrah.toFixed(2)}</Matrah>
      <FaturaSayisi>${item.faturaSayisi}</FaturaSayisi>
    </Alis>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<BAFormu xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <BildirimDonemi>${period}</BildirimDonemi>
  <MukellefBilgileri>
    <VKN>${escapeXml(data.vkn)}</VKN>
    <Unvan>${escapeXml(data.unvan)}</Unvan>
  </MukellefBilgileri>
  <AlisListesi>
${alislerXml}
  </AlisListesi>
  <ToplamBilgileri>
    <ToplamMatrah>${data.toplamMatrah.toFixed(2)}</ToplamMatrah>
    <ToplamFaturaSayisi>${data.toplamFaturaSayisi}</ToplamFaturaSayisi>
  </ToplamBilgileri>
</BAFormu>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

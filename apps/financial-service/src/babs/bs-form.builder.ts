import type { BsFormData } from './ba-bs.service';

/**
 * Bs Formu XML Üreticisi.
 *
 * GİB İnteraktif Vergi Dairesi Bs Formu formatı (VUK 396 Tebliği).
 *
 * XML şeması:
 *  <BSFormu>
 *    <BildirimDonemi> YYYY-MM </BildirimDonemi>
 *    <MukellefBilgileri>
 *      <VKN>XXXXXXXXXX</VKN>
 *      <Unvan>...</Unvan>
 *    </MukellefBilgileri>
 *    <SatisListesi>
 *      <Satis>
 *        <AliciVKN>...</AliciVKN>
 *        <AliciUnvan>...</AliciUnvan>
 *        <Matrah>NNNN.NN</Matrah>
 *        <FaturaSayisi>N</FaturaSayisi>
 *      </Satis>
 *      ...
 *    </SatisListesi>
 *    <ToplamBilgileri>
 *      <ToplamMatrah>...</ToplamMatrah>
 *      <ToplamFaturaSayisi>...</ToplamFaturaSayisi>
 *    </ToplamBilgileri>
 *  </BSFormu>
 */
export function buildBsXml(data: BsFormData): string {
  const period = `${data.year}-${String(data.month).padStart(2, '0')}`;

  const satislerXml = data.items
    .map(
      (item) => `    <Satis>
      <AliciVKN>${escapeXml(item.vergiKimlikNo)}</AliciVKN>
      <AliciUnvan>${escapeXml(item.unvan)}</AliciUnvan>
      <Matrah>${item.matrah.toFixed(2)}</Matrah>
      <FaturaSayisi>${item.faturaSayisi}</FaturaSayisi>
    </Satis>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<BSFormu xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <BildirimDonemi>${period}</BildirimDonemi>
  <MukellefBilgileri>
    <VKN>${escapeXml(data.vkn)}</VKN>
    <Unvan>${escapeXml(data.unvan)}</Unvan>
  </MukellefBilgileri>
  <SatisListesi>
${satislerXml}
  </SatisListesi>
  <ToplamBilgileri>
    <ToplamMatrah>${data.toplamMatrah.toFixed(2)}</ToplamMatrah>
    <ToplamFaturaSayisi>${data.toplamFaturaSayisi}</ToplamFaturaSayisi>
  </ToplamBilgileri>
</BSFormu>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

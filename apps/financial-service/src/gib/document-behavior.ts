/**
 * GİB e-Belge İletim Kategori Yönlendirici
 *
 * VUK 509 kapsamındaki belgeler iletim protokolü bakımından iki ana kategoriye ayrılır:
 *
 *  ENVELOPE  — GİB EF-VAP üzerinden anlık iletim (SOAP 1.2 + MTOM)
 *              Tenant'ın mali mühürü kullanılır.
 *              Belge GİB'e gerçek zamanlı gönderilir; polling ile durum takip edilir.
 *
 *  REPORTING — GİB Raporlama API'si üzerinden gecikmeli iletim
 *              Enkap entegratörünün mali mühürü kullanılır.
 *              Belge müşteriye iletilir; her gece 23:59'da toplu eArsivRaporu GİB'e bildirilir.
 */

export enum DocumentBehavior {
  ENVELOPE = 'ENVELOPE',
  REPORTING = 'REPORTING',
}

/**
 * ProfileID → DocumentBehavior eşlemesi.
 * Burada listelenmeyenler ENVELOPE olarak kabul edilir (güvenli varsayılan).
 */
const REPORTING_PROFILES = new Set([
  'EARSIVFATURA',   // e-Arşiv Fatura (B2C)
  'ESMM',           // e-Serbest Meslek Makbuzu
  'EMM',            // e-Müstahsil Makbuzu
  'EBILET',         // e-Bilet
  'EADISYON',       // e-Adisyon
  'EDOVIZ',         // e-Döviz
]);

/**
 * Belgenin iletim kategorisini döner.
 * REPORTING → günlük batch rapor + entegratör mühürü
 * ENVELOPE  → anlık SOAP gönderim + tenant mühürü
 */
export function getDocumentBehavior(profileId: string): DocumentBehavior {
  return REPORTING_PROFILES.has(profileId)
    ? DocumentBehavior.REPORTING
    : DocumentBehavior.ENVELOPE;
}

/**
 * İmzalama türünü döner.
 * REPORTING belgeler Enkap'ın entegratör mühürüyle imzalanır.
 * ENVELOPE belgeler tenant'ın kendi mali mühürüyle imzalanır.
 */
export function getSignerType(profileId: string): 'TENANT' | 'INTEGRATOR' {
  return getDocumentBehavior(profileId) === DocumentBehavior.REPORTING
    ? 'INTEGRATOR'
    : 'TENANT';
}

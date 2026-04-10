import type { KdvRate, TevkifatRatio } from '@enkap/shared-types';
import { Money } from '../shared/money';

/** Tek bir KDV hesaplama girdisi */
export interface KdvInput {
  /** KDV matrahı (KDV'siz tutar) */
  readonly matrah: Money;
  /** KDV oranı: 0 | 1 | 10 | 20 */
  readonly rate: KdvRate;
  /** Tevkifat uygulanacak mı? */
  readonly tevkifat?: TevkifatRatio;
}

/** Tek bir KDV hesaplama sonucu */
export interface KdvResult {
  readonly matrah: Money;
  readonly rate: KdvRate;
  /** Hesaplanan brüt KDV tutarı */
  readonly kdvAmount: Money;
  /** Tevkifat sonrası alıcının ödeyeceği KDV (tevkifat yoksa kdvAmount ile aynı) */
  readonly kdvPayable: Money;
  /** Satıcının tahsil edeceği KDV (tevkifatlı faturalarda düşük olur) */
  readonly kdvCollected: Money;
  readonly tevkifat?: TevkifatRatio;
}

/** Fatura genelinde KDV özeti */
export interface KdvSummary {
  readonly lines: KdvResult[];
  /** Toplam matrah */
  readonly totalMatrah: Money;
  /** Toplam KDV */
  readonly totalKdv: Money;
  /** Genel toplam (matrah + KDV) */
  readonly genelToplam: Money;
}

/**
 * Tevkifat kodu → oran eşlemesi.
 *
 * KDV Genel Uygulama Tebliği'ne göre zorunlu tevkifat oranları.
 * Alıcı türü ve hizmet tipine göre belirlenir.
 */
export const TEVKIFAT_ORANLARI: Record<string, TevkifatRatio> = {
  // Yapım işleri (kamu)
  'YAKIM_ISLERI': { numerator: 3, denominator: 10 },
  // Temizlik, yemek, bahçe bakım hizmetleri
  'TEMIZLIK_YEMEK': { numerator: 7, denominator: 10 },
  // Fason tekstil, konfeksiyon
  'FASON_TEKSTIL': { numerator: 5, denominator: 10 },
  // Yazılım, danışmanlık, muhasebe
  'YAZILIM_DANISMANLIK': { numerator: 2, denominator: 10 },
  // Taşımacılık
  'TASIMACILIK': { numerator: 2, denominator: 10 },
  // Kiralama
  'KIRALAMA': { numerator: 5, denominator: 10 },
  // Reklam hizmetleri
  'REKLAM': { numerator: 3, denominator: 10 },
  // İnsan kaynakları
  'INSAN_KAYNAKLARI': { numerator: 9, denominator: 10 },
  // Güvenlik hizmetleri
  'GUVENLIK': { numerator: 7, denominator: 10 },
} as const;

export type TevkifatKodu = keyof typeof TEVKIFAT_ORANLARI;

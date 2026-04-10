/**
 * Türkçe push bildirim şablonları.
 *
 * KVKK kuralı: Bildirim içeriğinde kişisel veri bulunmaz.
 * Sadece referans numarası/kodu kullanılır — asıl veri uygulama açıldığında çekilir.
 *
 * Sessiz bildirim (data-only) seçeneği: arka planda sync tetikler,
 * kullanıcıya görünmez bildirim gösterilmez.
 */

export interface PushNotificationPayload {
  title: string;
  body: string;
  /** Uygulama içinde yönlendirme için derin link verisi */
  data?: Record<string, string>;
  /** Büyük bildirim ikonu (opsiyonel) */
  imageUrl?: string;
}

// ─── Stok Uyarıları ──────────────────────────────────────────────────────────

export function kritikStokUyarisi(params: {
  urunAdi: string;
  mevcutMiktar: number;
  birim: string;
}): PushNotificationPayload {
  return {
    title: '⚠️ Kritik Stok Uyarısı',
    body: `${params.urunAdi}: ${params.mevcutMiktar} ${params.birim} kaldı. Sipariş verme zamanı!`,
    data: { screen: 'stock', action: 'critical_stock' },
  };
}

export function stokTukendiUyarisi(params: { urunAdi: string }): PushNotificationPayload {
  return {
    title: '🔴 Stok Tükendi',
    body: `${params.urunAdi} stoku tükendi.`,
    data: { screen: 'stock', action: 'out_of_stock' },
  };
}

// ─── Fatura Uyarıları ─────────────────────────────────────────────────────────

export function faturaVadesiYaklasiyor(params: {
  faturaNo: string;
  kalanGun: number;
}): PushNotificationPayload {
  const gun = params.kalanGun === 1 ? 'yarın' : `${params.kalanGun} gün sonra`;
  return {
    title: '📅 Fatura Vadesi Yaklaşıyor',
    body: `#${params.faturaNo} nolu fatura ${gun} vadesi dolacak.`,
    data: { screen: 'invoices', action: 'due_soon', invoiceNo: params.faturaNo },
  };
}

export function faturaVadesiGecti(params: { faturaNo: string }): PushNotificationPayload {
  return {
    title: '🔴 Vadesi Geçmiş Fatura',
    body: `#${params.faturaNo} nolu faturanın vadesi geçti.`,
    data: { screen: 'invoices', action: 'overdue', invoiceNo: params.faturaNo },
  };
}

export function faturaOdendi(params: { faturaNo: string }): PushNotificationPayload {
  return {
    title: '✅ Ödeme Alındı',
    body: `#${params.faturaNo} nolu fatura ödendi.`,
    data: { screen: 'invoices', action: 'paid', invoiceNo: params.faturaNo },
  };
}

// ─── ML Anomali Uyarıları ─────────────────────────────────────────────────────

export type AnomalyShiddet = 'dusuk' | 'orta' | 'yuksek';

const ANOMALY_ICONS: Record<AnomalyShiddet, string> = {
  dusuk: '🟡',
  orta: '🟠',
  yuksek: '🔴',
};

export function mlAnomaliBildirimi(params: {
  alan: string;       // 'satış' | 'nakit akışı' | 'stok'
  shiddet: AnomalyShiddet;
  aciklama: string;
}): PushNotificationPayload {
  const ikon = ANOMALY_ICONS[params.shiddet];
  return {
    title: `${ikon} Anomali Tespit Edildi`,
    body: `${params.alan} verilerinde olağandışı durum: ${params.aciklama}`,
    data: { screen: 'dashboard', action: 'anomaly', alan: params.alan },
  };
}

// ─── Marketplace Sipariş Bildirimleri ─────────────────────────────────────────

export function yeniMarketplaceSiparis(params: {
  platform: string;   // 'Trendyol' | 'Hepsiburada'
  siparisNo: string;
}): PushNotificationPayload {
  return {
    title: `🛍️ Yeni ${params.platform} Siparişi`,
    body: `${params.siparisNo} nolu sipariş alındı. Hazırlamaya başlayın!`,
    data: {
      screen: 'marketplace',
      action: 'new_order',
      platform: params.platform,
      orderNo: params.siparisNo,
    },
  };
}

export function siparisKargolandi(params: {
  platform: string;
  siparisNo: string;
  kargoTakipNo: string;
}): PushNotificationPayload {
  return {
    title: `📦 Sipariş Kargolandı`,
    body: `${params.siparisNo} nolu sipariş kargoya verildi. Takip: ${params.kargoTakipNo}`,
    data: {
      screen: 'marketplace',
      action: 'shipped',
      platform: params.platform,
      orderNo: params.siparisNo,
    },
  };
}

// ─── Sessiz Bildirimler (data-only) ──────────────────────────────────────────

/**
 * Arka planda WatermelonDB sync'i tetiklemek için sessiz bildirim.
 * Kullanıcıya görünmez — sistem tarafından işlenir.
 */
export const SILENT_SYNC_PAYLOAD: PushNotificationPayload = {
  title: '',
  body: '',
  data: { action: 'background_sync', silent: 'true' },
};

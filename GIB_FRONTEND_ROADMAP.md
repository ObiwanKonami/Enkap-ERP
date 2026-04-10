# Frontend (Next.js) GİB Entegrasyon Yol Haritası

> Tarih: 2026-04-01
> Hazırlayan: Kıdemli Yazılım Mimarı — Backend Tarama Sonrası

---

## Genel Bakış

Bu yol haritası, backend'deki GİB entegrasyon altyapısının (MTOM SOAP, XAdES-BES, Zarf/Envelope, e-Arşiv Raporlama) frontend tarafında kullanıcıya sunulması için gerekli Next.js sayfaları, bileşenler ve akışları tanımlar.

**Önkoşul:** Backend GİB servisleri (`GibSubmissionService`, `GibEnvelopeService`, `ApplicationResponseService`, `ArchiveReportingService`, `GibPollingService`) stabilize edilmiş ve çalışır durumda olmalıdır.

---

## Aşama 1: Sektörel Fatura/İrsaliye Form Ekranları

### 1.1 Fatura Gönderim Formu (`/faturalar/[id]/gib-gonder`)

**Amaç:** Onaylanmış (`APPROVED`) faturayı GİB'e göndermek için kullanıcıdan gerekli parametreleri toplar.

**Form Alanları (Zod validasyonlu):**

```typescript
// apps/web/src/lib/validations/gib-send.ts
import { z } from 'zod';

export const gibSendSchema = z.object({
  invoiceId: z.string().uuid(),
  profileId: z.enum([
    'TICARIFATURA', 'TEMELFATURA', 'EARSIVFATURA',
    'ESMM', 'EMM', 'EBILET', 'EADISYON', 'EDOVIZ',
  ]),
  invoiceTypeCode: z.enum(['SATIS', 'IADE', 'TEVKIFAT', 'ISTISNA', 'OZELMATRAH', 'IHRAC']),
  receiverAlias: z.string().min(5, 'Alıcı GB/PK adresi gereklidir'),
  senderAlias: z.string().optional(),
  documentNumber: z.string().optional(),

  // Sektörel alanlar — profileId'ye göre koşullu
  sectoral: z.object({
    // SGK profili
    iban: z.string().regex(/^TR\d{24}$/, 'Geçerli IBAN giriniz').optional(),
    // ENERJI profili
    schemeId: z.enum(['PLAKA', 'ARACKIMLIKNO']).optional(),
    vehicleId: z.string().optional(),
    // ILAC_TIBBICIHAZ profili
    gtinBarcode: z.string().regex(/^\d{8,14}$/, 'Geçerli GTIN giriniz').optional(),
    // IDIS profili
    shipmentNumber: z.string().regex(/^SE-\d{7}$/).optional(),
    labelNumber: z.string().regex(/^CV\d{7}$/).optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  // Koşullu validasyonlar
  if (data.profileId === 'TICARIFATURA' || data.profileId === 'TEMELFATURA') {
    if (!data.receiverAlias) {
      ctx.addIssue({ code: 'custom', path: ['receiverAlias'], message: 'e-Fatura için alıcı GB adresi zorunludur' });
    }
  }
});
```

**UI Bileşenleri:**
- `ProfileIdSelector` — Profil seçimine göre form alanlarını dinamik göster/gizle
- `ReceiverAliasSearch` — GİB mükellef sorgulama (autocomplete) → backend `/gib/receivers/search`
- `SectoralFieldGroup` — Seçilen profile göre sektörel alanları render et
- `GibSendConfirmDialog` — Son onay dialog'u (profil, alıcı, belge türü özeti)

**Akış:**
1. Kullanıcı `/faturalar` → ilgili faturayı seçer → "GİB'e Gönder" butonu
2. Form açılır, fatura bilgileri readonly gösterilir
3. ProfileID seçimi → koşullu alanlar render edilir
4. Zod validasyon geçerse → `POST /api/gib/invoices/send` çağrılır
5. Başarılı → zarf ID ile `/gib/zarflar/[envelopeId]` sayfasına yönlendir
6. Hata → toast ile hata mesajı göster

### 1.2 İrsaliye GİB Gönderim Formu (`/irsaliyeler/[id]/gib-gonder`)

**Amaç:** Onaylanmış irsaliyeyi e-İrsaliye olarak GİB'e göndermek.

**Form Alanları:**
```typescript
export const gibWaybillSendSchema = z.object({
  waybillId: z.string().uuid(),
  receiverAlias: z.string().min(5),
  vehiclePlate: z.string().regex(/^(0[1-9]|[1-7]\d|8[01])[A-Z]{1,3}\d{2,4}$/, 'Geçerli plaka giriniz').optional(),
  driverTckn: z.string().length(11).optional(),
  shipmentDate: z.string().datetime().optional(),
});
```

---

## Aşama 2: GİB Zarflar Dashboard (`/gib/zarflar`)

### 2.1 Giden Zarflar Listesi

**Sayfa:** `/gib/zarflar` (DataTable)

**KPI Kartları:**
| KPI | Açıklama | Renk/İkon |
|-----|---------|-----------|
| Toplam Gönderim | Bu ay gönderilen zarf sayısı | Mavi / `Send` |
| Başarılı | `status=SUCCESS` | Yeşil / `CheckCircle` |
| İşlemde | `status=PROCESSING` | Sarı / `Clock` |
| Hata | `status=FAILED` | Kırmızı / `AlertTriangle` |

**Tablo Kolonları:**
| Kolon | Kaynak | Format |
|-------|--------|--------|
| Zarf ID | `gib_envelopes.id` | UUID (kısaltılmış) |
| Belge No | İlişkili fatura/irsaliye numarası | — |
| Tür | `SENDERENVELOPE` / `POSTBOXENVELOPE` | Badge |
| Yön | `IN` / `OUT` | Ok ikonu |
| Durum | `PENDING` / `PROCESSING` / `SUCCESS` / `FAILED` | Status badge |
| GİB Kodu | `gib_status_code` | Tooltip ile açıklama |
| Gönderim | `sent_at` | `formatDateTime()` |
| Son Polling | `last_polled_at` | Relative time |

**Durum Badge Renkleri (GİB Durum Kodları):**
```typescript
// apps/web/src/lib/gib-status.ts
export const GIB_STATUS_BADGE: Record<string, { color: string; label: string }> = {
  PENDING:    { color: 'bg-gray-100 text-gray-700',   label: 'Bekliyor' },
  PROCESSING: { color: 'bg-yellow-100 text-yellow-700', label: 'İşleniyor' },
  SUCCESS:    { color: 'bg-green-100 text-green-700',   label: 'Başarılı' },
  FAILED:     { color: 'bg-red-100 text-red-700',       label: 'Hata' },
};

export const GIB_STATUS_CODE_MAP: Record<number, { category: string; description: string }> = {
  1000: { category: 'PENDING',   description: 'Kuyruğa eklendi' },
  1100: { category: 'PENDING',   description: 'İşleniyor' },
  1140: { category: 'FATAL',     description: 'Şema hatası' },
  1150: { category: 'FATAL',     description: 'Schematron hatası' },
  1160: { category: 'FATAL',     description: 'İmza/iş kuralı hatası' },
  1163: { category: 'FATAL',     description: 'ETTN çakışması' },
  1164: { category: 'FATAL',     description: 'Belge numarası çakışması' },
  1200: { category: 'PENDING',   description: 'Alıcıya iletildi' },
  1210: { category: 'FATAL',     description: 'Alıcı adresi bulunamadı' },
  1215: { category: 'FATAL',     description: 'Alıcı posta kutusu dolu' },
  1220: { category: 'RETRYABLE', description: 'Yanıt bekleniyor (max 48 saat)' },
  1230: { category: 'FATAL',     description: 'Alıcı zarfı reddetti' },
  1300: { category: 'SUCCESS',   description: 'Başarıyla tamamlandı' },
};
```

**Filtreler:**
- Durum: `PENDING` | `PROCESSING` | `SUCCESS` | `FAILED`
- Yön: `IN` | `OUT`
- Tarih aralığı
- Arama: zarf ID, belge numarası

### 2.2 Zarf Detay Sayfası (`/gib/zarflar/[id]`)

**İçerik:**
- Zarf bilgileri (tür, yön, alias'lar, hash'ler)
- GİB durum geçmişi (timeline bileşeni)
- İlişkili belge (fatura/irsaliye) linki
- GİB ham yanıt (collapsible code block)
- Polling bilgisi (sonraki polling zamanı, deneme sayısı)
- Hata durumunda: "Tekrar Gönder" butonu (yeni zarf oluşturur)

### 2.3 Gelen Zarflar (`/gib/gelen-zarflar`)

**Amaç:** `incoming_envelopes` tablosundaki gelen zarfları listele.

**Tablo Kolonları:**
| Kolon | Açıklama |
|-------|---------|
| Zarf ID | GİB zarf UUID |
| Gönderen | `sender_alias` |
| Belge Türü | `INVOICE` / `APPLICATIONRESPONSE` / `RECEIPTADVICE` |
| İşlenme Durumu | `processed` boolean → badge |
| Alınma Tarihi | `received_at` |
| Hata | `processing_error` (varsa kırmızı tooltip) |

---

## Aşama 3: Ticari Fatura Kabul/Red (`/faturalar/[id]/kabul-red`)

### 3.1 Gelen Fatura Listesi (TICARIFATURA)

**Filtre:** `direction=IN AND profile_id=TICARIFATURA AND commercial_status=BEKLIYOR`

**Özel Kolon: Kalan Süre**
```typescript
// 8 gün (192 saat) kuralı — gib_envelopes.created_at bazlı
const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

function getRemainingTime(envelopeCreatedAt: string): { label: string; urgent: boolean; expired: boolean } {
  const elapsed = Date.now() - new Date(envelopeCreatedAt).getTime();
  const remaining = EIGHT_DAYS_MS - elapsed;

  if (remaining <= 0) return { label: 'Süre doldu', urgent: false, expired: true };

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);

  if (days > 2) return { label: `${days} gün`, urgent: false, expired: false };
  if (hours > 24) return { label: `${days} gün ${hours % 24} saat`, urgent: true, expired: false };
  return { label: `${hours} saat`, urgent: true, expired: false };
}
```

**Kalan Süre Badge:**
- `> 3 gün` → Yeşil badge
- `1–3 gün` → Sarı badge (uyarı)
- `< 24 saat` → Kırmızı badge (acil)
- `Süre doldu` → Gri badge (disabled)

### 3.2 Kabul/Red Formu

**Dialog Bileşeni:** `ApplicationResponseDialog`

```typescript
export const applicationResponseSchema = z.object({
  invoiceId: z.string().uuid(),
  responseType: z.enum(['KABUL', 'RED']),
  rejectionReason: z.string()
    .min(10, 'Red gerekçesi en az 10 karakter olmalıdır')
    .max(500)
    .optional()
    .refine((val, ctx) => {
      // RED seçildiyse gerekçe zorunlu
      // Not: superRefine ile parent'tan responseType alınır
    }),
});
```

**Akış:**
1. Kullanıcı gelen faturayı seçer → "Kabul Et" veya "Reddet" butonu
2. RED seçildiyse: gerekçe textarea açılır (min 10 karakter)
3. 8 gün kuralı kontrolü (frontend + backend çift katman)
4. Süre dolmuşsa butonlar disabled + "Yasal süre dolmuştur" uyarısı
5. `POST /api/gib/invoices/application-response` çağrılır
6. Sonuç toast ile gösterilir

### 3.3 Yanıt Geçmişi

Fatura detay sayfasında `application_responses` tablosundan ilgili yanıtlar listelenir:
- Yanıt tipi (KABUL/RED badge)
- Gönderim tarihi
- Zarf durumu
- Red gerekçesi (varsa)

---

## Aşama 4: Manuel GİB Portal İptal Senkronizasyonu

### 4.1 İptal İşaretleme Formu (`/faturalar/[id]/portal-iptal`)

**Amaç:** GİB portalında manuel iptal edilen faturaları Enkap DB'sinde senkronize eder.

**Form Alanları:**
```typescript
export const portalCancelSchema = z.object({
  reason: z.string().min(5, 'İptal gerekçesi giriniz').max(500),
  gibPortalRef: z.string().optional(), // GİB portal referans numarası
  cancelledAt: z.string().datetime().optional(), // İptal tarihi (varsayılan: şimdi)
});
```

**UI:**
- Fatura detay sayfasında "GİB Portalında İptal Edildi" butonu (sadece `gib_status != 'CANCELLED'` ise görünür)
- Onay dialog'u: "Bu işlem geri alınamaz. Fatura durumu CANCELLED olarak güncellenecektir."
- `POST /api/gib/invoices/:id/mark-cancelled` çağrılır

### 4.2 İptal Edilen Faturalar Filtresi

`/faturalar` sayfasında:
- Filtre: `gib_status=CANCELLED`
- İptal edilen satırlar kırmızı arka plan / üstü çizili stil
- `cancelled_at`, `cancelled_by`, `cancellation_reason` tooltip'te gösterilir

---

## Aşama 5: Tenant GİB Ayarları (`/ayarlar/gib`)

### 5.1 GİB Bağlantı Ayarları

**Sayfa:** `/ayarlar` altında "GİB Entegrasyon" sekmesi

**Form Alanları:**
```typescript
export const gibSettingsSchema = z.object({
  // GB (Gönderici Birim) alias'ı — e-Fatura gönderiminde kullanılır
  gibGbAlias: z.string()
    .regex(/^urn:mail:.+@.+$/, 'Geçerli bir GB alias giriniz (urn:mail:xxx@yyy)')
    .optional(),

  // PK (Posta Kutusu) alias'ı — gelen fatura almada kullanılır
  gibPkAlias: z.string()
    .regex(/^urn:mail:.+@.+$/, 'Geçerli bir PK alias giriniz')
    .optional(),

  // GİB portal kullanıcı adı (bilgi amaçlı)
  gibUsername: z.string().optional(),

  // GİB'e kayıt tarihi
  gibEnrolledAt: z.string().datetime().optional(),
});
```

**UI Düzeni:**
```
┌─────────────────────────────────────────────────┐
│  GİB Entegrasyon Ayarları                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  Gönderici Birim (GB) Alias                     │
│  ┌─────────────────────────────────────────┐    │
│  │ urn:mail:mycompany@efatura.gov.tr       │    │
│  └─────────────────────────────────────────┘    │
│  ℹ️ e-Fatura gönderimlerinde kullanılır         │
│                                                 │
│  Posta Kutusu (PK) Alias                        │
│  ┌─────────────────────────────────────────┐    │
│  │ urn:mail:mycompany-pk@efatura.gov.tr    │    │
│  └─────────────────────────────────────────┘    │
│  ℹ️ Gelen faturaları almak için kullanılır      │
│                                                 │
│  GİB Portal Kullanıcı Adı                      │
│  ┌─────────────────────────────────────────┐    │
│  │ mycompany_gib                           │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  GİB Kayıt Tarihi                               │
│  ┌─────────────────────────────────────────┐    │
│  │ 15.01.2026                              │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  [Kaydet]                                       │
└─────────────────────────────────────────────────┘
```

**Backend Endpoint:**
- `GET  /api/tenant/profile/gib-settings` → mevcut ayarları getir
- `PUT  /api/tenant/profile/gib-settings` → güncelle (`tenant_profiles` tablosu — CP015)

### 5.2 GİB Durum Özeti Widget

Ayarlar sayfasında veya dashboard'da küçük bir widget:
- Son 7 gün gönderim istatistikleri
- Aktif polling sayısı
- Son başarısız gönderimler (varsa uyarı)
- e-Arşiv raporlama durumu (bugün raporlandı mı?)

---

## Aşama 6: e-Arşiv Raporlama Dashboard

### 6.1 Günlük Rapor Listesi (`/gib/arsiv-raporlar`)

**KPI Kartları:**
| KPI | Açıklama |
|-----|---------|
| Bugün Raporlanan | `e_archive_reports` bugün SUCCESS |
| Bekleyen Belgeler | Bugün kesilmiş ama henüz raporlanmamış |
| Son Hata | En son FAILED rapor bilgisi |

**Tablo:**
| Kolon | Kaynak |
|-------|--------|
| Rapor Tarihi | `report_date` |
| Belge Sayısı | `invoice_count` |
| Durum | `status` badge |
| GİB Referans | `gib_reference_number` |
| Deneme Sayısı | `retry_count` |
| Hata | `last_error` (varsa) |

**Aksiyon:**
- FAILED raporlar için "Tekrar Gönder" butonu → `POST /api/gib/archive-reports/retry`
- Rapor detay → ilişkili faturaların listesi

---

## Uygulama Öncelik Sırası

| Öncelik | Aşama | Süre Tahmini | Bağımlılık |
|---------|-------|-------------|-----------|
| P0 | 2.1 Giden Zarflar Dashboard | — | Backend mevcut |
| P0 | 3.1-3.2 Kabul/Red Formu | — | Backend mevcut |
| P1 | 1.1 Fatura GİB Gönderim Formu | — | Backend mevcut |
| P1 | 5.1 Tenant GİB Ayarları | — | CP015 migration mevcut |
| P2 | 4.1 Portal İptal Senkronizasyonu | — | Backend mevcut |
| P2 | 6.1 e-Arşiv Raporlama Dashboard | — | Backend mevcut |
| P2 | 2.3 Gelen Zarflar | — | Inbox processor TODO'ları tamamlanmalı |
| P3 | 1.2 İrsaliye GİB Gönderim | — | waybill-service GİB entegrasyonu |
| P3 | 2.2 Zarf Detay Sayfası | — | Polling servisi aktif |

---

## Teknik Notlar

### API Servis Katmanı

```typescript
// apps/web/src/services/gib.ts — Yeni servis dosyası
import { apiClient } from './api-client';

export const gibApi = {
  // Fatura gönderim
  sendInvoice: (data: GibSendDto) =>
    apiClient.post('/gib/invoices/send', data),

  // Zarf listesi
  getEnvelopes: (params: EnvelopeListParams) =>
    apiClient.get('/gib/envelopes', { params }),

  // Zarf detay
  getEnvelope: (id: string) =>
    apiClient.get(`/gib/envelopes/${id}`),

  // Kabul/Red
  sendApplicationResponse: (data: ApplicationResponseDto) =>
    apiClient.post('/gib/invoices/application-response', data),

  // Portal iptal
  markCancelledOnPortal: (invoiceId: string, data: MarkCancelledDto) =>
    apiClient.post(`/gib/invoices/${invoiceId}/mark-cancelled`, data),

  // GİB ayarları
  getGibSettings: () =>
    apiClient.get('/tenant/profile/gib-settings'),
  updateGibSettings: (data: GibSettingsDto) =>
    apiClient.put('/tenant/profile/gib-settings', data),

  // e-Arşiv raporları
  getArchiveReports: (params: ArchiveReportParams) =>
    apiClient.get('/gib/archive-reports', { params }),
  retryArchiveReport: (reportDate: string) =>
    apiClient.post('/gib/archive-reports/retry', { reportDate }),

  // Alıcı arama (mükellef sorgu)
  searchReceivers: (query: string) =>
    apiClient.get('/gib/receivers/search', { params: { q: query } }),
};
```

### Polling / Auto-Refresh

Zarf listesi ve detay sayfalarında:
- `PROCESSING` durumundaki zarflar varken → 30 saniyede bir auto-refresh
- `react-query` / `swr` ile `refetchInterval: 30000` (sadece PROCESSING varsa)
- Tüm zarflar SUCCESS/FAILED → polling durdur

### i18n Anahtarları

Tüm GİB UI metinleri `gib.*` namespace altında:
```json
{
  "gib": {
    "sendInvoice": "GİB'e Gönder",
    "envelopes": "Zarflar",
    "incomingEnvelopes": "Gelen Zarflar",
    "applicationResponse": "Kabul/Red",
    "accept": "Kabul Et",
    "reject": "Reddet",
    "eightDayRule": "8 Günlük Yasal Süre",
    "timeRemaining": "Kalan Süre",
    "timeExpired": "Süre Doldu",
    "portalCancel": "GİB Portalında İptal Edildi",
    "settings": "GİB Ayarları",
    "gbAlias": "Gönderici Birim (GB) Alias",
    "pkAlias": "Posta Kutusu (PK) Alias",
    "archiveReports": "e-Arşiv Raporları",
    "retryReport": "Tekrar Gönder",
    "statusPending": "Bekliyor",
    "statusProcessing": "İşleniyor",
    "statusSuccess": "Başarılı",
    "statusFailed": "Hata"
  }
}
```

---

## Dosya Yapısı Önerisi

```
apps/web/src/
├── app/
│   ├── gib/
│   │   ├── zarflar/
│   │   │   ├── page.tsx              # Giden zarflar listesi
│   │   │   └── [id]/page.tsx         # Zarf detay
│   │   ├── gelen-zarflar/
│   │   │   └── page.tsx              # Gelen zarflar listesi
│   │   └── arsiv-raporlar/
│   │       └── page.tsx              # e-Arşiv raporları
│   ├── faturalar/
│   │   └── [id]/
│   │       ├── gib-gonder/page.tsx   # GİB gönderim formu
│   │       ├── kabul-red/page.tsx    # Kabul/Red formu
│   │       └── portal-iptal/page.tsx # Portal iptal senkronizasyonu
│   ├── irsaliyeler/
│   │   └── [id]/
│   │       └── gib-gonder/page.tsx   # İrsaliye GİB gönderimi
│   └── ayarlar/
│       └── gib/page.tsx              # GİB ayarları
├── components/
│   └── gib/
│       ├── envelope-status-badge.tsx  # Durum badge bileşeni
│       ├── gib-status-timeline.tsx    # Durum geçiş timeline
│       ├── application-response-dialog.tsx
│       ├── profile-id-selector.tsx    # ProfileID seçici
│       ├── receiver-alias-search.tsx  # Mükellef arama
│       ├── sectoral-field-group.tsx   # Sektörel alan grubu
│       ├── remaining-time-badge.tsx   # 8 gün kalan süre badge
│       └── gib-send-confirm-dialog.tsx
├── lib/
│   └── validations/
│       ├── gib-send.ts               # Zod şemaları
│       ├── application-response.ts
│       └── gib-settings.ts
├── services/
│   └── gib.ts                        # API servis katmanı
└── i18n/
    ├── tr.json                       # gib.* anahtarları eklenir
    ├── en.json
    └── ar.json
```

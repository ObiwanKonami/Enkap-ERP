# Web Modülü — CLAUDE.md

Bu dosya `apps/web` (Next.js dashboard) için rehberi ve iş akışını tanımlar.

---

## Genel Bakış

**Amacı**: Enkap ERP platformunun **Ana Web Dashboard**'ı — tüm işletme modülleri için kullanıcı arayüzü.

**Teknoloji**:
| Bileşen | Teknoloji | Versiyon |
|---------|-----------|---------|
| Framework | Next.js | 16.1.7 |
| UI Library | React | 19.2.4 |
| Bileşen Sistemi | shadcn/ui | 4.1.0 |
| Stil | Tailwind CSS | 4.2.1 |
| State Management | Zustand | 5.0.12 |
| Data Fetching | TanStack Query | 5.95.2 |
| Tablo Yönetimi | TanStack Table | 8.21.3 |
| Grafik | Recharts | 3.8.1 |
| HTTP Client | Axios | 1.13.6 |
| Auth | NextAuth | 4.24.13 |
| İkon Seti | Lucide React | 1.7.0 |
| Bildirim | Sonner | 2.0.7 |
| Tema | next-themes | 0.4.6 |
| TypeScript | | 5.9.3 |

---

## Klasör Yapısı

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (auth)/                           # Auth layout grubu
│   │   │   ├── giris/
│   │   │   ├── kayit/
│   │   │   ├── sifre-sifirla/[token]/
│   │   │   └── platform-giris/
│   │   │
│   │   ├── (dashboard)/                      # Dashboard layout grubu
│   │   │   ├── page.tsx                      # / — Ana dashboard KPI'ları
│   │   │   ├── faturalar/                    # Satış/Alış faturası
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   ├── yeni/
│   │   │   │   ├── fatura-table.tsx
│   │   │   │   └── fatura-client-page.tsx
│   │   │   │
│   │   │   ├── ar-ap/                        # Alıcı/Borçlu - Satıcı/Alacaklı
│   │   │   ├── muhasebe/                     # Muhasebe - Hesap Haritası
│   │   │   ├── edefter/                      # e-Defter Sayfası
│   │   │   ├── bordro/                       # Bordro Listesi
│   │   │   ├── calisanlar/                   # Çalışan Yönetimi
│   │   │   ├── sgk/                          # SGK Raporlaması
│   │   │   ├── izin/                         # İzin Yönetimi
│   │   │   ├── masraf/                       # Masraf Raporlaması
│   │   │   ├── stok/                         # Ürün Listesi
│   │   │   ├── depo/                         # Depo Yönetimi
│   │   │   ├── satin-alma/                   # Satın Alma Siparişleri
│   │   │   ├── siparis/                      # Satış Siparişleri
│   │   │   ├── irsaliyeler/                  # İrsaliye Listesi
│   │   │   │   └── yeni/                     # Yeni İrsaliye — ALIS tipinde onaylı PO seçilirse form otomatik dolar (satıcı, alıcı, kalemler, refType/refId/refNumber)
│   │   │   ├── lojistik/                     # Lojistik Takibi
│   │   │   ├── e-ticaret/                    # E-Ticaret Entegrasyonu
│   │   │   ├── uretim/                       # Üretim (BOM, İş Emri)
│   │   │   ├── kasa-banka/                   # Kasa/Banka Muhasebesi
│   │   │   ├── proje/                        # Proje Yönetimi
│   │   │   ├── butce/                        # Bütçe Planlaması
│   │   │   ├── duran-varlik/                 # Duran Varlık Yönetimi
│   │   │   ├── filo/                         # Araç/Sürücü Yönetimi
│   │   │   ├── musteri/                      # Müşteri (CRM)
│   │   │   ├── pipeline/                     # Satış Pipeline / Kanban
│   │   │   ├── aktiviteler/                  # Aktivite Listesi
│   │   │   ├── analitik/                     # Platform Metrikleri
│   │   │   ├── bi/                           # Business Intelligence
│   │   │   ├── ai-asistan/                   # AI Asistan
│   │   │   ├── raporlar/                     # Rapor Galeri
│   │   │   ├── abonelik/                     # Abonelik Yönetimi
│   │   │   ├── api-marketplace/              # API Marketplace
│   │   │   ├── webhooks/                     # Webhook Yönetimi
│   │   │   ├── ayarlar/                      # Tenant Ayarları (white-label, parametreler)
│   │   │   ├── profil/                       # Kullanıcı Profili
│   │   │   ├── platform/                     # Platform Yöneticisi Dashboard
│   │   │   └── admin/                        # Admin Paneli
│   │   │
│   │   └── layout.tsx                        # Root layout
│   │
│   ├── components/
│   │   ├── ui/
│   │   │   ├── data-table.tsx                # TanStack Table wrapper
│   │   │   ├── kpi-card.tsx                  # KPI widget
│   │   │   ├── revenue-chart.tsx             # Recharts şablonu
│   │   │   ├── phone-input.tsx               # Ülke kodlu telefon
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── error-boundary.tsx
│   │   │   └── ... (shadcn/ui bileşenleri)
│   │   │
│   │   └── layout/
│   │       ├── sidebar.tsx
│   │       ├── topbar.tsx
│   │       ├── command-palette.tsx
│   │       ├── notification-panel.tsx
│   │       ├── language-switcher.tsx
│   │       └── rtl-provider.tsx
│   │
│   ├── hooks/
│   │   ├── use-api.ts                        # API client wrapper (TanStack Query)
│   │   ├── use-auth.ts                       # NextAuth session hook
│   │   ├── use-tenant.ts                     # Tenant context hook
│   │   ├── use-i18n.ts                       # i18n hook
│   │   ├── use-theme.ts                      # Tema yönetimi
│   │   ├── use-locale.ts                     # Dil seçimi
│   │   └── use-mobile.ts                     # Responsive breakpoint
│   │
│   ├── services/
│   │   ├── index.ts                          # Tüm servis export'ları
│   │   ├── financial.ts                      # POST/GET /api/financial/* endpoints
│   │   ├── stock.ts                          # POST/GET /api/stock/* endpoints
│   │   ├── hr.ts                             # POST/GET /api/hr/* endpoints
│   │   ├── crm.ts                            # POST/GET /api/crm/* endpoints
│   │   ├── tenant.ts                         # POST/GET /api/tenant/* endpoints
│   │   ├── billing.ts                        # POST/GET /api/billing/* endpoints
│   │   ├── analytics.ts                      # POST/GET /api/analytics/* endpoints
│   │   ├── bi.ts                             # POST/GET /api/bi/* endpoints
│   │   ├── ai-assistant.ts                   # POST/GET /api/ai-assistant/* endpoints
│   │   ├── fleet.ts                          # POST/GET /api/fleet/* endpoints
│   │   ├── waybill.ts                        # POST/GET /api/waybill/* endpoints
│   │   ├── webhook.ts                        # POST/GET /api/webhook/* endpoints
│   │   └── ... (diğer servisler)
│   │
│   ├── lib/
│   │   ├── api-client.ts                     # Axios instance + serverFetch()
│   │   ├── format.ts                         # Para/Tarih/Sayı format kütüphanesi
│   │   ├── i18n.ts                           # i18n setup + createTranslator()
│   │   ├── auth.ts                           # NextAuth yapılandırması
│   │   └── utils.ts                          # Utility fonksiyonları (clsx, cn, vb.)
│   │
│   ├── i18n/
│   │   ├── tr.json                           # Türkçe dil dosyası (CANONICAL)
│   │   ├── en.json                           # İngilizce
│   │   └── ar.json                           # Arapça
│   │
│   └── proxy.ts                              # Development: backend API proxy
│
├── public/
│   └── ... (static assets)
│
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── components.json                           # shadcn/ui config
└── CLAUDE.md                                 # ← Bu dosya

```

---

## Önemli Dosyalar

### `src/lib/api-client.ts`
**Axios instance + NextAuth entegrasyonu**

```typescript
// Client component (CSR)
const { data, isLoading, error } = useApi('/api/financial/invoices', {
  queryKey: ['invoices'],
  params: { page: 1, limit: 10 }
});

// Server component (SSR)
const response = await serverFetch('/api/financial/invoices', {
  headers: { Authorization: `Bearer ${token}` }
});
```

**Kurallar**:
- Client'ta `useApi()` hook'u kullan
- Server component'te `serverFetch()` kullan
- Authorization header'ı NextAuth session'dan otomatik eklenir
- Error response'lar TanStack Query'de handle edilir

### `src/lib/format.ts`
**Para/Tarih/Sayı formatlaması — ASLA inline format yapmaz**

```typescript
import {
  formatCurrency,      // ₺1.234,56
  formatDate,          // 26.03.2026
  formatDateTime,      // 26.03.2026 14:30
  formatNumber,        // 1.234
  fmtQty,             // 2,5 (quantity)
  kurusToTl,          // 123456 kuruş → 1234.56 TL
  formatCompact       // 1250000 → 1,25M
} from '@/lib/format';

// ✅ Doğru
<span>{formatCurrency(kurusToTl(amountKurus))}</span>

// ❌ Yanlış
<span>₺{(amount / 100).toFixed(2)}</span>
```

**Kurallar**:
- Para değerleri DB'de **kuruş** (integer) saklanır
- Göstermede: `formatCurrency(kurusToTl(kurus))`
- Tarih: `formatDate()` — `dd.MM.yyyy` Türkçe formatı
- Stok miktarı: `fmtQty()` — ondalık ayraç virgül
- Inline `Intl.NumberFormat` veya `/ 100` **yasak**

### `src/lib/i18n.ts`
**Türkçe/İngilizce/Arapça dil desteği**

```typescript
// Client component (CSR)
import { useI18n } from '@/hooks/use-i18n';
const { t } = useI18n();
return <h1>{t('invoice.title')}</h1>;

// Server component / module-level
import { createTranslator, DEFAULT_LOCALE } from '@/lib/i18n';
const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: t('invoice.title') };
```

**Kurallar**:
- `t()` **tek argüman** alır — `t('key', { var })` → TypeScript hatası
- Dinamik değerler için: `{value} {t('suffix')}` şeklinde ayır
- Tüm üç JSON dosyası (`tr.json`, `en.json`, `ar.json`) **aynı key yapısında** olmalı
- `tr.json` **canonical** — en.json/ar.json mutlaka güncel tutulur
- Key format: `namespace.camelCase` (örn. `invoice.titleRequired`)

---

## Hooks Kullanımı

### `useApi()` — TanStack Query wrapper
```typescript
const { data, isLoading, error, refetch } = useApi('/api/financial/invoices', {
  queryKey: ['invoices', page, limit],
  params: { page, limit },
  staleTime: 1000 * 60 * 5  // 5 dakika
});
```

### `useAuth()` — NextAuth session
```typescript
const { data: session, status } = useAuth();
if (status === 'loading') return <Skeleton />;
if (!session) return <Unauthorized />;
```

### `useTenant()` — Tenant context
```typescript
const { tenantId, tenantName } = useTenant();
```

### `useI18n()` — Dil seçimi
```typescript
const { t, locale, changeLocale } = useI18n();
```

### `useTheme()` — Dark mode
```typescript
const { theme, setTheme } = useTheme();
```

---

## Sayfa Yazarken Şablonu

### Client Page (`*-client-page.tsx`)
```typescript
'use client';

import { useApi } from '@/hooks/use-api';
import { useI18n } from '@/hooks/use-i18n';
import { DataTable } from '@/components/ui/data-table';
import { KpiCard } from '@/components/ui/kpi-card';

export function InvoiceClientPage() {
  const { t } = useI18n();
  const { data: invoices, isLoading } = useApi('/api/financial/invoices');

  if (isLoading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          title={t('invoice.totalCount')}
          value={invoices.total}
          icon={FileText}
        />
      </div>
      <DataTable columns={columns} data={invoices.data} />
    </div>
  );
}
```

### Server Page (layout, metadata)
```typescript
import { getServerSession } from 'next-auth';
import { serverFetch } from '@/lib/api-client';
import { InvoiceClientPage } from './fatura-client-page';

export const metadata = {
  title: 'Faturalar',
  description: 'Satış ve alış faturası yönetimi'
};

export default async function InvoicePage() {
  const session = await getServerSession();

  // SSR veri çekimi
  const invoices = await serverFetch('/api/financial/invoices', {
    headers: { Authorization: `Bearer ${session?.accessToken}` }
  });

  return <InvoiceClientPage initialData={invoices} />;
}
```

---

## UI Bileşenleri

### DataTable — TanStack Table
```tsx
import { DataTable } from '@/components/ui/data-table';

const columns = [
  {
    accessorKey: 'invoiceNumber',
    header: 'No',
    cell: (info) => <span className="font-mono">{info.getValue()}</span>
  },
  {
    accessorKey: 'total',
    header: 'Tutar',
    cell: (info) => formatCurrency(kurusToTl(info.getValue()))
  }
];

<DataTable
  columns={columns}
  data={data}
  pageSize={10}
  enableFiltering
  enableSorting
/>
```

### KpiCard — Dashboard widget
```tsx
import { KpiCard } from '@/components/ui/kpi-card';
import { TrendingUp } from 'lucide-react';

<KpiCard
  title="Ay Gelirleri"
  value={formatCompact(totalRevenue)}
  icon={TrendingUp}
  accent="emerald"
  note="+12% geçen aydan"
/>
```

### RevenueChart — Recharts şablonu
```tsx
import { RevenueChart } from '@/components/ui/revenue-chart';

const data = [
  { ay: 'Oca', gelir: 45000, gider: 32000 },
  { ay: 'Şub', gelir: 52000, gider: 38000 }
];

<RevenueChart data={data} />
```

### PhoneInput — Ülke kodlu telefon
```tsx
import { PhoneInput } from '@/components/ui/phone-input';

<PhoneInput
  value={phone}                    // '+90 532 123 45 67'
  onChange={setPhone}              // Tam formatlanmış değer döner
  defaultDialCode="+90"
  label="Telefon Numarası"
/>
```

---

## Service Kullanımı

### Financial Service
```typescript
import { financial } from '@/services';

// Fatura listesi
const { data } = await financial.getInvoices({ page: 1, limit: 10 });

// Fatura oluştur
await financial.createInvoice({
  direction: 'OUT',
  lines: [{ productId, qty, unitPrice }]
});

// Fatura gönder GİB'e
await financial.sendToGib(invoiceId);
```

### Stock Service
```typescript
import { stock } from '@/services';

// Ürün listesi
const { data } = await stock.getProducts({ search: 'SKU' });

// Stok hareketi oluştur
await stock.createMovement({
  productId,
  warehouseId,
  type: 'CIKIS',
  qty: 5
});
```

---

## Kurallar & Best Practices

1. **Client vs Server**
   - Server component'te veri çek (SSR)
   - Client component'te etkileşim yönet (CSR)
   - `'use client'` directive'i gerekli yerlerde

2. **Format Fonksiyonları**
   - Asla inline format — `@/lib/format` kullan
   - Para = kuruş → `kurusToTl()` → `formatCurrency()`
   - Tarih = ISO → `formatDate()`

3. **i18n Dil Dosyaları**
   - `tr.json` canonical — ASLA direkt düzenle
   - `en.json` ve `ar.json` eş zamanlı güncellenmeli
   - TypeScript type check: tüm JSON'lar aynı struktur

4. **API Response Normalizasyonu**
   ```typescript
   // Backend bazı endpoint'ler items bazıları data döner
   const items = response.data ?? response.items ?? [];
   ```

5. **TanStack Query Key'leri**
   - Unique, nested array: `['invoices', page, limit]`
   - Dinamik değerler included
   - Refetch / invalidation için important

6. **TypeScript**
   - Hiç `any` tipi — `unknown` veya gerçek tip
   - Interface'ler sayfa component'inde tanımla
   - `@enkap/shared-types` export'larını kullan

7. **Error Handling**
   ```typescript
   if (error) {
     toast.error(error.message ?? 'Bir hata oluştu');
     return <ErrorBoundary />;
   }
   ```

8. **Pagination**
   ```typescript
   // Always expect paginated response
   interface PaginatedResponse<T> {
     data: T[];
     total: number;
   }
   ```

---

## Deployment & Build

```bash
# Development
pnpm dev --filter @enkap/web

# Type check
pnpm typecheck --filter @enkap/web

# Build
pnpm build --filter @enkap/web

# Production start
pnpm start --filter @enkap/web
```

**Environment Variables:**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001      # Auth service
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-secret>
SMTP_HOST=smtp.sendgrid.net                    # E-posta doğrulaması
```

---

## Sık Oluşan Görevler

### Yeni Sayfa Ekleme
1. `apps/web/src/app/(dashboard)/[page]/page.tsx` oluştur
2. `[page]-client-page.tsx` client component'ini yaz
3. Service import et: `import { serviceApi } from '@/services';`
4. DataTable / KpiCard bileşenleri kullan
5. i18n key'leri ekle: `i18n/tr.json`

### Yeni UI Bileşeni
1. `npx shadcn@latest add [component]`
2. Özel styling: `components/ui/[component].tsx` düzenle
3. Tailwind utility class'ları kullan (hiç inline style)

### API Entegrasyonu
1. Service import et
2. `useApi()` hook'u kullan (CSR) veya `serverFetch()` (SSR)
3. Response type'ını kontrol et (`data` vs `items`)
4. Error handling ekle

---

## Kontrol Listesi

- [ ] Tüm sayfa component'leri `'use client'` directive'i varsa client
- [ ] Format fonksiyonları `@/lib/format`'tan import
- [ ] i18n key'leri `tr.json`, `en.json`, `ar.json` eş zamanlı
- [ ] TanStack Query key'leri unique ve dynamic values included
- [ ] DataTable column'ları type-safe
- [ ] Phone input ülke kodu desteği
- [ ] Error boundary'si page'in en üstünde
- [ ] Loading skeleton'ları responsive
- [ ] NextAuth session'ı SSR'da kontrol edildi
- [ ] API response normalize edildi (data/items)


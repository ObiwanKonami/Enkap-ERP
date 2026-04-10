# Enkap Veri Sayfası UI Kuralları

Tüm liste/veri sayfaları (faturalar, siparişler, çalışanlar vb.) bu kuralları tam olarak uygulamalıdır.
Ekran görüntüsü referansı: `ui_rule.png` — Faturalar sayfası.

---

## 1. Dosya Yapısı (Zorunlu 3-Dosya Pattern)

Her liste sayfası **tam olarak 3 dosyadan** oluşur. İstisnası yoktur.

```
app/(dashboard)/[route]/
├── page.tsx              ← Server component, sadece metadata + import
├── xxx-client-page.tsx   ← "use client", tüm state + fetch + JSX
└── xxx-table.tsx         ← Sadece tip tanımı + buildXxxColumns(t) fonksiyonu
```

### `page.tsx` — Minimal Server Component

```tsx
import { createTranslator, DEFAULT_LOCALE } from "@/lib/i18n";
import XxxClientPage from "./xxx-client-page";
export type { XxxUrun } from "./xxx-table";   // tip re-export (gerekirse)

const t = createTranslator(DEFAULT_LOCALE);
export const metadata = { title: `${t("xxx.title")} — Enkap` };

export default function XxxPage() {
  return <XxxClientPage />;
}
```

**Yasak:** `page.tsx` içinde `fetch`, `getServerSession`, `useEffect`, state, JSX içeriği.

### `xxx-table.tsx` — Sadece Tip + Kolonlar

```tsx
"use client";

import type { ColumnDef } from "@tanstack/react-table";
// ... import'lar

export interface XxxUrun {
  id: string;
  // ... alanlar
}

export function buildXxxColumns(t: (k: string) => string): ColumnDef<XxxUrun, unknown>[] {
  return [
    // ... kolon tanımları
  ];
}
```

**Yasak:** `xxx-table.tsx` içinde state, `useEffect`, `fetch`, `useState`, bileşen export'u.

### `xxx-client-page.tsx` — Tüm Mantık

`"use client"` direktifi ile başlar. Aşağıdaki bölümleri içerir (sırayla):
1. Import'lar
2. `normalize()` yardımcı fonksiyonu (gerekirse)
3. `export default function XxxClientPage()` bileşeni

---

## 2. Sayfa Yapısı (Zorunlu Sıra)

```
[Sayfa Başlığı Alanı]      ← başlık + kayıt sayısı + eylem butonu
[KPI Kartları]             ← opsiyonel, varsa 2–4 kart
[Ek Uyarı Bandı]          ← opsiyonel (kritik stok, gecikmiş fatura vb.)
[Arama + Filtreler Barı]   ← DataTable'ın DIŞINDA
[DataTable Kartı]          ← yalnızca tablo + sütun başlıkları + satırlar
[Pagination Barı]          ← DataTable'ın DIŞINDA, en altta
```

**Kesinlikle yasak:**
- Pagination'ı `<Card>` içine koymak
- Arama/filtre barını `<Card>` içine koymak
- Tablo ile pagination'ı aynı wrapper'da sarmalamak

---

## 3. Sayfa Başlığı Alanı

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <IconComponent className="h-6 w-6 text-muted-foreground" />
    <h1 className="text-2xl font-semibold tracking-tight">{t("xxx.title")}</h1>
    <span className="text-sm text-muted-foreground">{total} kayıt</span>
  </div>
  <Button asChild>
    <Link href="/xxx/yeni">
      <Plus className="h-4 w-4 mr-2" />
      {t("xxx.newItem")}
    </Link>
  </Button>
</div>
```

- Başlık: `text-2xl font-semibold tracking-tight`
- Kayıt sayısı: `text-sm text-muted-foreground` — tablo `total` state'inden gelir
- Eylem butonu: shadcn `<Button>` (variant default = primary)
- İkon: `lucide-react` — `text-muted-foreground`

---

## 4. KPI Kartları

### Bileşen

```tsx
import { Card, CardContent } from '@/components/ui/card';

<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
        <IconComponent className="h-4 w-4" />
        {t("xxx.kpiLabel")}
      </div>
      <p className={cn("text-3xl font-bold", valueColor)}>{değer}</p>
    </CardContent>
  </Card>
</div>
```

### Değer Renk Kuralı

| Durum | Tailwind Sınıfı |
|-------|----------------|
| Pozitif (onaylı, gelir, aktif) | `text-primary` |
| Negatif (reddedilen, iptal, kritik, gecikmiş) | `text-destructive` |
| Nötr (bekleyen, taslak, sayı, bilgi) | `text-foreground` |

- KPI başlığı: `text-xs font-semibold uppercase tracking-widest text-muted-foreground`
- KPI değeri: `text-3xl font-bold` + renk sınıfı — `text-xl` **yasak**

### KPI Fetch Pattern'i

KPI'lar **tablo fetch'inden bağımsız** olarak mount'ta bir kez çekilir:

```tsx
// ── KPI state ─────────────────────────────────────────────────────────
const [kpiA, setKpiA] = useState(0);
const [kpiB, setKpiB] = useState(0);

// ── KPI fetch (mount'ta bir kez) ──────────────────────────────────────
useEffect(() => {
  xxxApi.list({ limit: 500 })
    .then((res) => {
      const items = (res.data ?? []) as XxxUrun[];
      setKpiA(items.filter((x) => x.status === "ACTIVE").length);
      setKpiB(items.reduce((s, x) => s + Number(x.amount), 0));
    })
    .catch(() => {});
}, []);  // ← bağımlılık dizisi BOŞ — sadece mount'ta çalışır
```

**Yasak:** KPI fetch'ini tablo fetch `useEffect`'iyle aynı bloğa koymak.

---

## 5. Arama + Filtreler Barı

DataTable kartının **üzerinde**, kartın **dışında** yer alır.

```tsx
<div className="flex items-center gap-3">
  {/* Arama */}
  <div className="relative flex-1 max-w-sm">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
    <Input
      className="pl-9"
      placeholder={t("xxx.searchPlaceholder")}
      value={search}
      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
    />
  </div>

  {/* Her enum filtre için bir Select */}
  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
    <SelectTrigger className="w-40">
      <SelectValue placeholder="Durum" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Tümü</SelectItem>
      <SelectItem value="ACTIVE">Aktif</SelectItem>
      <SelectItem value="PASSIVE">Pasif</SelectItem>
    </SelectContent>
  </Select>
</div>
```

### Filtre State Kuralları

```tsx
// ✅ Doğru naming: xxxFilter, default "all"
const [statusFilter,    setStatusFilter   ] = useState("all");
const [directionFilter, setDirectionFilter] = useState("all");
const [typeFilter,      setTypeFilter     ] = useState("all");

// ✅ Her filtre değişiminde sayfa 1'e döner
onValueChange={(v) => { setStatusFilter(v); setPage(1); }}

// ✅ Backend'e "all" gönderilmez, undefined gönderilir
status: statusFilter !== "all" ? statusFilter : undefined,
```

### Backend Bağlantı Kuralı

- Her arama ve filtre değişikliği **backend'e query param olarak** gönderilir — client-side filtreleme yapılmaz.
- Arama: 300ms debounce; filtre/sayfa değişimleri: 0ms (anında)

```tsx
useEffect(() => {
  const timer = setTimeout(async () => {
    setLoading(true);
    try {
      const res = await xxxApi.list({
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit,
        offset: (page - 1) * limit,   // veya page: page (servis API'sine göre)
      });
      setData((res.data ?? []) as XxxUrun[]);
      setTotal(res.total ?? 0);
    } catch {
      setData([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, search ? 300 : 0);
  return () => clearTimeout(timer);
}, [search, statusFilter, page, limit]);
```

**Yasak:**
```tsx
// ❌ Client-side filtreleme
const filtered = data.filter(item => item.status === statusFilter);
// ❌ react-query / SWR kullanımı (useEffect + useState kullan)
const { data } = useQuery(...)
```

### eksik_filtreler.md Zorunlu Adımı

**Her liste sayfası oluşturulduğunda veya güncellendiğinde bu adım zorunludur — atlanamaz:**

1. UI'daki her filtre alanını (Select, Input, DatePicker vb.) listele
2. Backend endpoint'inin bu parametreyi destekleyip desteklemediğini kontrol et
3. Backend'de karşılığı **olmayan** her filtre → `eksik_filtreler.md`'e ekle:

```markdown
## [Sayfa Adı] (/[route])
- [ ] `paramAdı` — açıklama (YYYY-MM-DD)
```

4. Backend desteği eklendikten sonra `[x]` ile işaretle — satırı silme.

**UI'da filtre var ama `eksik_filtreler.md` güncellenmemişse iş tamamlanmamış sayılır.**

---

## 6. DataTable

### Kullanım

```tsx
import { DataTable } from '@/components/ui/data-table';

// Liste sayfalarında her zaman bu şekilde:
<Card>
  <CardContent className="p-0">
    <DataTable
      columns={columns}
      data={loading ? [] : data}   // ← loading sırasında boş dizi
      showToolbar={false}           // ← dış arama barı var
      showFooter={false}            // ← dış pagination var
      totalCount={total}
      page={page}
      serverLimit={limit}
    />
  </CardContent>
</Card>
```

### İç Yapı — Zorunlu Kural

`data-table.tsx` içinde tablo **mutlaka** shadcn Table bileşenleri ile yazılmalıdır:

```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

// ✅ Doğru
<Table>
  <TableHeader>
    <TableRow className="group">
      <TableHead>...</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow className="group">
      <TableCell>...</TableCell>
    </TableRow>
  </TableBody>
</Table>

// ❌ Yasak — çift border oluşturur
<div className="border border-border">
  <table><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table>
</div>
```

**Neden:** shadcn `<Table>` kendi etrafına border koymaz. Border `<Card>` wrapper'ından gelir. Native `<table>` + `border` div kombinasyonu çift border oluşturur.

### Props

| Prop | Tip | Açıklama |
|------|-----|---------|
| `showToolbar` | `boolean` (default `true`) | Dahili arama çubuğunu göster/gizle |
| `showFooter` | `boolean` (default `true`) | Dahili pagination çubuğunu göster/gizle |
| `totalCount` | `number` | Server-side pagination modu aktif olur |
| `page` | `number` | Mevcut sayfa (1-indexed) |
| `serverLimit` | `number` | Sayfa başı kayıt sayısı |

### Kolon Tanımı

```tsx
// xxx-table.tsx
export function buildXxxColumns(t: (k: string) => string): ColumnDef<XxxUrun, unknown>[] {
  return [ ... ];
}

// xxx-client-page.tsx
const columns = useMemo(() => buildXxxColumns(t), [t]);
```

### Hover Action Butonu

```tsx
// data-table.tsx içinde TableRow'a group eklenmeli:
<TableRow key={row.id} className="group" ...>

// kolon tanımında:
<Button className="size-7 opacity-0 group-hover:opacity-100 transition-opacity">
  <ExternalLink size={14} className="text-muted-foreground" />
</Button>
```

---

## 7. Pagination Barı

DataTable kartının **altında**, kartın **dışında** yer alır.

```tsx
<div className="flex items-center justify-between text-sm text-muted-foreground">
  <span>{total} kayıt</span>

  <div className="flex items-center gap-4">
    <div className="flex items-center gap-2">
      <span>Sayfa başı</span>
      <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
        <SelectTrigger className="h-8 w-16"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[10, 20, 50, 100].map((n) => (
            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <span>{page} / {pageCount}</span>

    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setPage(1)} disabled={page === 1}>
        <ChevronsLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8"
        onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
        <ChevronsRight className="h-4 w-4" />
      </Button>
    </div>
  </div>
</div>
```

```tsx
// pageCount her zaman bu şekilde hesaplanır:
const pageCount = Math.max(1, Math.ceil(total / limit));
```

---

## 8. Normalize Helper

API yanıtları nested objeler döndürdüğünde (örn. `category: { id, name }`) flat `XxxUrun` tipine dönüştürmek için dosyanın üstünde yardımcı fonksiyon tanımlanır:

```tsx
// xxx-client-page.tsx — bileşen tanımından ÖNCE, modül düzeyinde
function normalize(p: unknown): XxxUrun {
  const item = p as Record<string, unknown>;
  return {
    ...item,
    categoryName:
      (item.category as { name: string } | null)?.name ??
      (item.categoryName as string | undefined),
  } as XxxUrun;
}

// Kullanım:
setData((res.data ?? []).map(normalize));
```

---

## 9. Tam Client Page Şablonu

```tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { IconA, IconB, Plus, Search, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { xxxApi } from "@/services/xxx";
import { useI18n } from "@/hooks/use-i18n";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { buildXxxColumns, type XxxUrun } from "./xxx-table";

// API nested → flat dönüşümü (gerekirse)
function normalize(p: unknown): XxxUrun { ... }

export default function XxxClientPage() {
  const { t } = useI18n();
  const columns = useMemo(() => buildXxxColumns(t), [t]);

  // ── Tablo state ─────────────────────────────────────────────────────
  const [search,       setSearch      ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page,         setPage        ] = useState(1);
  const [limit,        setLimit       ] = useState(20);
  const [data,         setData        ] = useState<XxxUrun[]>([]);
  const [total,        setTotal       ] = useState(0);
  const [loading,      setLoading     ] = useState(true);

  // ── KPI state ────────────────────────────────────────────────────────
  const [kpiA, setKpiA] = useState(0);
  const [kpiB, setKpiB] = useState(0);

  // ── KPI fetch (mount'ta bir kez) ─────────────────────────────────────
  useEffect(() => {
    xxxApi.list({ limit: 500 })
      .then((res) => {
        const items = (res.data ?? []) as XxxUrun[];
        setKpiA(items.filter((x) => x.status === "ACTIVE").length);
        setKpiB(items.reduce((s, x) => s + Number(x.amount), 0));
      })
      .catch(() => {});
  }, []);

  // ── Tablo fetch (debounced) ───────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await xxxApi.list({
          search: search || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          limit,
          offset: (page - 1) * limit,
        });
        setData((res.data ?? []) as XxxUrun[]);
        setTotal(res.total ?? 0);
      } catch {
        setData([]); setTotal(0);
      } finally {
        setLoading(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, statusFilter, page, limit]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* 1. Başlık */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconA className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("xxx.title")}</h1>
          <span className="text-sm text-muted-foreground">{total} kayıt</span>
        </div>
        <Button asChild>
          <Link href="/xxx/yeni">
            <Plus className="h-4 w-4 mr-2" /> {t("xxx.newItem")}
          </Link>
        </Button>
      </div>

      {/* 2. KPI Kartları */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            <IconA className="h-4 w-4" /> {t("xxx.kpiA")}
          </div>
          <p className="text-3xl font-bold text-primary">{kpiA}</p>
        </CardContent></Card>
        {/* ... diğer KPI kartları */}
      </div>

      {/* 3. Arama + Filtreler (CARD DIŞINDA) */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("xxx.searchPlaceholder")}
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 4. DataTable (CARD içinde) */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={loading ? [] : data}
            showToolbar={false}
            showFooter={false}
            totalCount={total}
            page={page}
            serverLimit={limit}
          />
        </CardContent>
      </Card>

      {/* 5. Pagination (CARD DIŞINDA) */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} kayıt</span>
        <div className="flex items-center gap-4">
          {/* sayfa başı select + x/y + nav butonları */}
        </div>
      </div>

    </div>
  );
}
```

---

## 10. Bileşen Kaynağı Özeti

| Bileşen | Kaynak |
|---------|--------|
| Tüm kartlar | `shadcn/ui` → `Card`, `CardContent` |
| Tablo | `components/ui/data-table.tsx` (TanStack Table) |
| Tablo iç elementler | `components/ui/table.tsx` → `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` |
| Butonlar | `shadcn/ui` → `Button` |
| Input | `shadcn/ui` → `Input` |
| Select | `shadcn/ui` → `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` |
| Badge | `shadcn/ui` → `Badge` |
| İkonlar | `lucide-react` (başka ikon kütüphanesi yasak) |
| Skeleton | `shadcn/ui` → `Skeleton` |
| Alert | `shadcn/ui` → `Alert` |

**Kesinlikle yasak:** Özel CSS sınıfları, inline style renk değerleri, `table`/`thead`/`tbody` HTML doğrudan kullanımı, `react-query`/`SWR` (plain `useEffect` kullan), `FlatList`.

---

## 11. eksik_filtreler.md Yönetimi

- Backend'de karşılığı olmayan her filtre alanı `eksik_filtreler.md`'e eklenir.
- Filtre backend'e eklendikten sonra ilgili satır `[x]` ile işaretlenir — silinmez.
- Format:

```markdown
## [Sayfa Adı] (/[route])
- [ ] `fieldName` — açıklama (YYYY-MM-DD)
- [x] `otherField` — açıklama (tamamlandı: YYYY-MM-DD)
```

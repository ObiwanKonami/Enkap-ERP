# Enkap Web UI Kuralları

Bu dosya tüm dashboard sayfaları için geçerli UI standartlarını tanımlar.
Her yeni sayfa veya refaktör bu kurallara uygun olmalıdır.

---

## 1. Bileşen Kaynağı

- **Yalnızca shadcn/ui bileşenleri kullanılır**: `Button`, `Card`, `Badge`, `Input`, `Select`, `Dialog`, `Table`, `Alert`, `Separator`, `ScrollArea`, `Skeleton`, vb.
- Özel CSS sınıfları (`card`, `badge-info`, `badge-success`, vb.) kullanılmaz — shadcn eşdeğerleri tercih edilir.
- Tablo için: `DataTable` (`components/ui/data-table.tsx`) — TanStack Table tabanlı.
- Sayfalama için: shadcn `Pagination` bileşeni.
- İkonlar: yalnızca **lucide-react**.

---

## 2. Renk Kuralları

### Kullanılacak (Tailwind tema token'ları)
| Amaç | Token |
|------|-------|
| Ana metin | `text-foreground` |
| İkincil / açıklama metin | `text-muted-foreground` |
| Vurgu / link / aktif | `text-primary` |
| Hata / iptal / olumsuz | `text-destructive` |
| Kart arka planı | `bg-card` |
| Soluk arka plan | `bg-muted`, `bg-muted/40`, `bg-muted/50` |
| Vurgu arka planı | `bg-primary/10`, `bg-primary/5` |
| Hata arka planı | `bg-destructive/10` |
| Kenarlık | `border-border` |
| Vurgu kenarlığı | `border-primary/20`, `border-primary/40` |

### Yasak (Hardcoded renkler)
- `text-sky-500`, `bg-sky-500/10`, `border-sky-500/25` vb. — **yasak**
- `text-emerald-500`, `text-rose-500`, `text-amber-500`, `text-violet-500` vb. — **yasak**
- `text-slate-*`, `text-gray-*` gibi gri tonlar — `text-muted-foreground` kullan
- `bg-gradient-to-*` gradientler — **yasak**

### Renk eşleme rehberi
| Eski (yasak) | Yeni (doğru) |
|---|---|
| `text-sky-500` (ikon) | `text-muted-foreground` |
| `text-sky-500` (tutar/vurgu) | `text-primary` |
| `text-emerald-500` (gelen/olumlu) | `text-primary` |
| `text-red-500` / `text-rose-500` (hata/çıkış) | `text-destructive` |
| `bg-sky-500/10` + `border-sky-500/20` (avatar) | `bg-muted` + `border-border` |
| `bg-sky-500/5` + `border-sky-500/20` (seçili kart) | `bg-muted/50` + `border-border` |

---

## 3. Tipografi

- `font-display` — **yasak**, tüm başlıklarda kaldırılmalı.
- `font-mono` — yalnızca tarih/input alanları için kabul edilir.
- Sayısal değerler: `tabular-nums` sınıfı kullanılır.
- Başlık boyutları: `text-2xl font-bold tracking-tight` (ana), `text-sm font-semibold` (kart başlığı).
- Kart başlıkları: `text-xs font-semibold uppercase tracking-wider text-muted-foreground`.

---

## 4. Format Yardımcıları

`apps/web/src/lib/format.ts` — **her zaman buradan import et**.

```typescript
import { formatCurrency, formatDate, formatDateTime, formatNumber, fmtQty, kurusToTl, formatCompact } from '@/lib/format';
```

| Kullanım | Doğru | Yasak |
|---|---|---|
| Para tutarı gösterimi | `formatCurrency(kurusToTl(amountKurus))` | `new Intl.NumberFormat(...)`, `/ 100`, `.toFixed(2)` |
| Tarih | `formatDate(isoString)` | `new Date().toLocaleDateString(...)` |
| Stok miktarı | `fmtQty(Number(qty))` | — |
| Kompakt sayı | `formatCompact(n)` | — |

---

## 5. Button Kuralları

```tsx
import { Button } from '@/components/ui/button';

// Yükleme durumu — isLoading prop kullan
<Button isLoading={isPending} onClick={...}>
  <Check size={14} /> {t('common.save')}
</Button>

// Manuel spinner — yasak
{isPending ? <><Loader2 className="animate-spin" /> Kaydediliyor</> : <>Kaydet</>}

// Link Button
<Button asChild variant="outline">
  <Link href="/...">...</Link>
</Button>
```

- `isLoading` prop: spinner otomatik eklenir, `disabled` otomatik set edilir.
- `asChild=true` ile `isLoading` birlikte kullanılmaz (Slot uyumsuzluğu).
- Boyutlar: `size="sm"` (tablo içi), `size="icon"` (ikon buton), varsayılan (sayfa aksiyonları).

---

## 6. Badge Kuralları

```tsx
import { Badge } from '@/components/ui/badge';

// Durum badge'leri
DRAFT:     <Badge variant="outline">...</Badge>
PENDING:   <Badge variant="secondary">...</Badge>
ACTIVE:    <Badge variant="secondary" className="bg-primary/10 text-primary border-transparent">...</Badge>
SUCCESS:   <Badge variant="default">...</Badge>
ERROR:     <Badge variant="destructive">...</Badge>
CANCELLED: <Badge variant="outline" className="text-muted-foreground">...</Badge>
```

- `badge-info`, `badge-success`, `badge-danger` gibi özel CSS sınıfları — **yasak**.

---

## 7. KPI Kartları

shadcn `Card` bileşeni kullanılır — `KpiCard` veya özel bileşen de kabul edilir.

```tsx
<Card className="shadow-sm">
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
      <IconComponent size={14} className="text-muted-foreground" />
      {t('...')}
    </CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
      {value}
    </div>
  </CardContent>
</Card>
```

- Gradient arka planlar — **yasak**.
- KPI ikon rengi: `text-muted-foreground` (nötr), yalnızca destructive değer için `text-destructive`.

---

## 8. Hata Gösterimi

```tsx
import { Alert, AlertDescription } from '@/components/ui/alert';

<Alert variant="destructive">
  <AlertCircle size={14} />
  <AlertDescription>{errorMessage}</AlertDescription>
</Alert>
```

- Ham `<span className="text-red-500">` ile hata gösterimi — **yasak**.

---

## 9. Modal / Dialog

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Modal başlığındaki ikon
<DialogTitle className="flex items-center gap-2">
  <IconComponent size={16} className="text-muted-foreground" />
  {t('...')}
</DialogTitle>
```

- Modal ikon rengi: `text-muted-foreground`.
- Liste içi avatar/iyon ikonları: `bg-muted border-border text-muted-foreground`.

---

## 10. Sayfa Düzeni Şablonu

```tsx
<div className="flex flex-col gap-6">
  {/* Başlık */}
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-center gap-2">
      <IconComponent size={20} className="text-muted-foreground" />
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {t('page.title')}
      </h1>
      <span className="text-sm text-muted-foreground ml-2">{count} {t('common.records')}</span>
    </div>
    <Button asChild className="h-9 gap-2 shadow-sm shrink-0">
      <Link href="/sayfa/yeni">
        <Plus size={16} /> {t('common.new')}
      </Link>
    </Button>
  </div>

  {/* KPI Kartları */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* ... */}
  </div>

  {/* Tablo */}
  <DataTable columns={columns} data={data} />
</div>
```

---

## 11. Genel Yasaklar

| Yasak | Doğru alternatif |
|---|---|
| Hardcoded renk (sky, emerald, rose, amber vb.) | Tailwind tema token'ları |
| `font-display` | Kaldır, varsayılan font |
| `new Intl.NumberFormat(...)` | `formatCurrency` / `formatNumber` |
| `amount / 100` | `kurusToTl(amount)` |
| `card`, `badge-*` global CSS sınıfları | shadcn bileşenleri |
| Manuel loading spinner JSX | `isLoading` Button prop |
| `bg-gradient-to-*` | Düz arka plan token'ları |
| `inline style={{ color: '...' }}` | Tailwind sınıfları |

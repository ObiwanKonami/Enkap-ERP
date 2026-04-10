# Stock Service (:3004) — Ürün & Stok Yönetimi

## Genel Bakış

Enkap ERP'nin **stok yönetimi, ürün kataloğu, marketplace/e-ticaret entegrasyonu ve kargo yönetimi** modülü.
- **Port:** 3004
- **Framework:** NestJS 10 (Fastify adapter) + TypeORM
- **Bağımlılıklar:** @enkap/health, @enkap/database (TenantModule), @enkap/reporting
- **Modüller:** 8 ana modül (Product, Warehouse, Movement, Irsaliye, Marketplace, Ecommerce, Logistics, Reporting)

---

## Modül Yapısı

```
apps/stock-service/src/
├── product/                    Ürün CRUD, kategori, toplu import
│   ├── product.service.ts      FIFO/AVG maliyet, bulk import
│   ├── product.controller.ts   GET/POST/PATCH/DELETE endpoints
│   ├── entities/
│   │   ├── product.entity.ts   Ürün master entity (VKN'yle ilişkili)
│   │   └── product-category.entity.ts
│   └── dto/
│       ├── create-product.dto.ts
│       └── update-product.dto.ts
├── warehouse/                  Depo yönetimi
│   ├── warehouse.service.ts
│   ├── warehouse.controller.ts
│   └── entities/warehouse.entity.ts
├── movement/                   Stok giriş/çıkış/transfer hareketleri
│   ├── stock-movement.service.ts
│   ├── stock-movement.controller.ts
│   ├── entities/stock-movement.entity.ts
│   └── dto/create-movement.dto.ts
├── irsaliye/                   İrsaliye oluşturma (XML/PDF builder)
│   ├── irsaliye-builder.service.ts
│   └── irsaliye.module.ts
├── marketplace/                Trendyol & Hepsiburada senkronizasyonu
│   ├── trendyol/
│   │   ├── trendyol.client.ts
│   │   └── trendyol-sync.service.ts
│   ├── hepsiburada/
│   │   ├── hepsiburada.client.ts
│   │   └── hepsiburada-sync.service.ts
│   ├── entities/
│   │   ├── marketplace-integration.entity.ts
│   │   ├── marketplace-order.entity.ts
│   │   ├── marketplace-order-line.entity.ts
│   │   └── marketplace-product-mapping.entity.ts
│   ├── credential-encryption.service.ts
│   ├── marketplace-sync.scheduler.ts
│   └── marketplace.module.ts
├── ecommerce/                  Shopify, WooCommerce, Ticimax, İdeaSoft
│   ├── shopify/ · woocommerce/ · ticimax/ · ideasoft/
│   ├── ecommerce.service.ts
│   ├── ecommerce.controller.ts
│   ├── ecommerce-sync.scheduler.ts
│   ├── entities/ecommerce-integration.entity.ts
│   └── ecommerce.module.ts
├── logistics/                  Kargo entegrasyonu (Aras, Yurtiçi, PTT)
│   ├── shipment.service.ts
│   ├── shipment.controller.ts
│   ├── carriers/
│   │   ├── aras.client.ts
│   │   ├── yurtici.client.ts
│   │   └── ptt.client.ts
│   ├── entities/shipment.entity.ts
│   └── logistics.module.ts
├── reporting/                  Stok raporları (PDF/Excel)
│   ├── reporting.service.ts
│   ├── reporting.controller.ts
│   └── reporting.module.ts
├── shared/
│   ├── cost-engine.ts          FIFO/AVG maliyet motoru
│   └── constants/
├── events/
│   └── waybill-events.publisher.ts  RabbitMQ olayları (stok çıkış → irsaliye)
├── app.module.ts
└── main.ts
```

---

## Entity'ler & Tablolar

### Product (`products` tablosu)

```typescript
{
  id: UUID;
  tenantId: string;
  sku: string;                  // Benzersiz — tenant başına
  name: string;
  description?: string;
  categoryId?: UUID;            // ProductCategory FK
  unitCode: 'C62'|'KGM'|'LTR'|... // UN/CEFACT birim kodları
  barcode?: string;             // EAN-13 vb. — benzersiz (tenant+barcode)
  kdvRate: number;              // %0, %1, %10, %20 (VUK)
  isStockTracked: boolean;      // false = hizmet (stok takipli değil)
  costMethod: 'FIFO'|'AVG';     // VUK md.274
  avgUnitCostKurus: bigint;     // AVG yöntemi için (kuruş)
  fifoLayers: CostLayer[];      // FIFO yöntemi için — JSONB dizi
  totalStockQty: number;        // Tüm depolar toplamı
  reorderPoint: number;         // Uyarı seviyesi
  minStockQty: number;
  listPriceKurus: bigint;       // Varsayılan satış fiyatı (kuruş)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Birim Kodları (UN/CEFACT):**
| Kod | Açıklama | Notlar |
|-----|----------|--------|
| C62 | Adet | Varsayılan |
| KGM | Kilogram | |
| GRM | Gram | |
| LTR | Litre | |
| MTR | Metre | |
| MTK | Metrekare | |
| MTQ | Metreküp | |
| BX | Kutu | |
| SET | Set | |
| PR | Çift | |
| HUR | Saat (hizmet) | |
| DAY | Gün (hizmet) | |
| MON | Ay (hizmet) | |

### Warehouse (`warehouses` tablosu)

```typescript
{
  id: UUID;
  tenantId: string;
  code: string;                 // Benzersiz — sistem genelinde
  name: string;
  address?: string;
  city?: string;
  isVirtual: boolean;           // true = sanal depo (Fire, Sergi vb.)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

**Not:** MERKEZ depo tenant provizyon sırasında otomatik oluşturulur (tenant-seeder).

### StockMovement (`stock_movements` tablosu)

```typescript
{
  id: UUID;
  tenantId: string;
  productId: UUID;              // Product FK
  warehouseId: UUID;            // Çıkış deposu
  targetWarehouseId?: UUID;     // Sadece TRANSFER tipinde (giriş deposu)
  type: MovementType;           // GIRIS, CIKIS, TRANSFER, SAYIM, ...
  quantity: number;             // Her zaman pozitif (yönü 'type' belirler)
  unitCostKurus: bigint;        // GIRIS/TRANSFER/IADE_GIRIS için giriş maliyeti
  totalCostKurus: bigint;       // quantity × unitCostKurus
  runningBalance: number;       // Hareket sonrası ürün toplam stok adedi
  referenceType?: string;       // 'INVOICE', 'IRSALIYE', 'MANUAL'
  referenceId?: string;         // Fatura/İrsaliye UUID
  notes?: string;
  createdBy: string;            // User UUID
  createdAt: Date;
}
```

**MovementType Değerleri:**
| Tür | Açıklama | Yön | Maliyet |
|-----|----------|-----|---------|
| GIRIS | Satın alma / üretimden giriş | +qty | Birim giriş maliyeti |
| CIKIS | Satış / tüketime çıkış | -qty | FIFO/AVG hesaplanan |
| TRANSFER | Depolar arası transfer | +qty (hedef), -qty (kaynak) | Maliyet kopyalanır |
| SAYIM | Fiziksel sayım düzeltmesi | ±qty | 0 (sayım farkı) |
| IADE_GIRIS | Alış iadesi (tedarikçiye iade) | -qty | Giriş maliyeti ters |
| IADE_CIKIS | Satış iadesi (müşteriden geri) | +qty | CIKIS maliyeti ters |
| FIRE | Fire / kayıp / bozulma | -qty | FIFO/AVG hesaplanan |

**Kurallar:**
- Hareket kaydı **immutable** — silme/güncelleme yapılmaz
- Hata durumunda ters hareket (karşı kayıt) oluşturulur
- TRANSFER tipinde `warehouseId=çıkış`, `targetWarehouseId=giriş`
- Depo bazlı bakiye: `stock_movements` tablosu SUM sorgusuyla (ayrı tablo yok)
- 400 hatası: `"Bu depoda yetersiz stok: ürün=SKU depo=X mevcut=0 talep=5"`

### Marketplace Entities

**MarketplaceIntegration** (`marketplace_integrations`)
```typescript
{
  id: UUID;
  tenantId: string;
  platform: 'TRENDYOL'|'HEPSIBURADA';
  apiKey: string;               // Şifreli (@CredentialEncryptionService)
  apiSecret: string;            // Şifreli
  accountId?: string;
  syncSettings: JSONB;          // { syncInterval, bidirectional, ... }
  lastSyncAt?: Date;
  isActive: boolean;
}
```

**MarketplaceProductMapping** (`marketplace_product_mappings`)
```typescript
{
  id: UUID;
  tenantId: string;
  productId: UUID;              // Enkap ürün
  integrationId: UUID;          // MarketplaceIntegration FK
  marketplaceProductId: string; // Platform ürün ID (Trendyol SKU vb.)
  lastSyncAt?: Date;
}
```

**MarketplaceOrder** (`marketplace_orders`)
```typescript
{
  id: UUID;
  tenantId: string;
  platform: 'TRENDYOL'|'HEPSIBURADA'|'SHOPIFY'|...; // ecommerce ile paylaşılır
  orderId: string;              // Platform sipariş ID
  buyerPhone: string;
  buyerName: string;
  totalAmountKurus: bigint;
  orderDate: Date;
  status: 'PENDING'|'PROCESSING'|'SHIPPED'|'DELIVERED'|'CANCELLED';
  notes?: string;
  createdAt: Date;
  lines: MarketplaceOrderLine[];
}
```

**MarketplaceOrderLine** (`marketplace_order_lines`)
```typescript
{
  id: UUID;
  orderId: UUID;
  productId?: UUID;             // Enkap ürün (mapping varsa)
  platformProductId: string;
  productName: string;
  quantity: number;
  unitPriceKurus: bigint;
  status: 'PENDING'|'CONFIRMED'|'CANCELLED';
}
```

### Ecommerce Integration Entity

**EcommerceIntegration** (`ecommerce_integrations`)
```typescript
{
  id: UUID;
  tenantId: string;
  platform: 'SHOPIFY'|'WOOCOMMERCE'|'TICIMAX'|'IDEASOFT';
  storeUrl: string;
  apiKey: string;               // Şifreli
  syncSettings: JSONB;
  isActive: boolean;
}
```

**Not:** Marketplace ve ecommerce **aynı `marketplace_orders` tablosunu** paylaşırlar (`platform` kolonu ile ayrışırlar).

### Shipment Entity (`shipments` tablosu)

```typescript
{
  id: UUID;
  tenantId: string;
  carrier: 'ARAS'|'YURTICI'|'PTT';
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  city: string;
  weight?: number;              // kg
  status: 'PENDING'|'PICKED'|'IN_TRANSIT'|'DELIVERED'|'FAILED';
  carrierTrackingUrl?: string;
  labelUrl?: string;            // PDF etiket indirme linki
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Maliyet Hesaplama Motoru

### Sistem Tasarımı

Türkiye'de VUK (Vergi Usul Kanunu) **madde 274** her iki yönteme izin verir:
- **FIFO:** İlk Giren İlk Çıkar — GİB raporlamada tercih
- **AVG:** Hareketli Ağırlıklı Ortalama — hızlı revaluation için

Seçilen yöntem ürün bazında **sabit** ve değiştirilemez.

### FIFO Cost Engine (`cost-engine.ts`)

```typescript
interface CostLayer {
  receivedAt: Date;
  quantity: number;             // adet (tam veya kesirli)
  unitCostKurus: number;        // kuruş (tam sayı)
}

class FifoCostEngine {
  static addLayer(layers: CostLayer[], newLayer: CostLayer): CostLayer[]
  static consume(layers: CostLayer[], quantity: number): FifoConsumeResult
  static totalValue(layers: CostLayer[]): number
}

interface FifoConsumeResult {
  totalCostKurus: number;       // Tüketilen toplam maliyet
  remainingLayers: CostLayer[]; // Çıkıştan sonra kalan katmanlar
  remainingQuantity: number;
}
```

**Akış:**
1. **GIRIS hareketi:** `FifoCostEngine.addLayer(fifoLayers, newLayer)`
2. **CIKIS hareketi:** `FifoCostEngine.consume(fifoLayers, quantity)` → yeni katmanlar + maliyet
3. Kalan katmanları `products.fifoLayers` JSONB'ye yaz

### AVG Cost Engine

```typescript
interface AvgCostState {
  totalQuantity: number;
  totalValueKurus: number;      // totalQuantity × avgUnitCostKurus
  avgUnitCostKurus: number;
}
```

**Akış:**
1. **GIRIS:** `avgUnitCostKurus = (mevcut_stok_kurus + giriş_kurus) / (mevcut_qty + giriş_qty)`
2. **CIKIS:** Maliyet = quantity × avgUnitCostKurus (değişmez)
3. Yeni ortalama: `products.avgUnitCostKurus` güncelle

### FIFO Display Maliyeti

**ProductService.applyFifoDisplayCost()** metodunda:
- FIFO ürünlerinde `avgUnitCostKurus = 0` olarak saklanır
- GET isteğinde: FIFO katmanlarının **ağırlıklı ortalaması** hesaplanarak response'a eklenir
- **Muhasebe kaydı değişmez** — sadece API görüntüleme için

```typescript
const totalQty = layers.reduce((s, l) => s + l.quantity, 0);
const totalVal = FifoCostEngine.totalValue(layers);
p.avgUnitCostKurus = totalQty > 0 ? Math.round(totalVal / totalQty) : 0;
```

---

## Marketplace & E-ticaret Entegrasyonu

### Mimarı Tasarım

**İki yönlü senkronizasyon:**
- **ERP → Platform:** Ürün bilgisi, stok miktarı, fiyat
- **Platform → ERP:** Sipariş, CIKIS hareketi otomatik

### Marketplace Modülü (Trendyol, Hepsiburada)

**Trendyol Sync Akışı:**
1. `TrendyolSyncScheduler` → @Cron her 30 dk
2. `TrendyolClient` → Trendyol API çağrısı (stok sorgusu)
3. `TrendyolSyncService.syncStockAndOrders()`
   - Yeni siparişler → `marketplace_orders` INSERT
   - Sipariş satırı → `marketplace_order_lines` INSERT
   - Otomatik stok CIKIS hareketi oluştur

**Credential Yönetimi:**
- `CredentialEncryptionService` → API key/secret AES-256 şifreleme (Vault'tan)
- Decrypt zamanında: çıkış hareketinde kullanılan istemci

### E-ticaret Modülü (Shopify, WooCommerce, Ticimax, İdeaSoft)

**Bağımlılıklar:**
- `CredentialEncryptionService` — marketplace modülündeki servis **paylaşılır** (DRY)
- `MovementModule` — stok hareketi oluşturmak için
- `HttpModule` — REST API çağrıları (Shopify, WooCommerce)

**E-ticaret Sync Akışı:**
1. `EcommerceSyncScheduler` → @Cron (platform bazında farklı interval)
2. Platform spesifik client'lar:
   - `ShopifyClient` — GraphQL API
   - `WooCommerceClient` — REST API + webhook
   - `TicimaxClient` — REST API
   - `IdeaSoftClient` — REST API
3. `EcommerceService.syncStockAndOrders()`
   - Sipariş aktarımı (aynı `marketplace_orders` tablosu)
   - Stok CIKIS hareketi otomatik oluştur

### Sipariş İş Akışı (Marketplace + E-ticaret)

```
Platform Sipariş → marketplace_orders INSERT
                → marketplace_order_lines INSERT
                → StockMovementService.create({
                    type: 'CIKIS',
                    warehouseId: 'MERKEZ',
                    productId: mapped_product_id,
                    quantity: line.quantity,
                    unitCostKurus: hesaplanan_FIFO/AVG,
                    referenceType: 'MARKETPLACE_ORDER',
                    referenceId: order.id
                  })
                → products.totalStockQty UPDATE
```

---

## Kargo (Logistics) Entegrasyonu

### Desteklenen Firmalar
- **Aras Cargo** — ArasCargoClient (REST API)
- **Yurtiçi Cargo** — YurticiCargoClient (REST API)
- **PTT** — PttCargoClient (SOAP)

### Gönderi Akışı

```
OrderService / WaybillService
  → ShipmentService.create({
      carrier: 'ARAS'|'YURTICI'|'PTT',
      recipientName, recipientPhone, recipientAddress,
      weight
    })
  → ArasCargoClient.createShipment()
  → Tracking number, label URL döner
  → shipments INSERT
  → MailerService: Müşteriye teslim e-postası
  → ShipmentService.setupWebhookListener()  // Taşıyıcı webhook dinle
```

### Webhook Yönetimi

Cron job (`@Cron`) kargo durumunu polling ile kontrol eder:
```
Aras: getShipmentStatus(trackingNumber)
  → status: DELIVERED | IN_TRANSIT | FAILED
  → shipments.status UPDATE
  → Müşteriye bildirim e-postası
```

---

## API Endpoint'leri

### Products (`/products`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/products` | Ürün listesi (sayfalı, filtreleme) | DEPO_SORUMLUSU, SATIN_ALMA, SATIS_TEMSILCISI |
| GET | `/products/:id` | Ürün detayı | |
| POST | `/products` | Ürün oluştur | |
| PATCH | `/products/:id` | Ürün güncelle | |
| DELETE | `/products/:id` | Ürün pasif yap | |
| POST | `/products/bulk-import` | Excel toplu import | |

**Query Parametreleri:**
- `search` — Ürün adı veya SKU
- `categoryId` — Kategori UUID
- `page`, `limit` — Sayfalama
- `isActive` — Aktif/pasif filtresi

### Warehouses (`/warehouses`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/warehouses` | Depo listesi | DEPO_SORUMLUSU |
| GET | `/warehouses/:id` | Depo detayı + stok özeti | |
| POST | `/warehouses` | Depo oluştur | |
| PATCH | `/warehouses/:id` | Depo güncelle | |

### Stock Movements (`/movements`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/movements` | Tüm hareketler (sayfalı) | DEPO_SORUMLUSU, SATIN_ALMA |
| GET | `/movements/:id` | Hareket detayı | |
| POST | `/movements` | Hareket oluştur (GIRIS/CIKIS/TRANSFER/SAYIM) | |
| GET | `/movements/product/:productId` | Ürüne ait hareket geçmişi | |
| GET | `/movements/warehouse/:warehouseId` | Depoya ait hareketler | |

**CreateMovementDto:**
```typescript
{
  productId: UUID;
  warehouseId: UUID;
  targetWarehouseId?: UUID;     // TRANSFER için
  type: MovementType;
  quantity: number;
  referenceType?: 'INVOICE'|'IRSALIYE'|'MANUAL';
  referenceId?: string;
  notes?: string;
}
```

### Marketplace (`/marketplace`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/marketplace/integrations` | Platform bağlantıları listesi | |
| POST | `/marketplace/integrations` | Platform bağlantısı oluştur | |
| POST | `/marketplace/sync` | Manuel senkronizasyon tetikle | |
| GET | `/marketplace/orders` | Marketplace siparişleri | |

### E-ticaret (`/ecommerce`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/ecommerce/integrations` | Platform bağlantıları | |
| POST | `/ecommerce/integrations` | Platform ekle (Shopify/WooCommerce/Ticimax/İdeaSoft) | |
| POST | `/ecommerce/sync` | Manuel senkronizasyon | |

### Logistics (`/shipments`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/shipments` | Gönderi listesi | |
| GET | `/shipments/:id` | Gönderi detayı + tracking | |
| POST | `/shipments` | Gönderi oluştur | |
| PATCH | `/shipments/:id/tracking` | Tracking bilgisi güncelle | |
| GET | `/shipments/:id/label` | Kargo etiketi (PDF) | |

### Reporting (`/reports`)

| Yöntem | Endpoint | Açıklama | İzin |
|--------|----------|---------|------|
| GET | `/reports/stock-summary` | Stok özeti (depo×ürün) | |
| GET | `/reports/movement-history` | Hareket geçmişi (PDF/Excel) | |
| GET | `/reports/reorder-points` | Yeniden sipariş uyarıları | |
| GET | `/reports/product-aging` | Yaşlı stok analizi | |

---

## Türkiye Spesifik Kurallar

### KDV Oranları
```typescript
kdvRate: number; // %0, %1, %10, %20 (VUK madde 12)
// %8 artık yok (2003'ten beri)
```

### Birim Standartları
- UN/CEFACT kodları **zorunlu** (GİB UBL-TR uyumluluğu)
- Barkod: EAN-13 (standart), QR veya Data Matrix desteklenir

### Maliyet Metodolojisi
- VUK madde 274: FIFO ve AVG her ikisi yasal
- Seçim ürün bazında yapılır ve sabit kalır
- E-defter uyumluluğu: her harekette birim maliyet kaydedilir

### Stok Hareket Tipleri
- **GIRIS:** Satın alma, üretim, iade giriş
- **CIKIS:** Satış, tüketime çıkış, iade çıkış
- **TRANSFER:** Depo transferi
- **SAYIM:** Fiziksel sayım düzeltmesi
- **FIRE:** Fire, kayıp, bozulma

---

## Marketplace Entegrasyonu — Platform-Spesifik Notlar

### Trendyol
- **API:** REST — `https://api.trendyol.com/...`
- **Auth:** API key + secret (header)
- **Sipariş:** Günlük polling (5 saatte bir)
- **Stok:** Real-time sync (15 dk interval)

### Hepsiburada
- **API:** REST — `https://api.hepsiburada.com/...`
- **Auth:** API key (Bearer token)
- **Sipariş:** Webhook + polling hybrid
- **Stok:** Batch update (saatte bir)

### Shopify (E-ticaret)
- **API:** GraphQL — `https://{shop}.myshopify.com/admin/api/...`
- **Auth:** Access token (API scopes: read/write products, orders)
- **Webhook:** Order creation, product update
- **Stok:** Real-time sync via inventory level API

### WooCommerce (E-ticaret)
- **API:** REST — `https://{site}/wp-json/wc/v3/...`
- **Auth:** Consumer key/secret (HTTP Basic Auth)
- **Webhook:** Webhook listener `/ecommerce/webhooks/woocommerce`
- **Stok:** Batch update (API limit 100 req/min)

### Ticimax (E-ticaret)
- **API:** REST + XML — Türk e-ticaret platformu
- **Auth:** Merchant ID + API key
- **Sipariş:** XML export
- **Stok:** CSV/XML import-export

### İdeaSoft (E-ticaret)
- **API:** REST — Türk e-ticaret platformu
- **Auth:** API token
- **Sipariş:** REST polling
- **Stok:** REST API update

---

## Sentinel Kontroller

### StockMovementService.create() Validasyonu

```typescript
// CIKIS/FIRE/TRANSFER tipleri → Depo bazlı bakiye doğrulaması
const balance = await repository
  .query(`
    SELECT SUM(CASE
      WHEN type IN ('GIRIS', 'IADE_GIRIS', 'IADE_CIKIS') THEN quantity
      WHEN type IN ('CIKIS', 'FIRE', 'TRANSFER') THEN -quantity
      ELSE 0 END) as balance
    FROM stock_movements
    WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
  `, [tenantId, productId, warehouseId]);

if (balance < quantity) {
  throw new BadRequestException(
    `Bu depoda yetersiz stok: ürün=${sku} depo=${code} mevcut=${balance} talep=${quantity}`
  );
}
```

**Hatalar:**
- **400:** Yetersiz stok
- **404:** Ürün/depo bulunamadı
- **409:** Tenant ID uyuşmazlığı (CrossTenantWriteError)

---

## Cron Job'ları

| Job | Interval | Açıklama |
|-----|----------|---------|
| MarketplaceSyncScheduler | 30 dk | Trendyol/Hepsiburada sipariş + stok senkronizasyonu |
| EcommerceSyncScheduler | 1 saat | Shopify/WooCommerce/Ticimax/İdeaSoft sipariş sync |
| LogisticPollingScheduler | 6 saat | Kargo durumu polling (Aras/Yurtiçi/PTT) |
| StockReportingScheduler | 23:59 UTC | Günlük stok raporu oluştur ve email gönder |

**Idempotency:** Tüm job'lar `lastSyncAt` timestamp ile duplicate detection yapar.

---

## RabbitMQ Olayları

```typescript
// StockMovementService → waybill-events.publisher.ts
topic: 'stock.movement'

// CIKIS hareketi oluşturulduğunda
waybill.alis.created  // Satın alma (order-service → purchase-service)
waybill.satis.created // Satış (stock-service → order-service)
waybill.transfer.created
waybill.iade.created
```

---

## Kod Yazım Kuralları (Stock Service Özel)

1. **Maliyet hesaplamalarında `Math.round()`:** Kuruş cinsinden (tam sayı) sonuç
2. **Birim kodu:** Hangi ürün oluşturulurken/güncellenirse, **zorunlu** `UnitCode` enum'dan seç
3. **Barcode:** Benzersizlik tenant+barcode üzerinde (partial index)
4. **FIFO katmanları:** `JSON.parse(fifoLayers)` TypeScript object'e çevir — JSONB'den okurken
5. **Depo bakiyesi:** `stock_movements` SUM sorgusuyla hesapla — denormalize tablo kullanma
6. **Stok çıkışında:** Muhasebe prosedürü: FIFO/AVG ilkesi → **unit_cost_kurus** hesapla
7. **Marketplace credential:** Şifreli sakla — plaintext yok
8. **Hareket immutability:** UPDATE/DELETE yapma — hata durumunda ters hareket oluştur

---

## Entegrasyon Noktaları

| Servis | Endpoint | Amaç |
|--------|----------|------|
| order-service | POST `/orders/:id/ship` | Satış siparişinden kargo oluştur |
| purchase-service | POST `/purchases/:id/receive` | Satın alma yüklemesinden GIRIS hareketi |
| financial-service | POST `/invoices/:id/items` | Fatura satır ürün fiyat |
| waybill-service | GET `/products/:id/cost` | Ürün maliyet sorgusu (irsaliye maliyeti) |
| ai-assistant | POST `/products/categorize` | AI ürün kategorilendirmesi |

---

## Teknik Borç & İyileştirme Alanları

- [ ] Bulk stok hareketi (CSV import)
- [ ] Stok revaluation trigger'ı (VUK uyumu)
- [ ] FIFO → AVG migration tool
- [ ] Marketplace inventory webhook'u (real-time)
- [ ] Kargo entegrasyonu webhook (webhook → polling değil)
- [ ] Multi-currency stok takibi
- [x] Seryal/lot numarası desteği (V068 migration + entity + DTO — 2026-04-10)

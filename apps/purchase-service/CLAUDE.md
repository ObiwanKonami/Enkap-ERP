# Purchase Service (Satın Alma) — claude.md

## Genel Bakış

**Portunum:** :3011
**Teknoloji:** NestJS 10 + Fastify + TypeORM
**Sorumluluğu:** Satın alma siparişleri (PO) ve mal kabul (GRN) yönetimi, stok entegrasyonu, waybill event yayını

Enkap ERP'nin **P2P (Procure-to-Pay)** modülü — tedarikçi siparişini oluşturmadan mal kabul ve stok senkronizasyonuna kadar tüm süreci yönetir.

---

## Modül Mimarisi

```
purchase-service/
├── src/
│   ├── main.ts                          ← Bootstrap (initTracing, FastifyAdapter)
│   ├── app.module.ts                    ← Root modul (TenantModule, HealthModule)
│   ├── purchase-order/
│   │   ├── purchase-order.module.ts     ← PurchaseOrderModule
│   │   ├── purchase-order.service.ts    ← İş mantığı (PO + GRN)
│   │   ├── purchase-order.controller.ts ← HTTP endpoint'leri
│   │   ├── dto/
│   │   │   └── create-purchase-order.dto.ts
│   │   └── entities/
│   │       ├── purchase-order.entity.ts
│   │       └── purchase-order-line.entity.ts
│   ├── goods-receipt/
│   │   └── entities/
│   │       └── goods-receipt.entity.ts
│   └── events/
│       └── waybill-events.publisher.ts  ← RabbitMQ event yayını
└── dist/
```

**Root Modul:** AppModule
- ConfigModule (global)
- TypeOrmModule × 2: default + control_plane (her ikisi DATABASE_URL'den)
- TenantModule → tenant izolasyonu
- PurchaseOrderModule → tüm servis sağlayıcıları
- HealthModule → K8s probes

---

## Database Entity'leri

### 1. `purchase_orders` — Satın Alma Siparişi

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Kiracı izolasyonu |
| `order_number` (poNumber) | VARCHAR(50) UNIQUE | Örn: `PO-2026-0001` — PostgreSQL sequence ile |
| `vendor_id` | UUID | Tedarikçi UUID (crm-contacts'ten) |
| `vendor_name` | VARCHAR(200) NULL | Tedarikçi adı snapshot — oluşturma anında CRM'den kopyalanır (V063) |
| `status` | VARCHAR(20) | `draft` → `sent` → `partial` / `received` / `cancelled` |
| `order_date` | DATE | Sipariş tarihi |
| `expected_date` | DATE NULL | Beklenen teslimat tarihi |
| `notes` | TEXT NULL | Açıklama |
| `kdv_kurus` | BIGINT | KDV toplamı (kuruş) |
| `total_kurus` | BIGINT | Net + KDV toplam (kuruş) |
| `created_by` | UUID NULL | Oluşturan kullanıcı |
| `approved_by` | UUID NULL | Onaylayan kullanıcı |
| `approved_at` | TIMESTAMPTZ NULL | Onay zamanı |
| `created_at` | TIMESTAMPTZ | Oluşturma zamanı |
| `updated_at` | TIMESTAMPTZ | Son güncelleme zamanı |

**Durum Akışı:**
```
draft → sent → partial (kısmi GRN varsa)
       ↘     ↘ received (tüm kalemler GRN'de)
           ↓
       cancelled (her durumdan iptal)
```

**Numaralama:** `po_seq_{year}` PostgreSQL sequence → `PO-{YYYY}-{NNNN}` format

---

### 2. `purchase_order_lines` — Sipariş Kalemleri

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Kiracı izolasyonu |
| `purchase_order_id` | UUID | FK → purchase_orders.id (CASCADE) |
| `product_id` | UUID NULL | stock-service ürün UUID'si |
| `description` (productName) | VARCHAR(300) | Ürün adı snapshot |
| `quantity` | NUMERIC(15,3) | Sipariş miktarı |
| `unit` (unitCode) | VARCHAR(20) | Birim kodu (GİB UBL-TR: C62, C20 vb.) |
| `received_qty` (receivedQuantity) | NUMERIC(15,3) | Mal kabul edilen miktar |
| `unit_price_kurus` | BIGINT | Birim fiyat (kuruş) |
| `kdv_rate` | NUMERIC(5,2) | %0, %1, %10, %20 |
| `line_total_kurus` | BIGINT | Net satır toplamı (kuruş) |

**Cascade:** OneToMany `purchase_orders.lines` → PurchaseOrderLine (eager)

---

### 3. `goods_receipts` — Mal Kabul Belgesi (GRN)

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary key |
| `tenant_id` | UUID | Kiracı izolasyonu |
| `purchase_order_id` | UUID | PO referansı |
| `receipt_number` (grnNumber) | VARCHAR(50) | Örn: `GRN-2026-0001` |
| `created_by` (receivedBy) | UUID | Teslim alan kullanıcı |
| `receipt_date` | DATE | Fiili teslimat tarihi |
| `items` | JSONB | Teslim alınan kalemler (array) |
| `stock_synced` | BOOLEAN | stock-service senkronizasyonu başarılı mı? |
| `stock_sync_error` | TEXT NULL | Hata mesajı (başarısız ise) |
| `notes` | TEXT NULL | Açıklama |
| `created_at` | TIMESTAMPTZ | Oluşturma zamanı |

**items JSONB şeması:**
```typescript
[
  {
    productId: string;
    productName: string;
    warehouseId: string;
    quantity: number;
    unitCostKurus: number;
    movementId?: string;  // stock-service'den dönen movement ID
  }
]
```

**Numaralama:** `grn_seq_{year}` PostgreSQL sequence → `GRN-{YYYY}-{NNNN}` format

---

## API Endpoint'leri

### Purchase Order CRUD

```
POST   /api/v1/purchase-orders
       Yeni satın alma siparişi oluştur
       Body: CreatePurchaseOrderDto
       Response: PurchaseOrder (201 Created)

GET    /api/v1/purchase-orders
       Siparişleri listele (filtrelenebilir)
       Query: status?, vendorId?, limit?, offset?
       Response: { data: PurchaseOrder[], total: number }

GET    /api/v1/purchase-orders/:id
       Sipariş detayı (lines ile)
       Response: PurchaseOrder

PATCH  /api/v1/purchase-orders/:id/submit
       Onaycıya/tedarikçiye gönder (draft → sent)
       Response: PurchaseOrder (sent)

PATCH  /api/v1/purchase-orders/:id/approve
       Siparişi onayla (sent → sent, approvedBy + approvedAt doldur)
       Response: PurchaseOrder (approved)

PATCH  /api/v1/purchase-orders/:id/cancel
       Siparişi iptal et (draft/sent → cancelled)
       Response: PurchaseOrder (cancelled)
```

### Mal Kabul (GoodsReceipt)

```
POST   /api/v1/purchase-orders/:id/goods-receipt
       Mal kabul yap (GRN oluştur → stock-service GIRIS gönder → PO update)
       Body: CreateGoodsReceiptDto
       Headers: authorization? (stock-service'e pass-through)
       Response: GoodsReceipt (201 Created)
       Error: 400 stock sync başarısız, 409 PO durumu uygun değil
```

---

## İş Mantığı

### 1. Satın Alma Siparişi Oluşturma

**Servis:** `PurchaseOrderService.create()`

```typescript
async create(dto: CreatePurchaseOrderDto, createdBy: string): Promise<PurchaseOrder>
```

**Adımlar:**
1. En az 1 kalem kontrolü
2. PO numarası üret: `po_seq_{yıl}` → `PO-{YYYY}-{NNNN}`
3. Her kalem için:
   - Satır toplamı = quantity × unitPriceKurus
   - KDV = satır toplamı × kdvRate / 100
   - KDV toplamına ekle
4. Toplam = kalemler toplamı + KDV
5. PO kaydet (status: `draft`)

**Validasyon:**
- `lines` minimum 1 eleman
- Her kalem: positive quantity + unitPriceKurus
- KDV oranı: 0, 1, 10, 20
- Tarihler ISO string

**Çıkış:** PO tüm kalemleri ile (eager load)

---

### 2. Mal Kabul (GoodsReceipt) — KRİTİK: Compensating Transaction

**Servis:** `PurchaseOrderService.createGoodsReceipt()`

```typescript
async createGoodsReceipt(
  orderId: string,
  items: Array<{ productId, productName, warehouseId, quantity, unitCostKurus }>,
  receivedBy: string,
  receiptDate: string,
  notes?: string,
  authToken?: string,
): Promise<GoodsReceipt>
```

**Akış:**

1. **PO Validasyonu**
   - PO bulunmalı
   - Status `sent` veya `partial` olmalı (received/cancelled hata)

2. **GRN Oluştur**
   - GRN numarası üret: `grn_seq_{yıl}` → `GRN-{YYYY}-{NNNN}`
   - GRN kaydını **önce** kaydet (stockSynced: false)

3. **Stock-Service Senkronizasyonu** (HTTP POST)
   ```
   POST {STOCK_SERVICE_URL}/api/v1/movements
   {
     productId,
     warehouseId,
     type: "GIRIS",
     quantity,
     unitCostKurus,
     referenceType: "purchase_order",
     referenceId: poNumber,
     notes: "Mal Kabul: GRN-{number}"
   }
   ```
   - Başarı: response.data.id → movementId olarak items'e ekle
   - **HATA: Stock başarısız olursa GRN sil (rollback) → BadRequestException**
   - Header'da `authorization` varsa pass-through

4. **GRN Güncelle**
   - items'lere movementId'leri set et
   - stockSynced: true
   - DB'ye kaydet

5. **PO Satırlarını Güncelle** (Transaction)
   - Her kalem için receivedQuantity += quantity
   - Tüm kalemler teslim alındı mı kontrol et
   - Status: allReceived ? `received` : `partial`

6. **RabbitMQ Event Yayını**
   - Routing key: `waybill.alis.created`
   - Payload: GoodsReceiptCreatedEvent
   - waybill-service bu event'i alıp otomatik ALIS irsaliyesi oluşturur

**Hata Durumu:**
- Stock HTTP başarısız → GRN silinir, BadRequestException döner
- PO durumu uygun değil → ConflictException döner
- Kısmi GRN başarısız değil — tüm kalemler senkronize olmalı

---

### 3. Onay Akışı

**submitForApproval():**
- draft → sent
- Tedarikçiye iletilir

**approve():**
- sent → sent (status aynı kalır, approvedBy + approvedAt doldurulur)
- Onay yetkisi kontrol edilmez (bu authorization layer'da yapılmalı)
- Frontend: `approvedBy` dolu ise onay butonu pasif gösterilir (`!order.approvedBy` koşulu)

**cancel():**
- draft, sent, partial, received → cancelled
- received/cancelled durumdan iptal edilemez

---

## Entegrasyonlar

### 1. Stock-Service (HTTP)

**Mal kabul sonrası:**
```
POST {STOCK_SERVICE_URL}/api/v1/movements
```

- Environment: `STOCK_SERVICE_URL` (default: `http://localhost:3004`)
- Başarısız ise GRN silinir (compensating transaction)
- movementId + referenceType/referenceId ile referans oluşturulur

---

### 2. Waybill-Service (RabbitMQ)

**Event:** `waybill.alis.created`
```typescript
interface GoodsReceiptCreatedEvent {
  tenantId: string;
  grnId: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  receiptDate: string;  // ISO date
  vendorName: string;
  vendorVkn?: string;
  vendorAddress?: string;
  items: Array<{
    productId: string;
    productName: string;
    sku?: string;
    unitCode: string;
    quantity: number;
    warehouseId: string;
  }>;
}
```

**Tüketici:** waybill-service → otomatik ALIS irsaliyesi oluşturur

---

## Sıra Üreticileri (Sequence Generators)

### PO Numaralandırma
- **Sequence:** `po_seq_{year}` (runtime'da oluşturulur)
- **Format:** `PO-{YYYY}-{NNNN}` (örn: `PO-2026-0042`)
- **Race-free:** PostgreSQL atomik nextval()

### GRN Numaralandırma
- **Sequence:** `grn_seq_{year}` (runtime'da oluşturulur)
- **Format:** `GRN-{YYYY}-{NNNN}` (örn: `GRN-2026-0015`)
- **Race-free:** PostgreSQL atomik nextval()

---

## Para Birimi & Numarlandırma Kuralları

### Kuruş (Kurus) — Tüm Para Değerleri
- DB'de her zaman **BIGINT kuruş** olarak saklanır
- `unitPriceKurus` = 15.000.000 = 150.000 TL
- Frontend gösterişte `kurusToTl()` ile dönüştürülür

### KDV Oranları
- **%0, %1, %10, %20** — GİB UBL-TR standardı
- KDV hesapla = satır toplamı × kdvRate / 100
- Tüm kalemler için topla

### Birim Kodları (GİB UBL-TR)
- Standart: `C62` (piece), `C20` (carton), vb.
- Default: `ADET`

---

## Kritik Kurallar

### 1. Tenant İzolasyonu
- Her INSERT/UPDATE TenantAwareSubscriber tarafından kontrol edilir
- `getTenantContext().tenantId` gerekir (TenantGuard ile sağlanır)

### 2. Mal Kabul Idempotency
- Kısmi mal kabul desteklenir (aynı PO için birden fazla GRN)
- GRN numerik seq yıla göre (2026 ve 2027 ayrı sequence)

### 3. Stock Sync Compensating
- Stock POST başarısız → GRN silinir
- Kısmi sync güvenli değil — tüm kalemler başarılı olmak zorunda

### 4. Event Yayını
- `waybill.alis.created` RabbitMQ persistent message
- waybill-service bu event'e abone olup otomatik irsaliye oluşturur

### 5. Authorization
- TenantGuard zorunlu (her endpoint'e)
- Role/Feature kontrol: @Roles(), @RequiresPlan() (uygulama kodunda yapılmalı)

---

## Environment Değişkenleri

| Değişken | Örnek | Açıklama |
|----------|-------|---------|
| `PORT` | 3011 | Servis portu |
| `DATABASE_URL` | `postgresql://...` | Tenant + control_plane şema |
| `RABBITMQ_URL` | `amqp://localhost:5672` | Event broker |
| `STOCK_SERVICE_URL` | `http://stock-service:3004` | Stok entegrasyonu |
| `FINANCIAL_SERVICE_URL` | `http://financial-service:3003` | Otomatik alış faturası |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4317` | Distributed tracing |
| `LOG_LEVEL` | `debug` | Logger seviyesi |

---

## RabbitMQ

### Publisher: WaybillEventsPublisher
- `onModuleInit()` ile RabbitMQ bağla
- Exchange: `enkap` (topic, durable)
- Routing key: `waybill.alis.created`
- Mesaj: GoodsReceiptCreatedEvent (JSON)
- Persistent: true

**Bağlanamadığında:**
- `warn` log'a düşer (servis devam eder)
- `publishGoodsReceiptCreated()` no-op olur

---

## Testing Notları

### Unit Tests
- `PurchaseOrderService.create()` — PO numarası, KDV hesapla
- `PurchaseOrderService.createGoodsReceipt()` — GRN oluştur, stock sync, compensation
- `WaybillEventsPublisher` — RabbitMQ mock

### Integration Tests
- PostgreSQL test container
- Stock-service mock HTTP
- GRN → PO status güncellemesi
- Kısmi mal kabul senaryo

### Swagger Documentation
- `/docs` endpoint'de tüm API'ler belgelenmiş
- Örnek request/response'ler yer alır

---

## Mimari Kararlar & Trade-off'lar

| Karar | Neden |
|-------|-------|
| HTTP stock sync | stock-service bağımsız skalabilite, async event yok (senkron confirm) |
| Compensating transaction | stock başarısız olursa veri tutarsızlığı olmamak için GRN rollback |
| RabbitMQ event (async) | waybill-service otomatik irsaliye, loose coupling |
| JSONB items | flexible schema, nested data (productId+name+warehouseId+costs) |
| Yıllık sequence | sefer numarası gibi yıla göre reset (fiscal year alignment) |
| Draft → sent → received | onay workflow + kısmi teslimat izni |

---

## Gelecek İyileştirmeler

- [ ] GRN cancel endpoint (partial undo)
- [ ] PO revision / line amendment
- [ ] Mal kabul variance tracking (expected vs. received)
- [ ] Budget / commitment kontrol
- [ ] Purchase analytics (lead time, supplier performance)
- [ ] Receipt advance notification (EDI / SMS tedarikçiye)

---

## Bağlantılar

**İlgili Servisler:**
- **stock-service** (:3004) — Stok hareketleri
- **waybill-service** (:3018) — e-İrsaliye
- **crm-service** (:3009) — Tedarikçi kişileri
- **treasury-service** (:3013) — Ödeme emri (GRN sonrası)

**Konular:**
- CLAUDE.md (root) — Genel mimari
- apps/waybill-service/CLAUDE.md — e-İrsaliye + GİB
- apps/stock-service/CLAUDE.md — Stok yönetimi

# Order Service (`:3012`) — Satış Siparişi & Sevkiyat API

Bu dosya order-service'in mimarisi, veri modeli ve kritik işlemlerini açıklar.

## Genel Bakış

**Amaç:** Satış siparişlerini (Sales Orders) yönet, sevkiyat (delivery) kaydı tut, stok hareketlerini tetikle, waybill-service'e olay gönder.

**Temel akış (O2C — Order to Cash):**
```
draft (taslak)
  ↓ confirm
confirmed (onaylandı)
  ↓ startPicking
processing (hazırlanıyor)
  ↓ createDelivery (stok CIKIS + fleet sefer)
shipped (sevk edildi)
  ↓ [waybill-service → e-İrsaliye oluştur]
delivered (teslim edildi)
```

**Önemli:** SO aynı anda birden fazla kez `createDelivery` ile sevkiyata tabi tutulabilir (kısmi sevkiyat).

---

## Teknoloji Yığını

| Bileşen | Teknoloji | Notlar |
|---------|-----------|--------|
| Framework | NestJS 10 + Fastify | Hızlı HTTP sunucusu |
| ORM | TypeORM 0.3 | Tenant DataSourceManager ile multi-tenant desteği |
| Veritabanı | PostgreSQL (tenant şeması) | Sequence: `so_seq_{yıl}`, `irs_seq_{yıl}` |
| Dış API | HttpService (axios) | stock-service, fleet-service senkronizasyonu |
| Mesajlaşma | RabbitMQ | waybill-service'e `waybill.satis.created` event |
| E-posta | @enkap/mailer | Müşteri bildirim şablonları |
| Observability | OpenTelemetry + Prometheus | `initTracing()` + `/metrics` endpoint |
| Health Check | @nestjs/terminus | Kubernetes probes (`/health`) |

---

## Klasör Yapısı

```
apps/order-service/
├── src/
│   ├── main.ts                         ← Bootstrap: Fastify, OTel, Swagger
│   ├── app.module.ts                   ← AppModule: DataSource config, middleware
│   ├── sales-order/
│   │   ├── sales-order.module.ts       ← SalesOrderModule
│   │   ├── sales-order.service.ts      ← Core business logic (6 methods)
│   │   ├── sales-order.controller.ts   ← REST endpoints
│   │   ├── entities/
│   │   │   ├── sales-order.entity.ts   ← SalesOrder (draft…delivered)
│   │   │   ├── sales-order-line.entity.ts
│   │   │   └── delivery.entity.ts      ← Sevkiyat kaydı
│   │   └── dto/
│   │       └── create-sales-order.dto.ts
│   └── events/
│       └── waybill-events.publisher.ts  ← RabbitMQ publisher
├── package.json
├── tsconfig.json
└── CLAUDE.md                            ← Bu dosya
```

---

## Veri Modeli

### SalesOrder (Satış Siparişi)

| Sütun | Tür | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Tenant izolasyonu |
| `order_number` (soNumber) | VARCHAR(50) | **Unique:** SO-2026-0123 |
| `customer_id` | UUID | CRM Contact ID |
| `status` | VARCHAR(20) | draft / confirmed / processing / shipped / delivered / cancelled |
| `order_date` | DATE | Sipariş tarihi |
| `delivery_date` | DATE | Taahhüt edilen teslimat tarihi (nullable) |
| `delivery_address` | TEXT | JSON string (nullable) |
| `notes` | TEXT | Açıklamalar (nullable) |
| `kdv_kurus` | BIGINT | KDV toplamı — **kuruş cinsinden** |
| `total_kurus` | BIGINT | Genel toplam — **kuruş cinsinden** |
| `created_by` | UUID | Oluşturan kullanıcı |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |

**İlişkiler:**
- **1:N** `SalesOrderLine` — sipariş kalemlerine cascade insert/update

**Kısıtlamalar:**
- `soNumber` unique per tenant (sequence kullanımı race-free)
- `status` durumu sadece belli geçişler izin verir (confirm, startPicking vb)

### SalesOrderLine (Sipariş Kalemi)

| Sütun | Tür | Açıklama |
|-------|-----|---------|
| `id` | UUID | |
| `sales_order_id` | UUID | FK |
| `product_id` | UUID | Ürün referansı |
| `product_name` | VARCHAR | Ürün adı snapshot |
| `unit_code` | VARCHAR | ADET, KG, L vb. (default: ADET) |
| `quantity` | DECIMAL | Miktar |
| `unit_price_kurus` | BIGINT | Birim fiyat — **kuruş** |
| `discount_rate` | DECIMAL | %0–100 |
| `kdv_rate` | DECIMAL | KDV oranı (%0, %1, %10, %20) |
| `line_total_kurus` | BIGINT | Satır net toplam — **kuruş** |

### Delivery (Sevkiyat Kaydı)

| Sütun | Tür | Açıklama |
|-------|-----|---------|
| `id` | UUID | |
| `tenant_id` | UUID | |
| `sales_order_id` | UUID | FK → SalesOrder |
| `delivery_number` | VARCHAR(50) | **Format:** IRS-2026-0456 |
| `status` | VARCHAR(20) | pending / dispatched (stock synced başarılı ise) |
| `delivery_date` | DATE | Sevk tarihi |
| `items` | JSONB | `[{productId, productName, warehouseId, quantity, movementId?}]` |
| `carrier` | VARCHAR(100) | Kargo firması adı (nullable) |
| `tracking_number` | VARCHAR(100) | Kargo takip numarası (nullable) |
| `vehicle_id` | UUID | Fleet servisinden araç UUID (nullable) |
| `driver_id` | UUID | Sürücü UUID (nullable) |
| `trip_id` | UUID | Fleet servisinden sefer UUID (nullable) |
| `stock_synced` | BOOLEAN | Stok CIKIS hareketi başarılı mı? |
| `stock_sync_error` | TEXT | Hata mesajı (nullable) |
| `created_by` | UUID | |
| `created_at` | TIMESTAMP | |

---

## Core Services & Methods

### SalesOrderService

```typescript
// Tenant context'ten otomatik → repos() helper
private async repos() → { orderRepo, lineRepo, deliveryRepo, dataSource, tenantId }
```

#### 1. `create(dto, createdBy): Promise<SalesOrder>`

**Input:** CreateSalesOrderDto
```typescript
{
  customerId: UUID;
  orderDate: ISO date string;
  promisedDeliveryDate?: ISO date string;
  deliveryAddress?: { ... };
  notes?: string;
  lines: [{
    productId: UUID;
    productName: string;
    unitCode?: string;       // default: 'ADET'
    quantity: number;
    unitPriceKurus: bigint;
    discountRate?: number;   // %
    kdvRate: number;         // %, must be in [0, 1, 10, 20]
  }];
}
```

**İş Mantığı:**
1. `lines.length >= 1` kontrolü (en az bir kalem zorunlu)
2. SO numarası PostgreSQL sequence'den: `so_seq_{yıl}` → SO-{YYYY}-{NNNN}
3. Her kalem için satır hesapla:
   - Brüt = `quantity × unitPriceKurus`
   - İndirim = `brüt × discountRate / 100`
   - Net = `brüt - indirim`
   - KDV satırı = `net × kdvRate / 100`
4. Toplam KDV birleştir
5. SO kaydı + lines cascade save

**Output:** SalesOrder entity

---

#### 2. `findAll(params): Promise<{ data: SalesOrder[]; total: number }>`

**Input:**
```typescript
{
  status?: string;     // Optional filter
  customerId?: string;
  limit?: number;      // Default: 50, Max: 200
  offset?: number;
}
```

**Sorgu:** QueryBuilder, `leftJoinAndSelect('so.lines')`, order by created_at DESC

**Output:** Paginated response

---

#### 3. `findOne(id): Promise<SalesOrder>`

**Tenant erişim kontrolü:** where `{ id, tenantId }`

**Relations:** `['lines']`

---

#### 4. `confirm(id): Promise<SalesOrder>`

**Durum kontrolü:** `draft → confirmed` (başka durumda ConflictException)

---

#### 5. `startPicking(id): Promise<SalesOrder>`

**Durum kontrolü:** `confirmed → processing`

---

#### 6. `createDelivery(orderId, items, shipDate, carrier?, tracking?, createdBy?, authToken?, vehicleId?, driverId?, origin?, destination?): Promise<Delivery>`

**ÖNEMLİ:** Bu method kritik iş sağlanması (saga) işlemi yapar:

**Step 1:** Delivery kaydını oluştur (`pending` durumu, `stock_synced=false`)

**Step 2:** stock-service'e HTTP POST
```typescript
POST {STOCK_SERVICE_URL}/api/v1/movements
{
  productId: string;
  warehouseId: string;
  type: 'CIKIS';
  quantity: number;
  referenceType: 'sales_order';
  referenceId: order.soNumber;
  notes: `Sevkiyat: ${deliveryNumber}`;
}
```

**Step 3:** Hata kontrolü — stock başarısız ise:
- Delivery kaydını sil
- BadRequestException fırla (compensating transaction)
- stock_synced = false kalır

**Step 4:** Başarılı ise:
- `delivery.items[].movementId` güncelle
- `stock_synced = true`, `status = 'dispatched'`
- SO durumu `shipped` olur

**Step 5 (fire-and-forget):** Fleet-service sefer oluştur (vehicleId && driverId ise)
```typescript
POST {FLEET_SERVICE_URL}/api/v1/trips
{
  vehicleId: UUID;
  driverId: UUID;
  deliveryId: UUID;
  salesOrderId: UUID;
  origin: string;
  destination: string;
  plannedDeparture: ISO string;
}
```

Hata → logger.warn (akışı durdurma)

**Step 6 (fire-and-forget):** RabbitMQ event publish
```typescript
waybillPublisher.publishDeliveryCreated({
  tenantId, deliveryId, deliveryNumber, salesOrderId, soNumber, ...items
})
```

→ waybill-service tüketici → `waybill.satis.created` event → SATIS irsaliyesi otomatik oluştur

---

#### 7. `cancel(id): Promise<SalesOrder>`

**Durum kontrolü:** `delivered` veya `cancelled` durumda hata, başka durum → `cancelled`

---

#### 8. `getDeliveries(orderId): Promise<Delivery[]>`

**Siparişe ait tüm sevkiyatları listele** (DESC by created_at)

---

## RabbitMQ Integration

### WaybillEventsPublisher

**Exchange:** `enkap` (topic, durable)

**Routing Keys:**

| Key | Payload | Açıklama |
|-----|---------|---------|
| `waybill.satis.created` | DeliveryCreatedEvent | Satış sevkiyatı → e-İrsaliye oluştur |
| `waybill.iade.created` | ReturnCreatedEvent | İade sevkiyatı (TODO: implement) |

**Durum Kontrolü:**
- `onModuleInit()`: RabbitMQ'ya bağlan, exchange assert
- `onModuleDestroy()`: Graceful close (try-catch yoksay)
- RabbitMQ hazır değilse: logger.warn, event yoksayılır (graceful degradation)

**Event Payload** (DeliveryCreatedEvent):
```typescript
{
  tenantId: string;
  deliveryId: UUID;
  deliveryNumber: string;          // IRS-2026-0456
  salesOrderId: UUID;
  soNumber: string;                // SO-2026-0123
  shipDate: string;                // ISO date
  customerName: string;
  customerVknTckn?: string;
  customerAddress?: string;
  carrierName?: string;
  trackingNumber?: string;
  vehiclePlate?: string;           // Kendi aracıyla sevk
  driverName?: string;
  driverTckn?: string;
  items: [{
    productId: UUID;
    productName: string;
    sku?: string;
    unitCode: string;              // ADET, KG vb
    quantity: number;
    warehouseId: UUID;
  }];
}
```

---

## REST API Endpoints

### POST `/api/v1/orders`
**Yeni satış siparişi oluştur**

Status: 201
```json
{
  "lines": [
    {
      "productId": "uuid",
      "productName": "Ürün A",
      "quantity": 5,
      "unitPriceKurus": 100000,
      "kdvRate": 20
    }
  ],
  "customerId": "uuid",
  "orderDate": "2026-04-03",
  "promisedDeliveryDate": "2026-04-10",
  "notes": "Acil!"
}
```

---

### GET `/api/v1/orders`
**Sipariş listesi**

Query params:
```
?status=confirmed
&customerId=uuid
&limit=50
&offset=0
```

Response: `{ data: SalesOrder[], total: number }`

---

### GET `/api/v1/orders/:id`
**Sipariş detayı** (with lines)

---

### POST `/api/v1/orders/:id/confirm`
**Siparişi onayla** (draft → confirmed)

---

### POST `/api/v1/orders/:id/pick`
**Hazırlanmaya başla** (confirmed → processing)

---

### POST `/api/v1/orders/:id/deliveries`
**Sevkiyat kaydı oluştur** (trigger: stok CIKIS + fleet sefer + waybill event)

Status: 201
```json
{
  "items": [
    {
      "productId": "uuid",
      "productName": "Ürün A",
      "warehouseId": "uuid",
      "quantity": 5
    }
  ],
  "shipDate": "2026-04-05",
  "carrier": "Aras",
  "tracking": "12345678",
  "vehicleId": "uuid",
  "driverId": "uuid",
  "origin": "İstanbul Depo",
  "destination": "Ankara Müşteri"
}
```

---

### GET `/api/v1/orders/:id/deliveries`
**Siparişe ait sevkiyat listesi**

---

### POST `/api/v1/orders/:id/cancel`
**Siparişi iptal et**

---

## Sequence Numarası Üretimi

### SO Numarası: `SO-{YYYY}-{NNNN}`

```typescript
// apps/order-service/src/sales-order/sales-order.service.ts:21-32
async function generateSoNumber(dataSource: DataSource): Promise<string> {
  const year = new Date().getFullYear();
  const result = await dataSource.query<[{ seq: string }]>(
    `SELECT LPAD(nextval('so_seq_${year}')::text, 4, '0') AS seq`
  ).catch(async () => {
    await dataSource.query(`CREATE SEQUENCE IF NOT EXISTS so_seq_${year} START 1`);
    return dataSource.query<[{ seq: string }]>(
      `SELECT LPAD(nextval('so_seq_${year}')::text, 4, '0') AS seq`
    );
  });
  return `SO-${year}-${result[0].seq}`;
}
```

**Race-free:** PostgreSQL sequence atomic increment

**Yıl değişikliği:** Otomatik yeni sequence oluştur (CREATE SEQUENCE IF NOT EXISTS)

---

### İrsaliye Numarası: `IRS-{YYYY}-{NNNN}`

Aynı mantık, sequence: `irs_seq_{yıl}`

**Fark:** order-service'teki `irs_seq_*` sequence'leri; waybill-service'teki `irs_wb_seq_*` sequence'lerinden ayrı.

---

## Middleware & Guard'lar

### TenantContextMiddleware
**Otomatik bağlanır** (app.module.ts `configure()`'de)

→ Her request'te `AsyncLocalStorage`'dan tenant context alır
→ `getTenantContext()` → `{ tenantId, userId, ... }`

### TenantGuard
**Controller'larda** `@UseGuards(TenantGuard)` (sales-order.controller'de)

→ getTenantContext() başarısız ise 401

### TransformResponseInterceptor
**Global** (main.ts'de)

→ Response'u snake_case → camelCase dönüştür

### MetricsMiddleware
**Global** (app.module.ts)

→ Prometheus metrikleri topla (`forRoutes('*')`)

---

## Önemli Notlar

### 1. Para Birimi — Kuruş (Integer)

Tüm para değerleri **kuruş** (`BIGINT`) olarak DB'de saklanır:
- `unitPriceKurus`, `lineTotalKurus`, `totalKurus`, `kdvKurus`
- Frontend gösterimde: `formatCurrency(kurusToTl(kurus))`
- İnline `/ 100` **yasak** — `kurusToTl()` kullan

---

### 2. Compensating Transaction (Saga Pattern)

`createDelivery()` multi-step işlem:

```
Delivery kaydı (DB) ✓
    ↓
Stock CIKIS HTTP (stock-service)
    ├─ ✓ → devam et
    └─ ✗ → Delivery sil, hata fırla (daha sonra retry yok)
    ↓
Fleet sefer (fire-and-forget, hata log'a)
    ↓
Waybill event (fire-and-forget, hata log'a)
```

**Kritik:** Stock başarısız ise **hiç şey yapılmaz** (atomicity).

---

### 3. Fire-and-Forget Pattern

```typescript
// Fleet sefer ve waybill event — fail ise logger.warn, akış devam
firstValueFrom(...).catch(err => logger.warn(...));
```

→ Dış servis timeout/fail → sipariş işlemi bloke edilmez

---

### 4. Multi-tenant İzolasyonu

Her sorgu `where: { ..., tenantId }`

```typescript
// ✅ Doğru
orderRepo.find({ where: { id, tenantId } });

// ❌ Yanlış
orderRepo.find({ where: { id } });  // Cross-tenant data sızıntısı!
```

---

### 5. Authorization Token Geçişi

```typescript
// Header'dan auth token al ve dış API'lere gönder
@Headers('authorization') auth?: string;

// stock-service & fleet-service'e forward et
headers['Authorization'] = auth;
```

---

## Hata İşleme

| Exception | HTTP Status | Açıklama |
|-----------|-------------|---------|
| `NotFoundException` | 404 | Sipariş bulunamadı |
| `BadRequestException` | 400 | lines boş, stok senkronizasyonu başarısız |
| `ConflictException` | 409 | Durum geçişi geçersiz (confirm/cancel) |
| `TenantNotFoundError` | 401 | Tenant context alınamadı |

---

## Observability

### Tracing
```typescript
// main.ts
initTracing('order-service');  // NestFactory.create'ten ÖNCE
```

→ OpenTelemetry SDK başlat (OTEL_EXPORTER_OTLP_ENDPOINT env'den)

### Metrics
```
GET /api/v1/metrics
```

→ Prometheus format (MetricsMiddleware)

### Health Check
```
GET /api/v1/health
```

→ Kubernetes liveness + readiness probes

### Logger
```typescript
private readonly logger = new Logger(SalesOrderService.name);
this.logger.log(`[${tenantId}] Sevkiyat tamamlandı: ${deliveryNumber}`);
```

---

## Geliştirme & Test

### Local Başlatma

```bash
# Docker altyapısı (DB, Redis, RabbitMQ)
docker compose up -d postgres redis rabbitmq

# order-service
pnpm --filter @enkap/order-service dev
# listening on :3012
```

### Ortam Değişkenleri

```bash
# Required
DATABASE_URL=postgresql://enkap_admin:localdev_only@localhost:5432/enkap_tenant_tenant_1
CONTROL_PLANE_DATABASE_URL=postgresql://enkap_admin:localdev_only@localhost:5432/enkap_control_plane

# Optional (graceful fallback)
STOCK_SERVICE_URL=http://localhost:3004        # default
FLEET_SERVICE_URL=http://localhost:3017        # default
RABBITMQ_URL=amqp://localhost:5672             # default

# Observability (development'da boş bırakabilir)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_DISABLED=true  # geliştirmede
```

### Test Senaryosu

```bash
# 1. SO oluştur
curl -X POST http://localhost:3012/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "customerId": "uuid", "orderDate": "2026-04-03", "lines": [...] }'

# 2. SO onayla
curl -X POST http://localhost:3012/api/v1/orders/{id}/confirm \
  -H "Authorization: Bearer <token>"

# 3. Hazırlanmaya başla
curl -X POST http://localhost:3012/api/v1/orders/{id}/pick \
  -H "Authorization: Bearer <token>"

# 4. Sevkiyat oluştur (stock CIKIS + waybill event)
curl -X POST http://localhost:3012/api/v1/orders/{id}/deliveries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "items": [...], "shipDate": "2026-04-05", "carrier": "Aras" }'

# 5. Sevkiyat listesi kontrol et
curl http://localhost:3012/api/v1/orders/{id}/deliveries \
  -H "Authorization: Bearer <token>"
```

---

## Kritik Kurallar

### 1. Tenant İzolasyonu
Her sorgu `tenantId` ile filtrelenmelidir. Cross-tenant sızıntısı → **KVKK ihlali**.

### 2. Para Birimi
Her zaman kuruş (bigint). Frontend gösterimde `kurusToTl()` + `formatCurrency()`.

### 3. Sequence Üretimi
**Dış API değil** — PostgreSQL sequence (atomic, race-free).

### 4. Compensating Transaction
Delivery yaratılırken stock başarısız → Delivery silinir (atomicity).

### 5. Event Publishing
waybill-service otomatik e-İrsaliye oluştursun (`waybill.satis.created` event).

### 6. Fire-and-Forget
Fleet sefer & bildirim e-postası timeout etmemeli → try-catch, logger.warn

---

## Başarılı İşlemler Referansı

- ✅ SO numarası PostgreSQL sequence'den race-free (LPAD + nextval)
- ✅ Sevkiyat stok hareketini senkronize eder (compensating transaction)
- ✅ Fleet servisine otomatik sefer oluşturur (fire-and-forget)
- ✅ waybill-service'e event gönderir → e-İrsaliye otomatik
- ✅ Tenant izolasyonu her sorgu'da zorunlu
- ✅ Para birimi kuruş (bigint) olarak tutulur
- ✅ Health check + Prometheus metrikleri entegre

---

## İlişkili Servisler

| Servis | Port | Etkileşim | Yön |
|--------|------|-----------|-----|
| stock-service | :3004 | CIKIS hareketi | HTTP POST (sync) |
| fleet-service | :3017 | Sefer oluştur | HTTP POST (fire-and-forget) |
| waybill-service | :3018 | e-İrsaliye | RabbitMQ event (async) |
| crm-service | :3009 | Müşteri info | (future: HTTP) |

---

Daha fazla bilgi için ana [`CLAUDE.md`](../../CLAUDE.md) dosyasına bakınız.

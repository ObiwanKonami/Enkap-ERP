# Waybill Service — e-İrsaliye Modülü

**Port:** `:3018`
**Framework:** NestJS 10 + Fastify
**Veritabanı:** PostgreSQL (tenant şeması per-schema)

---

## Genel Bakış

Waybill Service, Enkap ERP'nin **e-İrsaliye (delivery note) yönetim servisidir.**

### Temel Sorumluluklar
1. **CRUD İşlemleri** — İrsaliyeler oluştur, oku, güncelle, iptal et
2. **GİB e-İrsaliye Entegrasyonu** — UBL-TR XML üretimi, SOAP gönderimi, durum takibi
3. **Outbox Pattern** — Asenkron GİB gönderimi (30 saniye cron)
4. **RabbitMQ Event Tüketimi** — order/purchase/stock servislerinden irsaliye olaylarını al

### İrsaliye Türleri (WaybillType)
| Tür | Kaynak | Açıklama |
|-----|--------|---------|
| `SATIS` | order-service | Satış siparişine bağlı sevkiyat |
| `ALIS` | purchase-service | Satın alma / mal kabul irsaliyesi |
| `TRANSFER` | stock-service | Depo-depo transfer irsaliyesi |
| `IADE` | order/purchase-service | İade irsaliyesi |

### İrsaliye Durumları (WaybillStatus)
```
TASLAK → ONAYLANDI → GIB_KUYRUKTA → GIB_GONDERILDI → GIB_ONAYLANDI
                                                    ↓
                                            GIB_REDDEDILDI (düzeltme gerekli)
                                                    ↓
                                              IPTAL
```

---

## Klasör Yapısı

```
waybill-service/
├── src/
│   ├── main.ts                      # Bootstrap (OTel tracing, Fastify)
│   ├── app.module.ts                # Root module + outbox cron (30sn)
│   ├── waybill/
│   │   ├── waybill.module.ts        # WaybillModule
│   │   ├── waybill.controller.ts    # REST API endpoints
│   │   ├── waybill.service.ts       # İrsaliye CRUD lojik
│   │   ├── waybill-gib.service.ts   # GİB API iletişimi
│   │   ├── waybill-xml.service.ts   # UBL-TR XML builder
│   │   ├── waybill-pdf.service.ts   # PDF oluşturma
│   │   ├── entities/
│   │   │   ├── waybill.entity.ts    # Waybill entity
│   │   │   └── waybill-line.entity.ts # İrsaliye kalemi
│   │   └── dto/
│   │       └── create-waybill.dto.ts # İrsaliye oluşturma DTO
│   ├── outbox/
│   │   ├── outbox.entity.ts         # GibOutbox entity (GİB gönderimi kuyruğu)
│   │   └── outbox.service.ts        # Outbox işleyici (cron worker)
│   └── events/
│       └── waybill-events.consumer.ts # RabbitMQ consumer
└── package.json
```

---

## Entity'ler

### `Waybill` (waybill.entity.ts)

**Tablo:** `waybills` (tenant şeması)

| Alan | Tür | Açıklama |
|------|-----|---------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Kiracı ID (izolasyon) |
| `waybillNumber` | VARCHAR(25) | Format: `IRS-{YYYY}-{NNNN}` |
| `type` | VARCHAR(20) | SATIS \| ALIS \| TRANSFER \| IADE |
| `status` | VARCHAR(25) | İrsaliye durumu (default: TASLAK) |
| `shipDate` | DATE | Sevk tarihi |
| `deliveryDate` | DATE (nullable) | Teslim tarihi |
| **Gönderici** | | |
| `senderName` | VARCHAR(250) | Gönderici adı |
| `senderVkn` | VARCHAR(15) | Gönderici VKN |
| `senderAddress` | TEXT | Gönderici adresi |
| **Alıcı** | | |
| `receiverName` | VARCHAR(250) | Alıcı adı |
| `receiverVknTckn` | VARCHAR(15) | VKN (B2B) veya TCKN (B2C) |
| `receiverAddress` | TEXT | Alıcı adresi |
| **Taşıma** | | |
| `vehiclePlate` | VARCHAR(20) | Araç plakası (iç taşıma) |
| `driverName` | VARCHAR(100) | Sürücü adı |
| `driverTckn` | VARCHAR(11) | Sürücü TCKN |
| `carrierName` | VARCHAR(100) | Kargo firması adı (dış taşıma) |
| `trackingNumber` | VARCHAR(100) | Kargo takip numarası |
| **GİB** | | |
| `gibEnvelopeId` | UUID | GİB'e gönderilen zarf UUID |
| `gibUuid` | UUID | GİB'in atadığı belge UUID |
| `gibStatusCode` | VARCHAR(20) | GİB yanıt kodu (1300=SUCCESS vb.) |
| `gibStatusDesc` | TEXT | GİB yanıt açıklaması |
| `gibSentAt` | TIMESTAMPTZ | Gönderim zamanı |
| `gibResponseAt` | TIMESTAMPTZ | GİB yanıt zamanı |
| `signedXml` | TEXT | İmzalanmış UBL-TR XML |
| **Referans** | | |
| `refType` | VARCHAR(30) | sales_order \| purchase_order \| stock_transfer \| return |
| `refId` | UUID | Kaynak belge UUID |
| `refNumber` | VARCHAR(30) | Kaynak belge numarası (SO-2025-0001 vb.) |
| `returnDirection` | VARCHAR(20) | İade yönü (IADE türü için): MUSTERIDEN \| TEDARIKCIYE |
| `notes` | TEXT | Notlar |
| `createdBy` | VARCHAR(100) | Oluşturan kullanıcı |
| `createdAt` | TIMESTAMPTZ | Oluşturma zamanı |
| `updatedAt` | TIMESTAMPTZ | Güncelleme zamanı |

**İlişkiler:**
- `lines` (OneToMany) → WaybillLine[]

### `WaybillLine` (waybill-line.entity.ts)

**Tablo:** `waybill_lines` (tenant şeması)

| Alan | Tür | Açıklama |
|------|-----|---------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Kiracı ID |
| `waybillId` | UUID | İrsaliye ID (FK) |
| `productId` | UUID | Ürün ID |
| `productName` | VARCHAR(250) | Ürün adı |
| `sku` | VARCHAR(50) | Ürün kodu |
| `unitCode` | VARCHAR(10) | Birim kodu (ADET, KG, LT vb.) |
| `quantity` | NUMERIC(12,2) | Miktar |
| `warehouseId` | UUID | Kaynak depo ID |
| `targetWarehouseId` | UUID | Hedef depo ID (TRANSFER için) |
| `lotNumber` | VARCHAR(50) | Lot numarası |
| `serialNumber` | VARCHAR(50) | Seri numarası |
| `movementId` | UUID | Stok hareketi ID (referans) |
| `createdAt` | TIMESTAMPTZ | Oluşturma zamanı |

**İlişkiler:**
- `waybill` (ManyToOne) → Waybill

### `GibOutbox` (outbox.entity.ts)

**Tablo:** `gib_outbox` (tenant şeması) — Outbox Pattern

| Alan | Tür | Açıklama |
|------|-----|---------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Kiracı ID |
| `waybillId` | UUID | İrsaliye ID |
| `status` | VARCHAR(20) | PENDING \| PROCESSING \| SENT \| FAILED |
| `action` | VARCHAR(20) | SEND \| POLL \| CANCEL |
| `attemptCount` | INT | Deneme sayısı |
| `maxAttempts` | INT | Max deneme sayısı (default: 3) |
| `lastError` | TEXT | Son hata mesajı |
| `createdAt` | TIMESTAMPTZ | Oluşturma zamanı |
| `updatedAt` | TIMESTAMPTZ | Güncelleme zamanı |

---

## API Endpoints

### REST API (`:3018/api/v1/waybills`)

| Method | Endpoint | Açıklama |
|--------|----------|---------|
| `POST` | `/waybills` | Yeni irsaliye oluştur |
| `GET` | `/waybills` | İrsaliyeler listele (filtre: type, status, refId, limit, offset) |
| `GET` | `/waybills/:id` | İrsaliye detayı |
| `PATCH` | `/waybills/:id` | Taslak irsaliyeyi güncelle |
| `POST` | `/waybills/:id/approve` | TASLAK → ONAYLANDI (onay akışı) |
| `POST` | `/waybills/:id/send-gib` | GİB kuyruğuna al (ONAYLANDI → GIB_KUYRUKTA) |
| `POST` | `/waybills/:id/cancel` | İrsaliyeyi iptal et |
| `GET` | `/waybills/:id/pdf` | PDF indir |
| `GET` | `/waybills/:id/xml` | UBL-TR XML indir |

**Otentikasyon:** Bearer Token (JWT)
**Response format:** JSON (snake_case DB sütunları → camelCase DTO)

---

## RabbitMQ Events

### Dinlenen Routing Key'ler

**Exchange:** `enkap` (topic type)
**Queue:** `waybill.events` (DLQ: `waybill.events.dlq`)

| Routing Key | Kaynak | Payload | Işlem |
|-------------|--------|---------|--------|
| `waybill.satis.created` | order-service | DeliveryCreatedPayload | SATIS irsaliyesi otomatik oluştur |
| `waybill.alis.created` | purchase-service | GoodsReceiptCreatedPayload | ALIS irsaliyesi otomatik oluştur |
| `waybill.transfer.created` | stock-service | StockTransferCreatedPayload | TRANSFER irsaliyesi otomatik oluştur |
| `waybill.iade.created` | order/purchase-service | ReturnCreatedPayload | IADE irsaliyesi otomatik oluştur |

**Consumer:** `WaybillEventsConsumer` (OnModuleInit'te bağlanır)

```typescript
// Örnek payload
interface DeliveryCreatedPayload {
  tenantId: string;
  deliveryId: string;
  deliveryNumber: string;
  salesOrderId: string;
  soNumber: string;
  shipDate: string;         // ISO date: '2026-04-03'
  customerName: string;
  customerVknTckn?: string;
  customerAddress?: string;
  carrierName?: string;
  trackingNumber?: string;
  vehiclePlate?: string;
  driverName?: string;
  driverTckn?: string;
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

---

## Iş Akışları (Flows)

### 1. Satış Siparişinden Sevkiyat → İrsaliye

```
order-service: Delivery COMPLETED
       ↓ (RabbitMQ waybill.satis.created)
waybill-service: Waybill oluştur (TASLAK)
       ↓ (Otomatik, sistem tarafından)
İrsaliye listesinde görün
       ↓ (Kullanıcı onay)
POST /waybills/:id/approve → ONAYLANDI
       ↓ (Kullanıcı GİB gönderimi)
POST /waybills/:id/send-gib → GIB_KUYRUKTA
       ↓ (app.module.ts cron 30sn)
OutboxService.processPending()
       ├─ XML builder → UBL-TR 2.1
       ├─ GİB API → MTOM SOAP
       └─ GIB_GONDERILDI
       ↓ (Polling cron)
GibService.pollStatus()
       ├─ GİB başarılı → GIB_ONAYLANDI
       └─ GİB reddetti → GIB_REDDEDILDI (düzeltme)
```

### 2. GİB Outbox Processing (30 saniye Cron)

**app.module.ts — OnApplicationBootstrap():**

```typescript
setInterval(async () => {
  const tenantIds = await this.tenantRouting.findAllActiveIds();
  await Promise.all(
    tenantIds.map(tid =>
      this.outboxService.processPending(tid).catch(err =>
        logger.warn(`Outbox hata tenant=${tid}: ${err.message}`)
      )
    )
  );
}, 30_000); // 30 saniye
```

**OutboxService.processPending(tenantId):**

1. `gib_outbox` WHERE `status='PENDING'` → max 20 kayıt al
2. Her kayıt için:
   - Status → `PROCESSING`
   - Action kontrolü:
     - `SEND` → `waybillXmlService.generate()` → `gibService.sendToGib()` → status `SENT`
     - `POLL` → `gibService.pollStatus()` → GİB durum güncelle
     - `CANCEL` → `gibService.cancelAtGib()` → status `SENT`
   - Hata → attemptCount ↑, maxAttempts aşarsa → `FAILED`

---

## Servis Sınıfları

### `WaybillService` (waybill.service.ts)

**Sorumluluk:** İrsaliye CRUD işlemleri, tenant context via getTenantContext()

| Metod | Parametre | Dönen | Açıklama |
|-------|-----------|-------|---------|
| `create()` | dto, createdBy | Waybill | Yeni irsaliye oluştur (TASLAK) |
| `findAll()` | filter object | Waybill[] | İrsaliyeler listele (type, status, refId filtre) |
| `findOne()` | id | Waybill | İrsaliye detayı + lines |
| `update()` | id, dto | Waybill | Taslak irsaliyeyi güncelle |
| `approve()` | id | Waybill | TASLAK → ONAYLANDI |
| `queueForGib()` | id | Waybill | GibOutbox kayıt oluştur (ONAYLANDI → GIB_KUYRUKTA) |
| `cancel()` | id, reason | Waybill | İrsaliye iptal et |

**Kritik kurallar:**
- Sadece TASLAK durumundaki irsaliyeler güncellenebilir
- Onay için irsaliye TASLAK olmalı
- GİB gönderimi için irsaliye ONAYLANDI olmalı
- TRANSFER türünde her kalem için `targetWarehouseId` zorunlu

### `WaybillXmlService` (waybill-xml.service.ts)

**Sorumluluk:** UBL-TR 2.1 XML builder

| Metod | Parametre | Dönen | Açıklama |
|-------|-----------|-------|---------|
| `generate()` | waybill | string (XML) | Waybill → UBL-TR DespatchAdvice XML |

**XML Format:**
- Standard: UBL-TR 2.1
- Element sırasını takip et (UBL strict ordering)
- QR kod zorunlu (sağ üst köşe, 90×90pt PDF'de)

### `WaybillGibService` (waybill-gib.service.ts)

**Sorumluluk:** GİB API iletişimi (MTOM SOAP)

| Metod | Parametre | Dönen | Açıklama |
|-------|-----------|-------|---------|
| `sendToGib()` | waybill, signedXml | { gibEnvelopeId, statusCode } | XML → MTOM SOAP → GİB |
| `pollStatus()` | waybillId | { statusCode, statusDesc } | getApplicationResponse polling |
| `cancelAtGib()` | waybillId | { statusCode } | GİB'te iptal et |

**GİB Durum Kodları:**
- `1300` = SUCCESS (GİB_ONAYLANDI)
- `1220` = PROCESSING (GIB_GONDERILDI)
- `1140`, `1150`, `1160` = ERROR (GIB_REDDEDILDI)

### `WaybillPdfService` (waybill-pdf.service.ts)

**Sorumluluk:** PDF oluşturma

| Metod | Parametre | Dönen | Açıklama |
|-------|-----------|-------|---------|
| `generate()` | waybill | Buffer (PDF) | İrsaliye PDF oluştur |

**Bağımlılık:** `@enkap/reporting` (`WaybillTemplate`)

### `OutboxService` (outbox.service.ts)

**Sorumluluk:** Asenkron GİB gönderimi işleme (30sn cron)

| Metod | Parametre | Dönen | Açıklama |
|-------|-----------|-------|---------|
| `processPending()` | tenantId | void | Bekleyen outbox kayıtlarını işle |

**Hata stratejisi:**
- Max 3 deneme (configurable via outbox record)
- Deneme başarısız → attemptCount ↑
- 3 deneme sonrası → status `FAILED`

### `WaybillEventsConsumer` (waybill-events.consumer.ts)

**Sorumluluk:** RabbitMQ event consume

| Metod | Event | Açıklama |
|-------|-------|---------|
| `onModuleInit()` | - | RabbitMQ bağlantı, queue/binding oluştur |
| `onModuleDestroy()` | - | Bağlantı kapat |
| `onDeliveryCreated()` | waybill.satis.created | SATIS irsaliyesi oluştur |
| `onGoodsReceiptCreated()` | waybill.alis.created | ALIS irsaliyesi oluştur |
| `onTransferCreated()` | waybill.transfer.created | TRANSFER irsaliyesi oluştur |
| `onReturnCreated()` | waybill.iade.created | IADE irsaliyesi oluştur |

**Tenant Context:** RabbitMQ consumer'da getTenantContext() yok — TenantDataSourceManager direkt kullanılır

---

## Kritik Kurallar

### 1. Tenant İzolasyonu
- Her query `tenantId` filtresi yapmalı
- `getTenantContext()` ile tenant alınır (AsyncLocalStorage)
- Cross-tenant yazma → `CrossTenantWriteError` fırlatılır

### 2. İrsaliye Numaralandırması
- Format: `IRS-{YYYY}-{NNNN}`
- PostgreSQL sequence: `irs_wb_seq_{year}`
- Race-free: sequence `nextval()` atomik
- `CREATE SEQUENCE IF NOT EXISTS` — failsafe

### 3. GİB İntegrasyonu
- **Protocol:** SOAP 1.2 + MTOM
- **İmzalama:** tenant'ın mali mühürü (signType=TENANT)
- **Polling:** 5 saatte bir (configurable)
- **8-gün kuralı:** Kabul/Red zamanı dönem sonu + 8 gün (TICARIFATURA için)

### 4. PDF Oluşturma
- **Font:** DejaVu (Docker image'da zorunlu)
- **Para sembolü:** `₺` sembolü DejaVu'da yok → "123,45 TL" formatı
- **QR kod:** Sağ üst köşe 90×90pt, GİB JSON formatı

### 5. Event Tüketimi
- **Güvenilirlik:** RabbitMQ message ack sadece işlem başarılı sonrasında
- **Hata:** NACK → dead-letter-queue (DLQ)
- **Prefetch:** 1 (sequential processing, fair dispatch)

### 6. Validasyon
- Yeni irsaliye: en az 1 kalem zorunlu
- TRANSFER: her kalem için `targetWarehouseId` zorunlu
- IADE: `returnDirection` zorunlu (MUSTERIDEN veya TEDARIKCIYE)

---

## Başlama Rehberi

### Geliştirmede Çalıştırma

```bash
# Sadece waybill-service
pnpm --filter waybill-service dev

# Docker'da tüm servisler
docker compose up -d
# waybill-service otomatik :3018'de başlar
```

### Ortam Değişkenleri

```bash
# Temel
PORT=3018
DATABASE_URL=postgresql://enkap_admin:localdev_only@localhost:5432/enkap_tenant_<tenant_id>
CONTROL_PLANE_DATABASE_URL=postgresql://enkap_admin:localdev_only@localhost:5432/enkap_control_plane

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# GİB (boşsa mock)
GIB_API_URL=https://earsivportaltest.efatura.gov.tr/...
GIB_SIGNER_ENDPOINT=http://localhost:9999/signer  # Java signing service

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

### Swagger Docs

```
http://localhost:3018/api/docs
```

---

## Debugging

### Outbox İşleme Logları

```bash
docker logs enkap_waybill --tail 100 | grep -i "outbox\|gib"
```

### RabbitMQ Events

```bash
# RabbitMQ Management UI
http://localhost:15672
# Username: guest, Password: guest
```

### Database Query'leri

```sql
-- Son irsaliyeler
SELECT id, waybill_number, type, status, created_at
FROM waybills
WHERE tenant_id = '...'
ORDER BY created_at DESC LIMIT 10;

-- Bekleyen outbox kayıtları
SELECT * FROM gib_outbox
WHERE status IN ('PENDING', 'PROCESSING')
ORDER BY created_at ASC;

-- GİB yanıtları
SELECT id, waybill_id, gib_status_code, gib_status_desc, gib_response_at
FROM waybills
WHERE gib_uuid IS NOT NULL
ORDER BY gib_response_at DESC LIMIT 20;
```

---

## Notlar

- **Outbox Pattern:** Asenkron GİB gönderimi için reliability
- **Event-Driven:** order/purchase/stock servislerinde değişiklik → İrsaliye otomatik oluşturma
- **Idempotency:** İrsaliye numaralandırması race-free (PostgreSQL sequence)
- **PDF QR Kodu:** Zorunlu (GİB standardı), müşteri tarafından okuması mümkün

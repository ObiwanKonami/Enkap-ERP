# Notification Service — Developer Guide

## Overview

**Service Name:** `notification-service`
**Port:** `:3019`
**Framework:** NestJS 10 + Fastify
**Primary Responsibility:** Bildirim yönetimi — oluşturma, listeleme, okundu işaretleme ve silme

Notification Service, Enkap'ta tüm tenant bildirimlerini merkezi olarak yönetir. Diğer servislerden RabbitMQ olayları alır, bunları okunmamış bildirimler olarak kaydeder ve tenant kullanıcılarının web/mobil arayüzde görünmesini sağlar.

---

## Mimarisi

### Katmanlı Yapı

```
┌─ NotificationController ─────────────────────────────┐
│ Endpoint'ler: GET, PATCH, DELETE                    │
│ TenantGuard → TenantContext → Service               │
└──────────────────────────────────────────────────────┘
         ↓
┌─ NotificationService ────────────────────────────────┐
│ create() — RabbitMQ consumer'dan çağrılır           │
│ findAll() — Listeleme, okunmamış filtesi             │
│ markRead() — Tek bildirimi okundu işaretle          │
│ markAllRead() — Tüm bildirimleri işaretle           │
│ remove() — Bildirimi sil                            │
│ purgeOldRead() — 30 günden eski bildirimleri temizle│
└──────────────────────────────────────────────────────┘
         ↓
┌─ TenantDataSourceManager ────────────────────────────┐
│ getDataSource(tenantId) → Tenant şemasına bağlanır  │
└──────────────────────────────────────────────────────┘
         ↓
┌─ PostgreSQL (tenant şeması) ─────────────────────────┐
│ notifications tablosu                               │
│ Index: (tenant_id, is_read, created_at)             │
└──────────────────────────────────────────────────────┘
```

### RabbitMQ Consumer

```
┌─ NotificationConsumer (OnModuleInit/OnModuleDestroy) ┐
│ Exchange: 'enkap' (topic)                           │
│ Queue: 'notification.events'                        │
│ DLQ: 'notification.events.dlq'                      │
└─────────────────────────────────────────────────────┘
         ↓
┌─ Binding Keys ──────────────────────────────────────┐
│ invoice.approved                                   │
│ invoice.gib.*       (approved + rejected)          │
│ stock.below_reorder                                │
│ leave.request.created                              │
│ purchase.order.approved                            │
│ waybill.#           (satis + alis + transfer + iade)│
└─────────────────────────────────────────────────────┘
         ↓
┌─ handleMessage() ───────────────────────────────────┐
│ Routing key'e göre event handler'ı çağır            │
│ onInvoiceApproved()                                 │
│ onInvoiceGib()                                      │
│ onStockBelowReorder()                               │
│ onLeaveRequestCreated()                             │
│ onPurchaseOrderApproved()                           │
│ onWaybillCreated()                                  │
└─────────────────────────────────────────────────────┘
```

---

## Entity: Notification

```typescript
@Entity('notifications')
@Index(['tenantId', 'isRead', 'createdAt'])
class Notification {
  id: UUID;                    // PK
  tenantId: UUID;              // Tenant izolasyonu
  category: NotifCategory;     // 'finans' | 'stok' | 'ik' | 'sistem'
  level: NotifLevel;           // 'error' | 'warning' | 'info' | 'success'
  title: VARCHAR(200);         // "Fatura Onaylandı"
  body: VARCHAR(500);          // Bildirim metni
  href?: VARCHAR(200);         // Frontend yönlendirme URL'si (opsiyonel)
  sourceType?: VARCHAR(50);    // 'invoice' | 'product' | 'leave_request' | ...
  sourceId?: VARCHAR(100);     // Kaynak kaydın UUID/ID'si
  isRead: BOOLEAN = false;     // Okundu mı?
  readAt?: TIMESTAMPTZ;        // Okundu zamanı
  createdAt: TIMESTAMPTZ;      // Bildirim oluşturulma zamanı
}
```

### Kategori & Seviye Kuralları

| Kategori | Açıklama | Seviyeler |
|----------|----------|-----------|
| `finans` | Fatura, ödeme, AR/AP olayları | error, warning, info, success |
| `stok` | Ürün, depo, irsaliye, lojistik | warning, info |
| `ik` | İzin, bordro, HR olayları | info, warning |
| `sistem` | Yedekleme, sistem durumu | warning, error, info |

| Seviye | Renk | Anlamı |
|--------|------|--------|
| `error` | Kırmızı | Hata, vadesi geçmiş, GİB reddi |
| `warning` | Sarı | Uyarı, kritik stok, yaklaşan tarih |
| `info` | Mavi | Bilgi, tamamlanan işlem |
| `success` | Yeşil | Başarı, onay |

---

## API Endpoint'leri

### GET /api/v1/notifications

Tenant'a ait bildirimleri listele.

**Query Parameters:**
```
limit?:      number    (default: 50, max: 100)
offset?:     number    (default: 0)
unreadOnly?: boolean   (default: false)
```

**Response:**
```typescript
{
  items: Notification[],   // Sayfalanmış bildirimler
  total: number,           // Filtre sonrası toplam
  unread: number           // Tenant'ın okunmamış bildirimleri (filtreli değil)
}
```

**Örnek:**
```bash
curl -H "Authorization: Bearer $JWT" \
  "http://localhost:3019/api/v1/notifications?limit=20&offset=0&unreadOnly=true"
```

---

### PATCH /api/v1/notifications/:id/read

Tek bildirimi okundu işaretle.

**Parameters:**
```
id: UUID (path)
```

**Response:**
```typescript
Notification  // Güncellenmiş bildirim (isRead=true, readAt=now)
```

---

### PATCH /api/v1/notifications/read-all

Tenant'ın tüm okunmamış bildirimlerini okundu işaretle.

**Response:**
```typescript
{ updated: number }  // Etkilenen bildirim sayısı
```

---

### DELETE /api/v1/notifications/:id

Bildirimi sil (soft delete değil — hard delete).

**Parameters:**
```
id: UUID (path)
```

**Response:** HTTP 204 (No Content)

---

## RabbitMQ Event'leri

### Event Payload'ları ve Handler'ları

#### 1. `invoice.approved`

**Routing Key:** `invoice.approved`
**Kaynak:** financial-service (fatura onayı)
**Kategori:** finans | **Seviye:** info

**Payload:**
```typescript
interface InvoiceApprovedPayload {
  tenantId:      string;      // UUID
  invoiceId:     string;      // UUID
  invoiceNumber: string;      // "FA-2026-0001"
  customerName:  string;      // "ABC İnşaat Ltd."
  totalAmount?:  number;      // Kuruş (123456 = 1234.56 TL)
}
```

**Handler:** `onInvoiceApproved()`

```typescript
// Oluşturulan bildirim
{
  category: 'finans',
  level: 'info',
  title: 'Fatura Onaylandı',
  body: 'FA-2026-0001 — ABC İnşaat Ltd. faturası onaylandı.',
  href: '/faturalar',
  sourceType: 'invoice',
  sourceId: invoiceId,
}
```

---

#### 2. `invoice.gib.approved` / `invoice.gib.rejected`

**Routing Key:** `invoice.gib.approved` | `invoice.gib.rejected`
**Kaynak:** financial-service (GİB API yanıtı)
**Kategori:** finans | **Seviye:** success (approved) / error (rejected)

**Payload:**
```typescript
interface InvoiceGibPayload {
  tenantId:      string;      // UUID
  invoiceId:     string;      // UUID
  invoiceNumber: string;      // "FA-2026-0001"
  status:        'GIB_ONAYLANDI' | 'GIB_REDDEDILDI';
  errorMessage?: string;      // GİB hata mesajı (varsa)
}
```

**Handler:** `onInvoiceGib()`

```typescript
// GİB onayı → success
{
  category: 'finans',
  level: 'success',
  title: 'e-Fatura GİB Onayı',
  body: 'FA-2026-0001 nolu fatura GİB tarafından onaylandı.',
  href: '/faturalar',
  sourceType: 'invoice',
  sourceId: invoiceId,
}

// GİB reddi → error
{
  category: 'finans',
  level: 'error',
  title: 'e-Fatura GİB Reddedildi',
  body: 'FA-2026-0001 nolu fatura GİB tarafından reddedildi. Neden: Uyumsuz vergi oranı',
  href: '/faturalar',
  sourceType: 'invoice',
  sourceId: invoiceId,
}
```

---

#### 3. `stock.below_reorder`

**Routing Key:** `stock.below_reorder`
**Kaynak:** stock-service (kritik stok uyarısı)
**Kategori:** stok | **Seviye:** warning

**Payload:**
```typescript
interface StockBelowReorderPayload {
  tenantId:       string;      // UUID
  productId:      string;      // UUID
  productName:    string;      // "Çelik Profil 40x40"
  sku?:           string;      // "CP-40X40"
  currentStock:   number;      // 5 (adet/ölçü birimi)
  reorderPoint:   number;      // 50
  warehouseName?: string;      // "Ankara Depo" (opsiyonel)
}
```

**Handler:** `onStockBelowReorder()`

```typescript
{
  category: 'stok',
  level: 'warning',
  title: 'Kritik Stok Uyarısı',
  body: 'Çelik Profil 40x40 (CP-40X40) — Mevcut: 5, Yeniden sipariş noktası: 50 (Ankara Depo).',
  href: '/stok',
  sourceType: 'product',
  sourceId: productId,
}
```

---

#### 4. `leave.request.created`

**Routing Key:** `leave.request.created`
**Kaynak:** hr-service (yeni izin talebi)
**Kategori:** ik | **Seviye:** info

**Payload:**
```typescript
interface LeaveRequestPayload {
  tenantId:     string;  // UUID
  requestId:    string;  // UUID
  employeeName: string;  // "Ahmet Yıldız"
  leaveType:    string;  // "Yıllık İzin" | "Hastalık İzni"
  startDate:    string;  // "2026-04-15"
  endDate:      string;  // "2026-04-22"
  dayCount:     number;  // 8
}
```

**Handler:** `onLeaveRequestCreated()`

```typescript
{
  category: 'ik',
  level: 'info',
  title: 'Yeni İzin Talebi',
  body: 'Ahmet Yıldız — 8 günlük Yıllık İzin talebi onay bekliyor. (2026-04-15 – 2026-04-22)',
  href: '/izin',
  sourceType: 'leave_request',
  sourceId: requestId,
}
```

---

#### 5. `purchase.order.approved`

**Routing Key:** `purchase.order.approved`
**Kaynak:** purchase-service (satın alma siparişi onayı)
**Kategori:** finans | **Seviye:** info

**Payload:**
```typescript
interface PurchaseOrderApprovedPayload {
  tenantId:    string;  // UUID
  orderId:     string;  // UUID
  orderNumber: string;  // "SA-2026-0042"
  vendorName:  string;  // "XYZ Ticaret A.Ş."
  totalAmount: number;  // Kuruş
}
```

**Handler:** `onPurchaseOrderApproved()`

```typescript
{
  category: 'finans',
  level: 'info',
  title: 'Satın Alma Siparişi Onaylandı',
  body: 'SA-2026-0042 — XYZ Ticaret A.Ş. siparişi onaylandı.',
  href: '/satin-alma',
  sourceType: 'purchase_order',
  sourceId: orderId,
}
```

---

#### 6. `waybill.satis.created` / `waybill.alis.created` / `waybill.transfer.created` / `waybill.iade.created`

**Routing Keys:** `waybill.satis.created` | `waybill.alis.created` | `waybill.transfer.created` | `waybill.iade.created`
**Kaynak:** order-service, purchase-service, stock-service
**Kategori:** stok | **Seviye:** info (satis/alis/transfer) / warning (iade)

**Payload:**
```typescript
interface WaybillCreatedPayload {
  tenantId:       string;                              // UUID
  waybillId:      string;                              // UUID
  waybillNumber:  string;                              // "IRS-2026-0154"
  type:           'SATIS' | 'ALIS' | 'TRANSFER' | 'IADE';
  partyName?:     string;                              // "ABC İnşaat Ltd." (opsiyonel)
}
```

**Handler:** `onWaybillCreated()`

```typescript
// Satış irsaliyesi
{
  category: 'stok',
  level: 'info',
  title: 'Satış irsaliyesi oluşturuldu',
  body: 'IRS-2026-0154 — ABC İnşaat Ltd. irsaliyesi taslak olarak oluşturuldu.',
  href: '/irsaliyeler',
  sourceType: 'waybill',
  sourceId: waybillId,
}

// İade irsaliyesi → warning
{
  category: 'stok',
  level: 'warning',
  title: 'İade irsaliyesi oluşturuldu',
  body: 'IRS-2026-0155 — İade irsaliyesi taslak olarak oluşturuldu.',
  href: '/irsaliyeler',
  sourceType: 'waybill',
  sourceId: waybillId,
}
```

---

## Servis Metodları

### NotificationService

#### `create(input: CreateNotificationInput): Promise<Notification>`

**Amaç:** Yeni bildirim oluştur (RabbitMQ consumer veya HTTP POST'tan)

**Parametreler:**
```typescript
interface CreateNotificationInput {
  tenantId:    string;             // Zorunlu
  category:    NotifCategory;      // Zorunlu
  level:       NotifLevel;         // Zorunlu
  title:       string;             // Zorunlu (maks 200 karakter)
  body:        string;             // Zorunlu (maks 500 karakter)
  href?:       string;             // Opsiyonel (maks 200 karakter)
  sourceType?: string;             // Opsiyonel (maks 50 karakter)
  sourceId?:   string;             // Opsiyonel (maks 100 karakter)
}
```

**İş Mantığı:**
1. `TenantDataSourceManager.getDataSource(tenantId)` ile tenant şemasına bağlan
2. `Notification` entity'sini oluştur (default: `isRead = false`)
3. Veritabanına kaydet
4. Debug log yaz: `[{tenantId}] Bildirim oluşturuldu: {id} ({level})`
5. Kaydedilmiş notification'ı döndür

**Örnek (RabbitMQ consumer'dan):**
```typescript
await this.notifService.create({
  tenantId: 'tenant-uuid',
  category: 'finans',
  level: 'success',
  title: 'e-Fatura GİB Onayı',
  body: 'FA-2026-0001 nolu fatura GİB tarafından onaylandı.',
  href: '/faturalar',
  sourceType: 'invoice',
  sourceId: 'invoice-uuid',
});
```

---

#### `findAll(tenantId: string, query: ListNotificationsQuery): Promise<{ items, total, unread }>`

**Amaç:** Tenant bildirimlerini listele (sayfalanmış, opsiyonel filtre)

**Parametreler:**
```typescript
interface ListNotificationsQuery {
  limit?:      number;   // Maks 100 (default: 50)
  offset?:     number;   // Sayfalama offset (default: 0)
  unreadOnly?: boolean;  // Sadece okunmamış (default: false)
}
```

**Response:**
```typescript
{
  items: Notification[];      // limit+offset uygulanmış
  total: number;              // Filtre sonrası toplam
  unread: number;             // Tenant'ın tüm okunmamış (filtreden bağımsız)
}
```

**İş Mantığı:**
1. Tenant şemasına bağlan
2. Query builder: `WHERE tenant_id = :tenantId` + ORDER BY `created_at DESC`
3. Eğer `unreadOnly = true` ise: `AND is_read = false` ekle
4. `skip(offset).take(limit).getManyAndCount()` çalıştır
5. Ayrı query: okunmamış toplam sayısını al (filter yok)
6. Sonuç döndür

**Örnek:**
```typescript
const result = await this.notifService.findAll('tenant-uuid', {
  limit: 20,
  offset: 0,
  unreadOnly: true,
});
// { items: [Notif1, Notif2, ...], total: 15, unread: 15 }
```

---

#### `markRead(tenantId: string, id: string): Promise<Notification>`

**Amaç:** Tek bildirimi okundu işaretle

**İş Mantığı:**
1. Tenant şemasında `WHERE id = :id AND tenant_id = :tenantId` ile bul
2. Bulunamazsa: `NotFoundException` fırla
3. `isRead = true`, `readAt = new Date()` ata
4. Kaydet ve döndür

**Örnek:**
```typescript
await this.notifService.markRead('tenant-uuid', 'notification-uuid');
// { ...notification, isRead: true, readAt: 2026-04-03T14:30:00Z }
```

---

#### `markAllRead(tenantId: string): Promise<{ updated: number }>`

**Amaç:** Tenant'ın tüm okunmamış bildirimlerini okundu işaretle

**İş Mantığı:**
1. UPDATE query: `SET is_read = true, read_at = NOW()` WHERE `tenant_id = :tenantId AND is_read = false`
2. `result.affected` (etkilenen satır sayısı) döndür

**Örnek:**
```typescript
const { updated } = await this.notifService.markAllRead('tenant-uuid');
// { updated: 23 }
```

---

#### `remove(tenantId: string, id: string): Promise<void>`

**Amaç:** Bildirimi hard delete et

**İş Mantığı:**
1. Tenant şemasında `WHERE id = :id AND tenant_id = :tenantId` ile bul
2. Bulunamazsa: `NotFoundException` fırla
3. Delete çalıştır (hard delete — soft delete değil)

**Örnek:**
```typescript
await this.notifService.remove('tenant-uuid', 'notification-uuid');
```

---

#### `purgeOldRead(tenantId: string): Promise<number>`

**Amaç:** 30 günden eski okunmuş bildirimleri temizle (cron job için)

**İş Mantığı:**
1. `cutoff = now - 30 days` hesapla
2. DELETE: `WHERE tenant_id = :tenantId AND is_read = true AND created_at < :cutoff`
3. `result.affected` (silinen satır sayısı) döndür

**Örnek (Cron job'ta):**
```typescript
// Her gün 02:00 UTC
const deleted = await this.notifService.purgeOldRead('tenant-uuid');
this.logger.log(`[${tenantId}] ${deleted} eski bildirim silindi`);
```

---

## Önemli Kurallar

### 1. Tenant İzolasyonu

- **Zorunlu:** Her bildirim `tenantId` ile kaydedilir
- **TenantContext:** Controller endpoint'leri `getTenantContext()` ile tenant'ı alır
- **RabbitMQ Consumer:** Event payload'ında gelen `tenantId` doğrudan kullanılır — middleware'de context yok
- **Validasyon:** `markRead()`, `remove()` çağrılarında `WHERE tenant_id = :tenantId AND id = :id` koşulu zorunlu

### 2. Database Bağlantı Kuralı

```typescript
// ✅ Doğru
const ds = await this.dsManager.getDataSource(tenantId);
const repo = ds.getRepository(Notification);

// ❌ Yanlış — default DataSource'u kullanmak
@InjectRepository(Notification) repo: Repository<Notification>
```

### 3. RabbitMQ Consumer Kurucusu

- **OnModuleInit:** Connection + Channel + Exchange + Queue + Binding
- **OnModuleDestroy:** Graceful close (try-catch ile hata engellenir)
- **Error Handling:** Başarısız consumer başlatması warning log'unur — servis yine de başlar (fatal değil)
- **Prefetch:** 5 mesaj — yüksek basında ölçeklenebilir
- **DLQ:** Başarısız mesajlar `notification.events.dlq`'ya gider
- **TTL:** Kuyruk mesajı 5 dakika sonra otomatik siler
- **Ack/Nack:** Başarı `ack()`, hata `nack(false, false)` — requeue yok

### 4. Event Payload Validasyonu

- **JSON parse:** `msg.content.toString()` → `JSON.parse()`
- **Typing:** `payload as unknown as EventPayloadType` (duck typing — strict instanceof yerine)
- **Unknown key:** Debug log'unur, atlanır — crashing yok

### 5. Okunmamış Sayısı (`unread`)

- **Her zaman toplam:** `findAll()` çağrısında `unreadOnly` filtrelemesi uygulanmış olsa da, `unread` sayısı **her zaman** tenant'ın gerçek okunmamış toplam sayısıdır
- **Amaç:** Frontend "okunmamış 42" badge'ini güncelleyebilir

### 6. Logging

- **Create:** `this.logger.debug('[{tenantId}] Bildirim oluşturuldu: {id} ({level})')`
- **RabbitMQ başlama:** `this.logger.log('RabbitMQ consumer başlatıldı: queue={queue} keys={keys}')`
- **RabbitMQ hatası:** `this.logger.warn('RabbitMQ consumer başlatılamadı: {error}')`
- **Consumer message:** `this.logger.debug('Mesaj: {routingKey}')`
- **Consumer hata:** `this.logger.error('Mesaj işleme hatası: {error}', stack)`

### 7. Hata Yönetimi

| Durum | Hata | HTTP Status |
|-------|------|-------------|
| Bildirim bulunamadı | `NotFoundException` | 404 |
| Geçersiz UUID | `BadRequestException` (via `ParseUUIDPipe`) | 400 |
| RabbitMQ timeout | Logger warning → servis başlarken hata olmaz | — |
| Consumer message hatası | Logger error → DLQ'ya gider (requeue yok) | — |

---

## Veritabanı Schema

### `notifications` Tablosu

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  category VARCHAR(10) NOT NULL CHECK (category IN ('finans', 'stok', 'ik', 'sistem')),
  level VARCHAR(10) NOT NULL CHECK (level IN ('error', 'warning', 'info', 'success')),
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) NOT NULL,
  href VARCHAR(200),
  source_type VARCHAR(50),
  source_id VARCHAR(100),
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  INDEX idx_notifications_tenant_read_created (tenant_id, is_read, created_at)
);
```

**Neden bu index?**
- `findAll()` sorgularında `tenant_id + is_read + ORDER BY created_at`
- Okunmamış filtresi hızlı
- Sayfalama performansı

---

## Ortam Değişkenleri

| Değişken | Zorunlu | Default | Açıklama |
|----------|---------|---------|---------|
| `DATABASE_URL` | Evet | — | Tenant şeması bağlantısı |
| `CONTROL_PLANE_DATABASE_URL` | Hayır | `DATABASE_URL` | Control plane (kullanılmıyor) |
| `RABBITMQ_URL` | Hayır | `amqp://localhost:5672` | RabbitMQ bağlantı URL'si |
| `PORT` | Hayır | `3019` | Servis port'u |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Hayır | — | OpenTelemetry (boşsa devre dışı) |

---

## Genişletme Noktaları

### Yeni Event Handler'ı Ekleme

1. **Event payload tipini tanımla:**
   ```typescript
   interface NewEventPayload {
     tenantId: string;
     // ... fields
   }
   ```

2. **Binding key ekle:**
   ```typescript
   const bindingKeys = [
     // ...
     'new.event.key',
   ];
   ```

3. **handleMessage()'ye koşul ekle:**
   ```typescript
   } else if (key === 'new.event.key') {
     await this.onNewEvent(payload as unknown as NewEventPayload);
   }
   ```

4. **Handler metodu oluştur:**
   ```typescript
   private async onNewEvent(p: NewEventPayload): Promise<void> {
     await this.notifService.create({
       tenantId: p.tenantId,
       category: 'kategori',
       level: 'level',
       title: 'Başlık',
       body: 'İçerik',
       href: '/sayfa',
       sourceType: 'tür',
       sourceId: p.id,
     });
   }
   ```

### Push Notification Desteği (Gelecek)

Şu anda only in-app notifications. Push için:
1. `Firebase Cloud Messaging` token ekle (mobile'dan)
2. `NotificationService.create()` sonrası FCM gönder
3. Existing notification record'u koru (audit trail)

---

## Testing

### Unit Test Örneği

```typescript
describe('NotificationService', () => {
  it('should create notification', async () => {
    const input = {
      tenantId: 'tenant-1',
      category: 'finans' as NotifCategory,
      level: 'info' as NotifLevel,
      title: 'Test',
      body: 'Test body',
    };

    const result = await service.create(input);

    expect(result.id).toBeDefined();
    expect(result.tenantId).toBe('tenant-1');
    expect(result.isRead).toBe(false);
  });
});
```

### Integration Test Örneği

```typescript
describe('NotificationController', () => {
  it('should list notifications', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${jwtToken}`)
      .query({ limit: 10, offset: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.unread).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Deployment Notları

### Kubernetes

```yaml
# Notification Service Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: notification-service
        image: enkap/notification-service:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: RABBITMQ_URL
          valueFrom:
            secretKeyRef:
              name: rabbitmq-credentials
              key: url
        livenessProbe:
          httpGet:
            path: /health
            port: 3019
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3019
          initialDelaySeconds: 5
          periodSeconds: 5
```

### RabbitMQ Queue Yönetimi

```bash
# RabbitMQ UI: http://localhost:15672
# Default: guest/guest

# CLI ile queue durumunu kontrol et
rabbitmqctl list_queues name messages consumers
rabbitmqctl purge_queue notification.events
rabbitmqctl purge_queue notification.events.dlq
```

---

## Troubleshooting

| Problem | Çözüm |
|---------|-------|
| RabbitMQ consumer başlamıyor | Logs'u kontrol et: `docker logs {container}`. RABBITMQ_URL doğru mu? |
| Bildirimler oluşturulmuyor | Consumer'a binding yapılan key'leri kontrol et. Event payload JSON'ı doğru mu? |
| Okunmamış sayısı yanlış | `findAll(unreadOnly: false)` ile tüm bildirimleri sorgula ve `isRead` durumunu kontrol et. |
| Old notifications temizlenmiyor | `purgeOldRead()` cron job'ı çalışıyor mu? Migration'da `notifications` tablosu var mı? |
| Tenant izolasyonu ihlal | Controller'lar `getTenantContext()` kullanıyor mu? RabbitMQ event'lerinde `tenantId` doğru mu? |

---

## Bakım Görevleri

### Günlük
- Logs'u kontrol et: `docker logs notification-service --tail 100`
- RabbitMQ DLQ: `rabbitmqctl list_queues name messages` — yoğunlaşma işareti mi?

### Haftalık
- `purgeOldRead()` cron'u çalışıyor mu? (30 gün + older bildirimler silinmeliydi)
- Okunmamış bildirim yığını: max 10K per tenant mi? (performance için)

### Aylık
- Notifications tablosu boyutu: `SELECT pg_size_pretty(pg_total_relation_size('notifications'));`
- Index fragmentation: `REINDEX TABLE notifications;` (gerekirse)
- RabbitMQ bağlantı sayısı: `rabbitmqctl list_connections` — limit aşılmış mı?

---

## Kontrol Listesi — Yeni Özellik Ekleme

- [ ] Event payload tipi tanımlandı
- [ ] RabbitMQ binding key eklendi
- [ ] handleMessage() dispatcher güncellenildi
- [ ] Handler metodu yazıldı
- [ ] NotifCategory ve NotifLevel doğru seçildi
- [ ] Href (frontend URL) doğru sayfa'yı işaret ediyor
- [ ] Test case'ler yazıldı
- [ ] Notification entity sütunları yeterli (title/body max uzunluk)
- [ ] Logging eklendi
- [ ] CLAUDE.md güncellenildi (bu dosya)

---

**Son Güncelleme:** 2026-04-03
**Sorumlu:** Backend Team

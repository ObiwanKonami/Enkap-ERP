# Webhook Hub — Türkçe Geliştirme Rehberi

Webhook Hub (:3006), **Outbox Pattern** üzerinde kurulu, distributed webhook teslimat sistemidir. Tüm ERP servisleri bu hub aracılığıyla müşteri webhook'larına güvenilir bir şekilde olaylar iletir.

---

## Nedir? Neden Var?

### Problem
Dağıtık sistemlerde olay (event) kaydetme vs. harici endpoint'e gönderme arasında race condition var:
- Veritabanı yazma başarılı → HTTP gönderme başarısız → webhook hiç çağrılmaz (veri tutarsızlığı)
- HTTP gönderme başarılı → uygulama crash → DB yazma rollback (duplicate delivery)

### Çözüm: Outbox Pattern
```
1. ERP servisi olay → outbox tablosuna yazıyor (transactionlı, aynı yazışma)
2. Webhook Hub polling → her 5 saniyede batch okuma (SKIP LOCKED ile ölçeklenebilir)
3. Başarılı teslimat → 'sent' durumuna güncelleme
4. Başarısız → retry planla (eksponansiyel backoff)
5. Ölü mektep (dead-letter) → max 10 deneme sonra bırak
```

**Garantiler:**
- ✅ **At-least-once delivery** — webhook en az bir kez çağrılır
- ✅ **Idempotent teslimat** — müşteri endpoint'i iki kez çağrılsa da idempotensi sağlamalı (timestamp + deliveryId ile)
- ✅ Ölçeklenebilir — birden fazla Hub instance aynı event'i iki kez işlemez (SKIP LOCKED)

---

## Teknoloji Yığını

| Bileşen | Teknoloji | Notlar |
|---------|-----------|--------|
| Framework | Fastify + Node.js | Express değil, daha hızlı |
| Veritabanı | PostgreSQL 16 | control_plane şeması |
| Bağlantı Havuzu | pg (node-postgres) | Fastify'ın yerel async/await desteği ile |
| Imzalama | Node.js `crypto` | HMAC-SHA256 |
| Logging | pino (Fastify yerleşik) | Production: JSON, Dev: pretty-print |

---

## Proje Yapısı

```
apps/webhook-hub/
├── src/
│   ├── main.ts                              ← Bootstrap (Fastify başlatma)
│   ├── types.ts                             ← Paylaşılan interface'ler
│   ├── db/
│   │   └── pool.ts                          ← PostgreSQL bağlantı havuzu
│   ├── delivery/
│   │   ├── webhook-delivery.service.ts      ← HTTP POST motoru (HMAC imzalı)
│   │   ├── hmac.ts                          ← HMAC-SHA256 signing & verification
│   │   └── retry.strategy.ts                ← Retry logic (eksponansiyel backoff)
│   ├── outbox/
│   │   ├── outbox.repository.ts             ← DB CRUD (claim, mark sent/failed)
│   │   └── outbox-processor.ts              ← Polling engine (5s interval)
│   └── routes/
│       ├── events.ts                        ← POST /api/v1/events (enqueue)
│       ├── webhooks.ts                      ← Webhook CRUD (create/list/verify)
│       └── health.ts                        ← GET /health (K8s probe)
├── package.json
└── CLAUDE.md                                ← Bu dosya
```

---

## Ana Bileşenler

### 1. OutboxProcessor (Polling Engine)

**Dosya:** `src/outbox/outbox-processor.ts`

Yapı:
- Her 5 saniyede (`POLL_INTERVAL_MS = 5000`) `outbox_events` tablosundan batch okur (50 olay max)
- SKIP LOCKED ile: birden fazla instance aynı event'i iki kez işlemez
- Her olay paralel işlenir (`Promise.allSettled`)
- Abonelikler match edilir, her aboneliğe paralel teslimat

**Davranış:**
```typescript
// Pending olayı oku
SELECT * FROM outbox_events
WHERE status = 'pending'
  AND next_attempt_at <= NOW()
ORDER BY created_at ASC
LIMIT 50
FOR UPDATE SKIP LOCKED;

// Matching subscriptions bul (tenant + eventType)
SELECT * FROM webhook_subscriptions
WHERE tenant_id = event.tenant_id
  AND (event_types @> ARRAY[event.event_type]
       OR event_types @> ARRAY['*'])
  AND is_active = true;

// Her subscription'a paralel teslimat
await Promise.allSettled(
  subscriptions.map(sub => deliverWebhook(event, sub))
);

// Sonuç:
// - En az 1 başarı → markSent(eventId) → 'sent' durumu
// - Tümü başarısız → markFailed(eventId, error, nextAttemptAt)
```

**Başlatma / Durdurma:**
```typescript
processor.start();   // main.ts'de başlat
processor.stop();    // SIGTERM/SIGINT handle'ında durdur
```

---

### 2. WebhookDeliveryService (HTTP Motor)

**Dosya:** `src/delivery/webhook-delivery.service.ts`

```typescript
export async function deliverWebhook(
  event: OutboxEvent,
  subscription: WebhookSubscription
): Promise<DeliveryResult>
```

**Adımlar:**
1. **Payload formatla:**
   ```json
   {
     "id": "uuid-unique-per-delivery",
     "eventType": "waybill.satis.created",
     "tenantId": "tenant-uuid",
     "timestamp": 1234567890,
     "data": { /* event.payload */ }
   }
   ```

2. **İmzala (HMAC-SHA256):**
   ```typescript
   const secret = decryptSecret(subscription.secretEnc);
   const signature = signPayload(body, secret);
   // → "sha256=abcd1234..."
   ```

3. **POST gönder (10s timeout):**
   ```
   POST {subscription.url}
   Content-Type: application/json
   X-Enkap-Signature: sha256=...
   X-Enkap-Event: waybill.satis.created
   X-Enkap-Delivery: {deliveryId}
   X-Enkap-Timestamp: {unix_seconds}
   User-Agent: Enkap-Webhook/1.0

   { "id": ..., "eventType": ..., "data": ... }
   ```

4. **Sonuç değerlendir:**
   - `response.ok` (2xx) → `success: true`
   - 4xx/5xx → `success: false, error: "HTTP 500: ..."`
   - Network error / timeout → `success: false, error: "timeout"`

**Timeout:** 10 saniye (`DELIVERY_TIMEOUT_MS = 10000`)

**Response body:** Önemsiz — sadece HTTP status kodu sayılır

---

### 3. HMAC Signing & Verification

**Dosya:** `src/delivery/hmac.ts`

**İmzalama (Webhook Hub tarafı):**
```typescript
function signPayload(body: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `sha256=${digest}`;
}
```

**Doğrulama (Müşteri endpoint'i tarafı — örnek Node.js kodu):**
```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifySignature(body: string, secret: string, received: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Webhook endpoint'inde:
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-enkap-signature'];
  const body = JSON.stringify(req.body);

  if (!verifySignature(body, WEBHOOK_SECRET, signature)) {
    return res.status(401).send('Signature mismatch');
  }

  // Process webhook...
});
```

**Güvenlik Özelikleri:**
- **Timing-safe compare** — brute-force saldırısı önleme
- **256-bit random secret** — `generateSecret()` ile üretilir
- **Secret şifreleme** — DB'de `secretEnc` saklanır (TODO: Vault transit engine)
- **Timestamp header** — müşteri 5 dakika tolerance ile replay önleme yapabilir

---

### 4. Retry Strategy

**Dosya:** `src/delivery/retry.strategy.ts`

```typescript
export function nextAttemptAt(attemptNumber: number): Date | null {
  // attemptNumber: 1 = ilk deneme, 2 = 1. retry, ...
  // 10. retry'dan sonra → null (dead-letter)
  if (attemptNumber > 10) return null;

  // Eksponansiyel backoff
  const backoffMs = Math.pow(2, attemptNumber - 1) * 5_000;
  return new Date(Date.now() + backoffMs);
}

export function isDead(attemptNumber: number): boolean {
  return attemptNumber > 10;
}
```

**Retry Schedule:**
| Deneme | Gecikmesi | Toplam |
|--------|-----------|--------|
| 1 | 5s | 5s |
| 2 | 10s | 15s |
| 3 | 20s | 35s |
| 4 | 40s | 75s |
| 5 | 80s | 155s (~2.6 dk) |
| 6 | 160s | 315s (~5.2 dk) |
| 7 | 320s | 635s (~10.6 dk) |
| 8 | 640s | 1275s (~21 dk) |
| 9 | 1280s | 2555s (~42.6 dk) |
| 10 | 2560s | 5115s (~85 dk) |
| 11+ | Dead-letter ✗ | |

---

## Veritabanı Şeması

**Tüm tablolar:** control_plane şeması (PostgreSQL)

### outbox_events
```sql
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,          -- Hangi kiracı olayı
  event_type VARCHAR(100) NOT NULL, -- 'waybill.satis.created'
  payload JSONB NOT NULL,           -- Event verisi
  status VARCHAR(20),               -- 'pending' | 'sent' | 'failed' | 'dead'
  attempts INT DEFAULT 0,           -- Kaç kez denendi
  next_attempt_at TIMESTAMP,        -- Sonraki retry zamanı
  last_error TEXT,                  -- Son hata mesajı
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,           -- Ne zaman 'sent' oldu

  CONSTRAINT check_status CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  INDEX idx_status_next (status, next_attempt_at)
);
```

### webhook_subscriptions
```sql
CREATE TABLE webhook_subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  url VARCHAR(2000) NOT NULL,       -- Webhook endpoint URL
  secret_enc VARCHAR(500) NOT NULL, -- Şifreli HMAC secret
  event_types TEXT[] DEFAULT '{}',  -- ['*'] | ['waybill.*', 'invoice.*']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_tenant_active (tenant_id, is_active)
);
```

### webhook_deliveries (Audit / Logging)
```sql
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES outbox_events(id),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id),
  attempt INT,
  http_status INT,
  error TEXT,
  duration_ms INT,
  delivered_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoint'leri

### 1. Olay Enqueue (Kayıt)
**POST** `/api/v1/events`

Diğer ERP servisleri buraya POST'lar. Olay `outbox_events` tablosuna yazılır.

**Request:**
```json
{
  "tenantId": "uuid",
  "eventType": "waybill.satis.created",
  "payload": {
    "waybillId": "xyz",
    "totalAmount": 12345
  }
}
```

**Response (201):**
```json
{
  "id": "event-uuid",
  "status": "pending"
}
```

---

### 2. Webhook Subscription CRUD

#### 2a. Abonelik Oluştur
**POST** `/api/v1/webhooks`

**Request:**
```json
{
  "tenantId": "uuid",
  "url": "https://customer.example.com/webhook",
  "secret": "plain-secret-string",
  "eventTypes": ["waybill.*", "invoice.*"]
}
```

**Response (201):**
```json
{
  "id": "subscription-uuid",
  "url": "https://customer.example.com/webhook",
  "eventTypes": ["waybill.*", "invoice.*"],
  "isActive": true,
  "createdAt": "2026-03-26T10:30:00Z"
}
```

#### 2b. Abonelikleri Listele
**GET** `/api/v1/webhooks?tenantId=uuid`

**Response (200):**
```json
[
  {
    "id": "uuid",
    "url": "https://...",
    "eventTypes": ["*"],
    "isActive": true
  }
]
```

#### 2c. Abonelik Güncelle
**PATCH** `/api/v1/webhooks/:id`

```json
{
  "url": "https://new-url.example.com/webhook",
  "eventTypes": ["invoice.*"],
  "isActive": false
}
```

#### 2d. Abonelik Sil
**DELETE** `/api/v1/webhooks/:id`

---

### 3. Health & Metrics
**GET** `/health`

Kubernetes liveness/readiness probe.

**Response (200):**
```json
{
  "status": "ok",
  "database": "ok",
  "processor": "running"
}
```

---

## Mimarı Kurallar

### 1. Outbox vs. Webhook Subscription
- **outbox_events**: Olaylar geçici (1 gün TTL önerisi, sonra cleanup)
- **webhook_subscriptions**: Kalıcı (müşteri ayarı)

### 2. Tenant İzolasyonu
Webhook Hub **tenant-aware** değildir, `TenantGuard` yok:
- Tüm tenant'ların olayları aynı `outbox_events` tablosunda
- Her olay `tenant_id` ile tagsiz
- Servisler kendi `tenant_id`'lerini göndermeyi garantiye almalıdır

### 3. Event Type Matching
```typescript
// YAML-style glob matching YOK, string match:
const subscribe = ['waybill.*', 'invoice.created'];
const event = 'waybill.satis.created';

// ❌ Yanlış — glob engine yok
if (event.match(/waybill\..*/)) { }

// ✅ Doğru — PostgreSQL array contains (@>):
WHERE event_types @> ARRAY[event.event_type] OR event_types @> ARRAY['*']
```

### 4. Secret Handling
```typescript
// ✅ DB'ye yazarken şifrele
const encrypted = encryptSecret(plainSecret);
await save({ secretEnc: encrypted });

// ✅ Teslimat yaparken çöz
const plain = decryptSecret(subscription.secretEnc);
const sig = signPayload(body, plain);

// ❌ Asla plain secret'ı log'a veya response'a koymak
```

### 5. Idempotency
Müşteri webhook endpoint'i şu kullanmalı:
```typescript
// Unique delivery'i dedupe etmek için:
const deliveryId = req.headers['x-enkap-delivery'];
const timestamp = req.headers['x-enkap-timestamp'];

// Aynı deliveryId 2. kez çağrılsa → 200 (idempotent)
const cached = await redis.get(`delivery:${deliveryId}`);
if (cached) return res.json(cached);

// Process...
redis.setex(`delivery:${deliveryId}`, 86400, JSON.stringify(result));
```

---

## Çalıştırma

### Development

```bash
# Terminal 1: PostgreSQL + Redis
docker compose up -d postgres

# Terminal 2: Migration'ları çalıştır (control_plane şeması)
pnpm --filter @enkap/webhook-hub run migrate

# Terminal 3: Webhook Hub başlat
pnpm --filter @enkap/webhook-hub dev
```

Endpoint'ler:
- `POST http://localhost:3006/api/v1/events` (olay enqueue)
- `POST http://localhost:3006/api/v1/webhooks` (abonelik oluştur)
- `GET http://localhost:3006/health` (health check)

### Production (Kubernetes)

```bash
# Build + push
docker build -f infrastructure/docker/fastify.Dockerfile -t enkap/webhook-hub:latest .

# Deployment
kubectl apply -f infrastructure/kubernetes/services/webhook-hub-deployment.yaml
```

**Pod başlatma:** 2-3 saniye (health probe'dan önce bekleme)

---

## Logging

**Development (pino-pretty):**
```
[12:34:56] INFO (webhook-hub): Webhook Hub hazır: http://0.0.0.0:3006
[12:34:57] INFO (processor): 3 olay işleniyor...
[12:34:58] INFO (processor): ✓ Teslim edildi: eventId=uuid type=waybill.satis.created
```

**Production (JSON):**
```json
{"level":20,"time":"2026-03-26T10:35:00.000Z","msg":"Webhook Hub hazır","service":"webhook-hub"}
{"level":20,"time":"2026-03-26T10:35:01.000Z","msg":"3 olay işleniyor..."}
{"level":20,"time":"2026-03-26T10:35:02.000Z","msg":"✓ Teslim edildi","eventId":"uuid"}
```

---

## Ölçekleme

### Birden Fazla Instance
```
Instance A  ─┐
Instance B  ─┼─→ PostgreSQL (SKIP LOCKED)
Instance C  ─┘
```

**Garantili davranış:**
- Aynı event iki instance tarafından işlenmez
- `FOR UPDATE SKIP LOCKED` tarafından sağlanır
- Herhangi bir instance fail olsa, diğeri retry alır

**PgBouncer ile connection pooling:** `transaction mode`, max 20 per instance

---

## TODO & Stub'lar

| Stub | Dosya | Açıklama |
|------|-------|---------|
| Vault integration | `hmac.ts` | `encryptSecret()` / `decryptSecret()` Vault transit engine ile |
| Event TTL cleanup | - | `outbox_events` 1 gün sonra DELETE cron job |
| Dead-letter DLQ | - | Dead-letter event'leri ayrı gözlemlenebilir queue'ya aktar |
| Metrics export | - | Prometheus metrikleri (`webhook_deliveries_total`, `webhook_delivery_duration_seconds`) |
| Rate limiting | - | Tenant başına rate limit (per-minute POST events) |

---

## Temel Kontrol Listesi (Yeni Özellik Eklerken)

1. **Olay tipini tanımla:** `service.ts` → `tenantService.enqueueEvent('event.type', payload)`
2. **Webhook Hub route'u** devops'a bildir (açık değilse, webhook'lar çıkarken 404)
3. **Müşteri webhook endpoint'i** — HTTPS + signature doğrulama + idempotency
4. **Monitoring:** Dead-letter count, retry histogram, P99 delivery latency
5. **Docs:** API dökümanı, webhook schema, örnek payload

---

## İletişim

- **Hatalar:** GitHub issues
- **Sorunlar:** Team Slack kanali (#webhook)
- **Deployment:** DevOps (infrastructure/kubernetes/services/)

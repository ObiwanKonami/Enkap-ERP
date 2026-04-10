# Treasury Service — Kasa & Banka Yönetimi

## Genel Bakış

**Port:** 3013 | **Teknoloji:** NestJS + Fastify | **Veritabanı:** PostgreSQL (tenant şeması)

Treasury Service, Enkap ERP'nin **kasa ve banka hesap yönetimi** modülüdür. Türk muhasebe standartlarına uygun olarak:
- **Hesab 100 (Kasa)** ve **Hesab 102 (Bankalar)** işlemlerini yönetir
- Hesaplar arası transferler (TRANSFER)
- Müşteri tahsilatları (TAHSILAT) → AR kapatma
- Tedarikçi ödemeleri (ODEME) → AP kapatma
- Banka faiz ve masraf hareketleri
- **Mutabakat (Reconciliation)**: Banka ekstresiyle eşleştirme

---

## Mimari Bileşenler

### Modüller

| Modül | Dosya | Açıklama |
|-------|-------|---------|
| `AccountModule` | `account/account.module.ts` | Hesap CRUD, hareket listesi |

### Servisler

| Servis | Dosya | Açıklama |
|--------|-------|---------|
| `AccountService` | `account/account.service.ts` | Hesap oluştur, listele, bakiye sorgula |
| `TransactionService` | `transaction/transaction.service.ts` | Hareket oluştur, listele — PESSIMISTIC_WRITE lock |
| `TreasuryEventsPublisher` | `events/treasury-events.publisher.ts` | Ödeme olayı → financial-service (RabbitMQ) |
| `HrEventsConsumer` | `events/hr-events.consumer.ts` | HR avans/masraf onayı → ödeme emri (RabbitMQ) |

### Entity'ler

| Entity | Tablo | Açıklama |
|--------|-------|---------|
| `TreasuryAccount` | `treasury_accounts` | Kasa/Banka hesabı — bakiye + metadata |
| `TreasuryTransaction` | `treasury_transactions` | Hareket kaydı — yön, bakiye, mutabakat |

---

## Veri Modeli

### TreasuryAccount

```typescript
{
  id: UUID;
  tenantId: UUID;
  name: string;                    // "İş Bankası TL", "Ana Kasa"
  accountType: 'KASA' | 'BANKA';
  currency: string;                // varsayılan: TRY
  balanceKurus: bigint;            // güncel bakiye (kuruş)
  bankAccountNo?: string;          // BANKA tipi için
  iban?: string;                   // TR123...
  bankName?: string;               // "Türkiye İş Bankası"
  isActive: boolean;               // soft delete
  createdBy: string;               // UUID
  createdAt: Date;
  updatedAt: Date;
}
```

**Muhasebe Kuralı:**
- `accountType = 'KASA'` → Hesab 100 (Kasa)
- `accountType = 'BANKA'` → Hesab 102 (Bankalar)

### TreasuryTransaction

```typescript
{
  id: UUID;
  tenantId: UUID;
  accountId: UUID;                 // FK → treasury_accounts
  transactionType: TransactionType;
  amountKurus: bigint;             // daima pozitif
  direction: 'IN' | 'OUT';         // yön
  runningBalance: bigint;          // hareketten sonra hesap bakiyesi
  transactionDate: Date;           // işlem tarihi
  description?: string;            // açıklama
  referenceType?: string;          // 'INVOICE' | 'HR_ADVANCE' | 'HR_EXPENSE'
  referenceId?: string;            // belge numarası/UUID
  targetAccountId?: UUID;          // TRANSFER tipinde hedef hesap
  reconciliationStatus: 'BEKLIYOR' | 'ESLESTI' | 'ESLESMEDI';
  createdBy: string;
  createdAt: Date;
}
```

**TransactionType Enum:**

| Tip | Açıklama | Muhasebe Kaydı |
|-----|----------|----------------|
| `TAHSILAT` | Müşteriden tahsilat | Borç: 100/102 | Alacak: 120 (AR) |
| `ODEME` | Tedarikçiye ödeme | Borç: 320 (AP) | Alacak: 100/102 |
| `TRANSFER` | Hesaplar arası transfer | Borç: 102 | Alacak: 102 |
| `FAIZ_GELIRI` | Banka faiz geliri | Borç: 102 | Alacak: 642 (Faiz Geliri) |
| `BANKA_MASRAFI` | Banka komisyonu/masrafı | Borç: 780 (Diğer Gider) | Alacak: 102 |
| `DIGER_GELIR` | Diğer gelir | Borç: 100/102 | Alacak: 644 |
| `DIGER_GIDER` | Diğer gider | Borç: 781 | Alacak: 100/102 |

**Reconciliation Status (Mutabakat):**
- `BEKLIYOR`: Banka ekstresiyle henüz eşleştirilmedi
- `ESLESTI`: Ekstre ile başarıyla eşleşti
- `ESLESMEDI`: Ekstre ile çelişiyor (tutarlar/tarihler uymuyor)

---

## Servis API'leri

### AccountService

```typescript
// Yeni hesap oluştur
async create(dto: CreateAccountDto, createdBy: string): Promise<TreasuryAccount>

// Hesapları listele (sayfalanabilir)
async findAll(page = 1, limit = 50): Promise<{
  items: TreasuryAccount[];
  total: number;
  page: number;
  limit: number
}>

// Hesap detayı
async findOne(id: string): Promise<TreasuryAccount>

// Hesabı deaktive et (soft delete)
async deactivate(id: string): Promise<void>

// Para birimi bazında toplam bakiyeler
async getTotalBalances(): Promise<Array<{ currency: string; totalKurus: number }>>
```

### TransactionService

```typescript
// Yeni hareket oluştur (PESSIMISTIC_WRITE lock)
async create(
  accountId: string,
  dto: CreateTransactionDto,
  createdBy: string
): Promise<TreasuryTransaction>

// Hesap hareketlerini listele (tarih filtreleriyle)
async listByAccount(
  accountId: string,
  params?: {
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string
  }
): Promise<{ data: TreasuryTransaction[]; total: number }>
```

---

## API Endpoint'leri

### Hesaplar (AccountController)

```
POST   /api/v1/accounts
       Yeni hesap oluştur
       Body: { name, accountType, currency?, bankAccountNo?, iban?, bankName? }

GET    /api/v1/accounts?page=1&limit=50
       Hesapları listele (sayfalanabilir)

GET    /api/v1/accounts/:id
       Hesap detayı ve güncel bakiye

DELETE /api/v1/accounts/:id
       Hesabı deaktive et → 204 No Content

GET    /api/v1/accounts/summary/balances
       Para birimi bazında toplam bakiyeler
```

### Hesap Hareketleri (AccountController)

```
POST   /api/v1/accounts/:id/transactions
       Hesaba hareket ekle
       Body: { transactionType, amountKurus, transactionDate, description?,
               referenceType?, referenceId?, targetAccountId? }

GET    /api/v1/accounts/:id/transactions?limit=50&offset=0&fromDate=2026-01-01&toDate=2026-03-31
       Hesap hareket listesi (tarih filtreli)
```

---

## İş Akışları

### 1. Müşteri Tahsilatı (TAHSILAT)

```
[Web UI] → POST /accounts/{kasaHesabıId}/transactions
  {
    transactionType: 'TAHSILAT',
    amountKurus: 5000000,     // 50.000 ₺
    transactionDate: '2026-03-20',
    description: 'Fatura FTR-2026-0045 tahsilatı',
    referenceType: 'INVOICE',
    referenceId: 'FTR-2026-0045'
  }
→ TransactionService.create()
  1. Kasa hesabını lock (PESSIMISTIC_WRITE)
  2. balanceKurus += 5000000
  3. TreasuryTransaction INSERT (direction: 'IN', runningBalance: güncel)
  4. referenceType='INVOICE' → TreasuryEventsPublisher.publishPaymentCreated()
     → 'treasury.payment.created' (RabbitMQ)
     → financial-service dinleyerek: AR kapatır, yevmiye yapar
```

### 2. Tedarikçi Ödemesi (ODEME)

```
[Web UI] → POST /accounts/{bankaHesabıId}/transactions
  {
    transactionType: 'ODEME',
    amountKurus: 2000000,     // 20.000 ₺
    transactionDate: '2026-03-21',
    description: 'Satın Alma Siparişi SAT-2026-0012 ödemesi',
    referenceType: 'PURCHASE_ORDER',
    referenceId: 'SAT-2026-0012'
  }
→ TransactionService.create()
  1. Banka hesabını lock
  2. balanceKurus -= 2000000
  3. TreasuryTransaction INSERT (direction: 'OUT')
  4. RabbitMQ → financial-service: AP taksit kapatma
```

### 3. HR Avans Ödemesi (RabbitMQ)

```
hr-service → RabbitMQ: 'hr.advance.approved'
  { tenantId, advanceId, amountKurus, employeeId, ... }

← treasury-service (HrEventsConsumer)
  1. Mükerrer kontrol (referenceId: advanceId)
  2. İdempotent: var ise yoksay
  3. Tenant'ın ilk aktif hesabını bul (label='HR_ODEME' önce)
  4. Bakiye -= amountKurus
  5. TreasuryTransaction oluştur:
     { transactionType: 'ODEME', referenceType: 'HR_ADVANCE', referenceId: advanceId }
```

### 4. Hesaplar Arası Transfer

```
[Web UI] → POST /accounts/{kaynakHesabıId}/transactions
  {
    transactionType: 'TRANSFER',
    amountKurus: 1000000,
    transactionDate: '2026-03-22',
    description: 'Kasa → Banka transferi',
    targetAccountId: '...(hedef hesap UUID)'
  }
→ TransactionService.create()
  1. İşlem başlat (transaction)
  2. Kaynak hesabı lock: balanceKurus -= 1000000
  3. TreasuryTransaction oluştur (accountId: kaynak, direction: 'OUT')
  4. Hedef hesabı lock: balanceKurus += 1000000
  5. Karşı kayıt oluştur (accountId: hedef, direction: 'IN')
  6. İşlem commit
```

### 5. Banka Faiz / Masraf

```
[Web UI] → POST /accounts/{bankaHesabıId}/transactions
  { transactionType: 'FAIZ_GELIRI' | 'BANKA_MASRAFI', ... }

Faiz geliri:
  - direction: 'IN'
  - Muhasebe: Borç 102 | Alacak 642 (Faiz Geliri)

Banka masrafı:
  - direction: 'OUT'
  - Muhasebe: Borç 780 (Diğer Gider) | Alacak 102
```

---

## Tenant İzolasyonu

**Kritik:** Her hesap ve hareket `tenant_id` sütunuyla izole edilir.

```typescript
// ✅ Doğru
const { tenantId } = getTenantContext();
const ds = await this.dsManager.getDataSource(tenantId);
const repo = ds.getRepository(TreasuryAccount);
// veri otomatik tenant_id'ye filtrelenir

// ❌ Yanlış
@InjectRepository(TreasuryAccount)
const repo: Repository<TreasuryAccount>;
// cross-tenant veri sızıntısı riski
```

---

## Concurrency Control — PESSIMISTIC_WRITE Lock

**Neden gerekli:** Aynı anda birden fazla hareket oluşturulursa, bakiye hesaplaması yanlış olabilir.

```typescript
// TransactionService.create() içinde:
const account = await em.findOne(TreasuryAccount, {
  where: { id: accountId, tenantId },
  lock: { mode: 'pessimistic_write' },  // ← KRITIK
});

// Bu işlem tamamlanana kadar, başka işlem bu hesabı lock edebilir
account.balanceKurus += delta;
await em.save(TreasuryAccount, account);
```

**Kuralı:** Bakiye güncellemesi yapan her `TransactionService.create()` ve `HrEventsConsumer.createPaymentOrder()` PESSIMISTIC_WRITE lock kullanmalı.

---

## RabbitMQ Event'leri

### Publish (treasury-service → financial-service)

| Routing Key | Payload | Açıklama |
|-------------|---------|---------|
| `treasury.payment.created` | `PaymentCreatedEvent` | Fatura ödemesi → AP taksit kapatma + yevmiye |

**PaymentCreatedEvent:**
```typescript
{
  tenantId: string;
  transactionId: string;
  accountId: string;
  transactionType: string;
  amountKurus: number;
  transactionDate: string;
  invoiceId?: string;           // referenceType='INVOICE' ise dolu
  referenceType?: string;       // 'INVOICE'
  referenceId?: string;         // fatura numarası
  description?: string;
  createdBy: string;
}
```

### Consume (hr-service → treasury-service)

| Routing Key | Payload | Açıklama |
|-------------|---------|---------|
| `hr.advance.approved` | `AdvanceApprovedPayload` | Avans onaylandı → ODEME hareketi |
| `hr.expense.approved` | `ExpenseApprovedPayload` | Masraf onaylandı → ODEME hareketi |

**AdvanceApprovedPayload:**
```typescript
{
  tenantId: string;
  advanceId: string;
  employeeId: string;
  amountKurus: number;
  advanceType: string;          // 'ADVANCE' vb.
  approvedBy: string;
  approvedAt: string;           // ISO timestamp
}
```

**Idempotency:** RabbitMQ consumer, referenceId ile mükerrer kontrol yaparak idempotent.

---

## Hata Yönetimi

| Hata | Neden | Çözüm |
|------|-------|-------|
| `NotFoundException` | Hesap bulunamadı | 404 dön |
| `BadRequestException` | TRANSFER'de targetAccountId yok | Validasyon hatasını belirt |
| `RabbitMQ connection error` | Message broker bağlanamadı | Log'a kaydet, silent fail |
| Cross-tenant write | Yanlış tenant hesabına hareket | TenantAwareSubscriber engeller |

---

## DTO'lar

### CreateAccountDto

```typescript
{
  name: string;                  // max 100 chars
  accountType: 'KASA' | 'BANKA'; // enum
  currency?: string;             // 3 chars (default: 'TRY')
  bankAccountNo?: string;        // max 50
  iban?: string;                 // max 34 (TR123...)
  bankName?: string;             // max 100
}
```

### CreateTransactionDto

```typescript
{
  transactionType: TransactionType;  // enum
  amountKurus: number;               // >0
  transactionDate: string;           // YYYY-MM-DD
  description?: string;              // max 500
  referenceType?: string;            // max 50 ('INVOICE', 'HR_ADVANCE', vb.)
  referenceId?: string;              // max 100
  targetAccountId?: string;          // UUID (TRANSFER tipinde zorunlu)
}
```

---

## Veritabanı

**Tablo:** treasury_accounts, treasury_transactions (tenant şemasında)

**Index'ler:**
- `treasury_transactions(account_id, transaction_date)` — listeleme hızı

**Constraint'ler:**
- `treasury_transactions.account_id` → `treasury_accounts.id` RESTRICT (hesap silinmez)
- `balanceKurus` BIGINT, `amountKurus` BIGINT (kuruş cinsinden)

---

## Geliştirme Kuralları

### 1. Yeni Hareket Tipi Ekleme

```typescript
// 1. treasury-transaction.entity.ts'de enum'a ekle
export type TransactionType =
  | 'TAHSILAT' | 'ODEME' | 'TRANSFER' | 'FAIZ_GELIRI'
  | 'YENI_TIP';  // ← ekle

// 2. create-transaction.dto.ts'de ekle
const TRANSACTION_TYPES: TransactionType[] = [
  'TAHSILAT', 'ODEME', 'TRANSFER', 'FAIZ_GELIRI', 'YENI_TIP'  // ← ekle
];

// 3. transaction.service.ts'de direction belirlemeyi güncelle
function resolveDirection(type: TransactionType['transactionType']): 'IN' | 'OUT' {
  const inTypes = ['TAHSILAT', 'FAIZ_GELIRI', 'DIGER_GELIR'];
  if (type === 'YENI_TIP' && [some condition]) inTypes.push('YENI_TIP');
  return inTypes.includes(type) ? 'IN' : 'OUT';
}
```

### 2. Yeni Event Publisher Ekleme

```typescript
// treasury-events.publisher.ts'de yeni metot
publishNewEvent(event: NewEventPayload): void {
  if (!this.ready || !this.channel) return;
  this.channel.publish(
    EXCHANGE,
    'treasury.new.event',  // routing key
    Buffer.from(JSON.stringify(event)),
    { persistent: true, contentType: 'application/json', timestamp: Math.floor(Date.now() / 1000) }
  );
  this.logger.debug(`Event yayınlandı: treasury.new.event`);
}

// transaction.service.ts'de çağır
this.eventsPublisher.publishNewEvent({ ... });
```

### 3. Yeni Event Consumer Ekleme

```typescript
// events/new-events.consumer.ts oluştur
@Injectable()
export class NewEventsConsumer implements OnModuleInit, OnModuleDestroy {
  // HrEventsConsumer'ı şablon olarak kullan
}

// app.module.ts'de provider'a ekle
providers: [HrEventsConsumer, NewEventsConsumer]
```

---

## Testing

```bash
# Unit test
npm test -- treasury-service

# Integration test
npm test:e2e -- treasury-service
```

**Test Kuralları:**
- Her test kendi tenant contexti ile çalışsın
- PESSIMISTIC_WRITE lock'ı simüle et (concurrent hareketi test et)
- RabbitMQ mock'lanmalı
- Bakiye hesaplaması doğrulanmalı

---

## Monitoring & Observability

- `/health` — liveness + readiness probe (K8s)
- `/metrics` — Prometheus metrikleri (OTEL)
- Logger: `new Logger(ClassName.name)`
- Distributed tracing: OpenTelemetry NodeSDK

---

## Çalıştırma

```bash
# Geliştirme
pnpm --filter treasury-service dev

# Docker
docker compose up treasury-service

# Swagger
http://localhost:3013/docs
```

---

## İlişkili Servisler

| Servis | Etkileşim | İşlem |
|--------|-----------|-------|
| **financial-service** | Event listener | treasury.payment.created → AP kapatma + yevmiye |
| **hr-service** | Event publisher | hr.advance.approved, hr.expense.approved → ODEME hareketi |
| **order-service** | HTTP / Event | Sipariş tahsilatı referansı |
| **purchase-service** | HTTP / Event | Satın alma ödeme referansı |

---

## Sık Sorulan Sorular

**S:** Hesap bakiyesi negatif olabilir mi?
**C:** Evet, kredili hesap için `balanceKurus` negatif olabilir.

**S:** TRANSFER'de hareket 2 satır mı?
**C:** Evet. Kaynak hesap -OUT, hedef hesap +IN. Transaction içinde atomik.

**S:** Mutabakat nasıl çalışır?
**C:** Web UI, banka ekstresi yükledikten sonra, `reconciliationStatus` UPDATE ile eşleştirir. Treasury service henüz reconciliation matching logic'i sunmuyor — manuel eşleştirme.

**S:** ODEME hareketi oluşturulduğunda financial-service'e bildirim gönderiliyor mu?
**C:** Hayır. Sadece `referenceType='INVOICE'` ise event gönderilir. HR avans/masraf için event gönderilmiyor, doğrudan hareket oluşturulur.

---

## Kaynaklar

- CLAUDE.md (root) — GİB, HR, borderline kuralları
- PROGRESS.md — ilerleyen sprint'ler
- UI_RULES.md — dashboard kuralları

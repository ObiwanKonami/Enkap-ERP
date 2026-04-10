# CLAUDE.md — Enkap Billing Servis Rehberi

Billing-service (:3008) — **Türkiye'nin lider ödeme altyapısı iyzico entegrasyon**, abonelik planları, dunning (başarısız ödeme otomatik takibi), fatura yönetimi.

---

## Hızlı Başlangıç

```bash
# Servis başlat
pnpm --filter @enkap/billing-service dev

# Swagger UI
http://localhost:3008/docs

# Sağlık kontrolü
curl http://localhost:3008/health
```

### Ortam Değişkenleri

```bash
# iyzico (sandbox/production)
IYZICO_API_KEY=sandbox-api-key
IYZICO_SECRET_KEY=sandbox-secret-key
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com

# Veritabanı
DATABASE_URL=postgresql://enkap_admin:enkap_pass@localhost:5432/enkap_control_plane
CONTROL_PLANE_DATABASE_URL=<same or separate URL>

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# SMTP (e-posta)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=<sendgrid-api-key>
```

---

## Mimarisi

### Modül Yapısı

```typescript
BillingModule
├── SubscriptionModule (subscription.service + subscription.controller)
├── PaymentModule (payment.service + iyzico.client)
├── DunningService (@Cron)
├── TenantEventsConsumer (RabbitMQ)
├── PlatformSettingsService (control_plane DB)
└── HealthModule + MailerModule
```

### Veritabanı

**İki DataSource:**

| DataSource | Tablosu | Amaç |
|-----------|---------|------|
| **Varsayılan (control_plane)** | `subscriptions`, `billing_plans`, `payment_attempts`, `billing_invoices` | Tüm tenant'lar için ortaktır |
| **control_plane** | `platform_settings` | Platform yöneticisi ayarları |

---

## Entity'ler & Tablolar

### 1. `BillingPlan` (Abonelik Planı)

```typescript
@Entity('billing_plans')
export class BillingPlan {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id!: string;                              // 'starter', 'business', 'enterprise'

  @Column({ type: 'varchar', length: 50 })
  name!: string;                            // "Başlangıç", "Profesyonel", "Kurumsal"

  @Column({ name: 'price_kurus', type: 'bigint' })
  priceKurus!: number;                      // Aylık fiyat kuruş (0 = özel fiyat/kurumsal)

  @Column({ name: 'annual_price_kurus', type: 'bigint', default: 0 })
  annualPriceKurus!: number;                // Yıllık fiyat kuruş (0 = yıllık seçenek yok)

  @Column({ name: 'max_users', type: 'smallint' })
  maxUsers!: number;                        // Maksimum kullanıcı sayısı

  @Column({ name: 'max_invoices_month', type: 'int' })
  maxInvoicesMonth!: number;                // Aylık max fatura (0 = sınırsız)

  @Column({ name: 'has_ml', default: false })
  hasMl!: boolean;                          // AI/ML öngörü motoru dahil mi?

  @Column({ name: 'has_marketplace', default: false })
  hasMarketplace!: boolean;                 // Entegrasyon marketi dahil mi?

  @Column({ name: 'has_hr', default: false })
  hasHr!: boolean;                          // İK & Bordro modülü dahil mi?

  @Column({ type: 'jsonb', default: '[]' })
  features!: string[];                      // Görüntüleme için: ["5 kullanıcı", "Fatura + Stok", ...]

  @Column({ name: 'iyzico_plan_ref', type: 'varchar', length: 100, nullable: true })
  iyzicoplanRef!: string | null;            // iyzico pricingPlanReferenceCode

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

**Varsayılan Planlar (seed):**

| ID | Adı | Aylık (₺) | Yıllık (₺) | Max Kullanıcı | Max Fatura/ay | Özellikler |
|----|-----|----------|-----------|--------------|--------------|-----------|
| `starter` | Başlangıç | 499,00 | 4.990,00 | 5 | 100 | Temel fatura, stok |
| `business` | Profesyonel | 1.499,00 | 14.990,00 | 25 | 1.000 | + İK, Müşteri Yönetimi |
| `enterprise` | Kurumsal | 0,00 | 0,00 | Sınırsız | Sınırsız | Tüm özellikler + destek |

---

### 2. `Subscription` (Abonelik)

```typescript
@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', unique: true })
  tenantId!: string;                        // Her tenant'ın **tek** aboneliği

  @Column({ name: 'plan_id', type: 'varchar', length: 20 })
  planId!: string;                          // 'starter' | 'business' | 'enterprise'

  @Column({ type: 'varchar', length: 20, default: 'trialing' })
  status!: SubscriptionStatus;              // 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;                // Deneme süresi bitiş (varsayılan: 14 gün)

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart!: Date | null;         // Mevcut faturalama dönemi başlangıcı

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null;           // Mevcut faturalama dönemi bitişi

  @Column({ name: 'cancel_at_period_end', default: false })
  cancelAtPeriodEnd!: boolean;              // true → dönem sonunda otomatik iptal

  @Column({ name: 'iyzico_subscription_ref', type: 'varchar', length: 100, nullable: true })
  iyzicoSubscriptionRef!: string | null;    // iyzico subscriptionReferenceCode

  @Column({ name: 'iyzico_customer_ref', type: 'varchar', length: 100, nullable: true })
  iyzicoCustomerRef!: string | null;        // iyzico customerReferenceCode

  @Column({ name: 'iyzico_card_token', type: 'varchar', length: 200, nullable: true })
  iyzicoCardToken!: string | null;          // Kayıtlı kart tokeni (PCI: sadece token saklanır)

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Getter'lar
  get isTrialing(): boolean  { return this.status === 'trialing'; }
  get isActive(): boolean    { return this.status === 'active' || this.isTrialing; }
  get isPastDue(): boolean   { return this.status === 'past_due'; }
}
```

**Abonelik Yaşam Döngüsü:**
```
Kayıt
  ↓
trialing (14 gün) — kart isteğe bağlı
  ↓
[Kart eklendiyse] active (ödeme alındı)
  ├→ past_due (ödeme başarısız → dunning)
  │   └→ cancelled (3 başarısız deneme)
  ├→ cancelled (müşteri tarafından iptal)
  └→ expired (dönem sonu)
```

---

### 3. `PaymentAttempt` (Ödeme Denemesi)

```typescript
@Entity('payment_attempts')
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: number;                     // Tahsil edilen tutar kuruş

  @Column({ type: 'char', length: 3, default: 'TRY' })
  currency!: string;                        // 'TRY' | 'USD' | 'EUR'

  @Column({ type: 'varchar', length: 20 })
  status!: PaymentStatus;                   // 'success' | 'failed' | 'pending' | 'refunded'

  @Column({ name: 'iyzico_payment_id', type: 'varchar', length: 100, nullable: true })
  iyzicoPaymentId!: string | null;          // iyzico'dan dönen ödeme ID

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;            // Hatanın açıklaması (yetersiz bakiye, vb.)

  @Column({ name: 'attempt_number', type: 'smallint', default: 1 })
  attemptNumber!: number;                   // Kaçıncı deneme (dunning için)

  @Column({ name: 'next_attempt_at', type: 'timestamptz', nullable: true })
  nextAttemptAt!: Date | null;              // Dunning: bir sonraki otomatik deneme zamanı

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

---

### 4. `BillingInvoice` (Fatura)

```typescript
@Entity('billing_invoices')
export class BillingInvoice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50, unique: true })
  invoiceNumber!: string;                   // INV-{tenant}-{YYYYMM}-{attempt}

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart!: Date;                       // Dönem başlangıcı

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd!: Date;                         // Dönem bitişi

  @Column({ name: 'amount_kurus', type: 'bigint' })
  amountKurus!: number;                     // Tutar kuruş (KDV hariç)

  @Column({ name: 'kdv_kurus', type: 'bigint', default: 0 })
  kdvKurus!: number;                        // KDV %20 tutarı kuruş

  @Column({ name: 'total_kurus', type: 'bigint' })
  totalKurus!: number;                      // Toplam kuruş (KDV dahil)

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: BillingInvoiceStatus;            // 'pending' | 'paid' | 'void'

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;                // PaymentAttempt.id referansı

  @Column({ name: 'pdf_path', type: 'text', nullable: true })
  pdfPath!: string | null;                  // S3/local disk path

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
```

---

## Servisler

### 1. SubscriptionService — Abonelik Yönetimi

#### Constructor Bağımlılıkları
```typescript
constructor(
  @InjectRepository(BillingPlan)
  private readonly planRepo: Repository<BillingPlan>,
  @InjectRepository(Subscription)
  private readonly subscriptionRepo: Repository<Subscription>,
  private readonly iyzicoClient: IyzicoClient,
  private readonly paymentService: PaymentService,
  private readonly dataSource: DataSource,
  private readonly rateLimitSync: RateLimitSyncService,
  private readonly platformSettings: PlatformSettingsService,
) {}
```

#### Metodlar

**`getPlans(): Promise<BillingPlan[]>`**
- Aktif planları (`isActive = true`) fiyata göre sıralı döner
- Frontend plan seçimi için

**`findByTenant(tenantId: string): Promise<Subscription | null>`**
- Tenant'ın mevcut aboneliğini döner (unique constraint)
- Kong rate-limit sync tarafından da çağrılır

**`startSubscription(params: { tenantId, planId, email, companyName, card? }): Promise<Subscription>`**

Yeni abonelik başlatma akışı:
```
1. Plan var mı kontrol et
2. Tenant'ın zaten aboneliği var mı? (ConflictException)
3. Trial süresi hesapla: platform_settings['trial_days'] (varsayılan 14 gün)
4. Kart verilmişse → iyzico'ya kaydet
   - createSubscription() → subscriptionRef + customerRef + cardToken al
   - Başarısız → BadRequestException fırla
5. Subscription DB'ye kaydet
6. Rate-limit tier'ını Redis'e yaz (Kong okur)
7. Abonelik döner
```

**`addCard(tenantId, card): Promise<Subscription>`**

Mevcut aboneliğe kart ekle veya güncelle (onboarding wizard adım 2):
```
1. Abonelik bul (yoksa NotFoundException)
2. iyzico'ya kart kaydı yap (deneme süresi bitene kadar)
3. Token + ref'leri Subscription'a kaydet
4. Rate-limit sync
```

**`changePlan(tenantId, newPlanId): Promise<Subscription>`**

Plan geçişi (upgrade/downgrade):
```
Upgrade (starter → business):
  → Anında geçerli (prorated TODO)

Downgrade (business → starter):
  → Dönem sonunda geçerli (cancelAtPeriodEnd = true)
```

**`cancel(tenantId, immediate?: boolean): Promise<void>`**

Abonelik iptali:
```
immediate = true  → Anında iptal (status = 'cancelled')
immediate = false → Dönem sonunda iptal (cancelAtPeriodEnd = true)
```

**`processPeriodRenewals(): Promise<void>`** ← @Cron

Abonelik yenileme işlemi (günlük, ödeme dönemi bitişinde):
```
1. Yenileme tarihi geçmiş abonelikler bul (currentPeriodEnd <= now)
2. Her abonelik için:
   a. cancelAtPeriodEnd = true mi? → cancelled yap, kapat
   b. Aktifleri denetleme → PaymentService.charge() çağır
   c. Başarısızsa → status = 'past_due', dunning schedule başlat
3. Başarılı ödemeler: currentPeriodStart/End 1 ay ileri al
```

---

### 2. PaymentService — Ödeme Tahsilat

#### Metodlar

**`charge(params: { subscription, amountKurus, plan? }): Promise<ChargeResult>`**

iyzico kart tahsilat:
```
1. Kart tokeni var mı? (ücretsiz plan → success döner)
2. Deneme sayısı hesapla (önceki PaymentAttempt'ler)
3. Fatura numarası oluştur: INV-{tenantId:8}-{YYYYMM}-{attempt}
4. iyzico.chargeCard() çağır
5. PaymentAttempt kaydı yap:
   - status = 'success' | 'failed'
   - failureReason doldur
   - attemptNumber arttır
6. Başarılıysa:
   - Subscription.status = 'active'
   - BillingInvoice oluştur
   - Fatura PDF oluştur + e-posta gönder
7. Başarısızsa:
   - nextAttemptAt hesapla (dunning)
```

**`createBillingInvoice(subscription, chargeParams): Promise<BillingInvoice>`**

Fatura kaydı (başarılı ödemede):
```
- invoiceNumber, periodStart/End, amountKurus, kdvKurus, totalKurus
- PDF oluştur ve S3/disk'e kaydet
- E-posta gönder
```

**`generateInvoicePdf(subscription, billingInvoice): Promise<Buffer>`**

PDF oluşturma:
```
- @enkap/reporting → PDFKit
- Başlık: "ENKAP İABONELİK FATURASI"
- Detaylar: Dönem, Tutar, KDV, Toplam
- QR kod: billing.enkap.com.tr/verify/{invoiceId}
- Font: DejaVu (Unicode support)
```

---

### 3. DunningService — Başarısız Ödeme Otomatik Takibi

#### Cron Job

```typescript
@Cron('0 6 * * *', { timeZone: 'Europe/Istanbul' })
async processDunning(): Promise<void>
```
**Her gün 09:00 Istanbul saatinde (06:00 UTC)** çalışır.

#### Dunning Akışı

Başarısız ödemeye (PaymentAttempt.status = 'failed') sonra:

```
Deneme 1 (hemen)     ← ödeme başarısız
  ↓ (3 gün geç)
Deneme 2             ← dunning service tetiklenir
  ↓ (7 gün geç)
Deneme 3             ← dunning service tetiklenir
  ↓ (14 gün geç)
Iptal                ← subscription.status = 'cancelled'
```

#### Algoritma

```
1. past_due abonelikler bul
2. Her abonelik için:
   a. PaymentAttempt sayısı say
   b. Dunning delays oku: [3, 7, 14] (platform_settings)
   c. Max deneme sayısını aştı mı? → cancelled yap
   d. Bir sonraki deneme zamanı gelmişi mi?
   e. Gelmiş → PaymentService.charge() çağır
   f. Başarılı → status = 'active', past_due kaldır
   g. Başarısız → nextAttemptAt = now + delays[nextAttempt] gün
3. Müşteriye e-posta gönder
   "Ödeme başarısız. {gün} gün sonra yeniden deneyelim."
```

#### Metodlar

**`processDunning(): Promise<void>`** ← @Cron

Günlük dunning döngüsü.

**`processSingle(sub, now, counters): Promise<void>`** (private)

Tek abonelik için dunning işlemi.

**`getAttemptCount(subscriptionId): Promise<number>`** (private)

PaymentAttempt sayısı.

**`calcNextAttemptDate(lastUpdate, attemptCount): Promise<Date>`** (private)

Bir sonraki deneme tarihi:
```
delays = platform_settings['dunning_delays'] // [3, 7, 14]
nextAttemptAt = lastUpdate + delays[attemptCount] gün
```

---

### 4. RateLimitSyncService — Kong Rate Limit Senkronizasyonu

```typescript
async syncTenant(tenantId: string, planId: string): Promise<void>
```

Kong API Gateway'e rate-limit tier'ını yaz:
```
starter   → 100 req/min, 10,000 req/gün
business  → 500 req/min, 50,000 req/gün
enterprise → sınırsız
```

Redis key formatı:
```
rate_limit:tenant:{tenantId} = { plan: 'starter', limit_per_min: 100, ... }
```

---

### 5. PlatformSettingsService — Platform Ayarları

Control plane DB'deki `platform_settings` tablosundan okur/yazar:

```typescript
async get<T>(key: string, defaultValue: T): Promise<T>
async set<T>(key: string, value: T): Promise<void>
```

**Mevcut keys:**

| Key | Tipi | Varsayılan | Açıklama |
|-----|------|-----------|---------|
| `trial_days` | number | 14 | Deneme süresi günü |
| `dunning_delays` | number[] | [3, 7, 14] | Dunning deneme gecikmeleri (gün) |
| `dunning_max_retries` | number | 3 | Max deneme sayısı |
| `invoice_pdf_retention_days` | number | 365 | Fatura PDF saklama süresi |

---

## iyzico Entegrasyonu

### IyzicoClient — API İstemcisi

#### Kimlik Doğrulama (PKI)

```typescript
Authorization: IYZWS <apiKey>:<signature>
signature = base64(sha256(apiKey + randomKey + secretKey + sortedBody))
```

Örnek:
```
Authorization: IYZWS sandbox-api-key:aB3fGhIjK2lMnOpQ5rStUvWxYzA1B2cD3eF4gHiJ=
```

#### Metodlar

**`createSubscription(params: IyzicoSubscribeRequest): Promise<IyzicoSubscribeResult>`**

Subscription oluştur (abonelik başlatmada):
```
POST /v2/subscription/create

Request body:
{
  "customerId": "tenant-{tenantId}",
  "customerEmail": "billing@firma.com.tr",
  "customerName": "ABC Teknoloji",
  "pricingPlanReferenceCode": plan.iyzicoplanRef,
  "cardUserKey": tenant.id,
  "card": {
    "cardHolderName": "AHMET YILMAZ",
    "cardNumber": "5528790000000008",
    "expireMonth": "12",
    "expireYear": "2030",
    "cvc": "123"
  }
}

Response:
{
  "status": "success",
  "subscriptionReferenceCode": "..."  ← DB'ye kaydet
  "customerReferenceCode": "..."
  "cardToken": "..."  ← PCI: Sadece bu saklanır
}
```

**`chargeCard(params: IyzicoChargeRequest): Promise<IyzicoChargeResult>`**

Kart tahsilat (ödeme döneminde):
```
POST /v2/subscription/charge

Request body:
{
  "subscriptionReferenceCode": subscription.iyzicoSubscriptionRef,
  "customerReferenceCode": subscription.iyzicoCustomerRef,
  "cardToken": subscription.iyzicoCardToken,
  "amount": amountKurus / 100,  ← TL'ye çevir
  "currency": "TRY"
}

Response:
{
  "status": "success" | "failure",
  "paymentId": "100123456",
  "errorMessage": "Yetersiz bakiye"
}
```

#### Test Kartları

| Kart | Sonuç |
|------|-------|
| 5528790000000008 | ✅ Başarılı |
| 5400010000000004 | ❌ Yetersiz bakiye |
| 5406670000000009 | ❌ Hatalı CVC |

---

## REST API Endpoint'leri

### Planlar

**`GET /api/v1/plans`**
- Aktif abonelik planlarını listele
- Auth: Yok (public)
- Response: `BillingPlan[]`

```bash
curl http://localhost:3008/api/v1/plans
```

### Abonelikler

**`GET /api/v1/subscriptions/:tenantId`**
- Tenant'ın aboneliğini getir
- Auth: JWT Bearer
- Response: `Subscription | null`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3008/api/v1/subscriptions/550e8400-e29b-41d4-a716-446655440000
```

**`POST /api/v1/subscriptions`**
- Yeni abonelik başlat (trial 14 gün)
- Auth: JWT Bearer
- Body:
```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "planId": "starter",
  "email": "billing@firma.com.tr",
  "companyName": "ABC Teknoloji A.Ş.",
  "card": {
    "cardHolderName": "AHMET YILMAZ",
    "cardNumber": "5528790000000008",
    "expireMonth": "12",
    "expireYear": "2030",
    "cvc": "123"
  }
}
```
- Response: `Subscription` (status: 'trialing')

**`PATCH /api/v1/subscriptions/:tenantId/card`**
- Kart ekle veya güncelle (onboarding adım 2)
- Auth: JWT Bearer
- Body:
```json
{
  "card": { ... }
}
```

**`PATCH /api/v1/subscriptions/:tenantId/plan`**
- Plan geçişi (upgrade/downgrade)
- Auth: JWT Bearer
- Body:
```json
{
  "planId": "business"
}
```

**`POST /api/v1/subscriptions/:tenantId/cancel`**
- Aboneliği iptal et
- Auth: JWT Bearer
- Body:
```json
{
  "immediate": false
}
```
- Response: 204 No Content

**`POST /api/v1/admin/process-renewals`** ← Admin
- Yenileme işlemini manuel tetikle
- Auth: JWT Bearer + PlatformAdmin role
- Response: 204 No Content

---

## RabbitMQ Entegrasyonu

### TenantEventsConsumer

Tenant servisinden gelen olayları tüketir.

**Exchange:** `enkap` (topic)
**Queue:** `billing.tenant-events`
**Routing Key:** `tenant.billing.#`
**DLQ:** `billing.tenant-events.dlq`

#### Olaylar

**`tenant.billing.subscription.created`**

Tenant provisioning sonrası yeni abonelik oluştur:

```json
{
  "tenantId": "550e8400-e29b-41d4-a716-446655440000",
  "planId": "starter",
  "email": "billing@firma.com.tr",
  "companyName": "ABC Teknoloji A.Ş.",
  "card": {
    "cardHolderName": "AHMET YILMAZ",
    "cardNumber": "5528790000000008",
    "expireMonth": "12",
    "expireYear": "2030",
    "cvc": "123"
  }
}
```

Consumer tarafından SubscriptionService.startSubscription() çağrılır.

---

## Kod Örnekleri

### Yeni Tenant Kayıt Akışı (Frontend)

```typescript
// 1. Plan seç
const plans = await billingApi.getPlans();
// [{ id: 'starter', name: '...', priceKurus: 49900, ... }]

// 2. Abonelik başlat (trial, kart isteğe bağlı)
const subscription = await billingApi.startSubscription({
  tenantId: tenant.id,
  planId: 'starter',
  email: form.billingEmail,
  companyName: form.companyName,
  // card: { ... }  ← isteğe bağlı
});

// subscription.status = 'trialing'
// subscription.trialEndsAt = 14 gün sonra

// 3. Onboarding wizard adım 2: Kart ekle
const updated = await billingApi.addCard(tenant.id, {
  cardHolderName: 'AHMET YILMAZ',
  cardNumber: '5528790000000008',
  expireMonth: '12',
  expireYear: '2030',
  cvc: '123',
});

// SubscriptionService → iyzico kaydı
// updated.iyzicoSubscriptionRef = '...'
// updated.iyzicoCardToken = '...'
```

### Ödeme Döneminin Otomatik Yenilenmesi

```typescript
// DunningService @Cron görevinden:
// 1. Yenileme tarihi geçmiş abonelikler bul
const subToRenew = await subscriptionRepo.find({
  where: { currentPeriodEnd: LessThanOrEqual(now) }
});

// 2. Her biri için charge
for (const sub of subToRenew) {
  const plan = await planRepo.findOne({ where: { id: sub.planId } });
  const result = await paymentService.charge({
    subscription: sub,
    amountKurus: plan.priceKurus,
    plan
  });

  if (result.success) {
    sub.status = 'active';
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    // E-posta: "Yenileme başarılı"
  } else {
    sub.status = 'past_due';
    // DunningService @Cron tarafından 3 gün sonra tetiklenecek
  }
}
```

### Dunning E-posta (Template)

```
Subject: ⚠️ Ödeme Başarısız Oldu

Merhaba {{companyName}},

{{date}}'de kullanılan karttan ödeme alınırken bir hata oluştu:

Kart: ...****{{cardLast4}}
Tutar: {{amount}} TL
Hata: {{failureReason}}

👉 Durumu düzeltmek için:
   https://app.enkap.com.tr/ayarlar/faturalandirma

⏰ 3 gün sonra otomatik olarak tekrar deneyelim.
   Başarısız olursa aboneliğiniz iptal edilecektir.

Yardımcı olmak için:
support@enkap.com.tr | +90 212 XXX XXXX

Saygılarımızla,
Enkap Ekibi
```

---

## Entegrasyon Kuralları

### 1. Billing ile Financial Service

Financial servis fatura oluşturduktan sonra billing-service tarafından da fatura kaydı yapılır:

| Servis | Tablosu | Amaç |
|--------|---------|------|
| **financial** | `invoices` | Müşteri faturaları (satış, stok, vb.) |
| **billing** | `billing_invoices` | Platform faturası (abonelik ödeme) |

### 2. Kong Rate Limit Sync

```
1. Subscription.startSubscription() → RateLimitSyncService.syncTenant()
2. Redis'e rate-limit tier yaz
3. Kong Kong API Gateway bu değerleri okur
4. Plan değiştiğinde → Redis güncelle
```

### 3. Auth Bilgilerinin Tutuşması

```typescript
// JWT payload'da bilgiler:
{
  sub: tenantId,
  plan: subscription.planId,
  rate_limit_tier: 'starter'  // billing-service'ten senkronize
}
```

### 4. Veri Tutarlılığı

- **Tek DataSource prensibi**: Tüm billing verileri `control_plane` DB'dedir
  - Schema-per-tenant yoktur
  - Tüm tenant'lar için ortaktır
- **Tenant izolasyonu**: SQL queries'de `WHERE tenant_id = $1` zorunlu

---

## Hata Kodları

### API Hatalar

| Status | Kodu | Açıklama |
|--------|------|---------|
| 400 | `PLAN_NOT_FOUND` | Plan bulunamadı |
| 400 | `SUBSCRIPTION_DUPLICATE` | Tenant'ın zaten aktif aboneliği var |
| 400 | `CARD_REGISTRATION_FAILED` | iyzico kart kaydı başarısız |
| 400 | `INVALID_PLAN_TRANSITION` | Geçersiz plan geçişi |
| 404 | `SUBSCRIPTION_NOT_FOUND` | Abonelik bulunamadı |
| 409 | `SUBSCRIPTION_ALREADY_CANCELLED` | Abonelik zaten iptal |

### iyzico Hatalar

| Error Code | Açıklama |
|-----------|---------|
| 1000 | Başarılı |
| 1001 | Kart numarası hatalı |
| 1002 | Yetersiz bakiye |
| 1003 | Kartın süresi dolmuş |
| 1004 | Hatalı CVV |

---

## Testing

### Unit Tests

```bash
pnpm --filter @enkap/billing-service test:unit
```

**SubscriptionService tests:**
- `getPlans()` — aktif planları döner
- `startSubscription()` — trial başlatır
- `startSubscription()` — kart varsa iyzico'ya kaydeder
- `addCard()` — mevcut aboneliğe kart ekler

**PaymentService tests:**
- `charge()` — başarılı ödeme kaydeder
- `charge()` — başarısız ödemeyi tutturur
- `charge()` — BillingInvoice oluşturur

**DunningService tests:**
- `processDunning()` — past_due abonelikleri denetler
- `processDunning()` — max retry aşıldığında iptal eder

### E2E Tests

```bash
pnpm --filter @enkap/billing-service test:e2e
```

Flows:
- Trial → Active (kart ekleme)
- Active → Past_Due (ödeme başarısız)
- Past_Due → Active (dunning başarılı)
- Past_Due → Cancelled (max retry)

### iyzico Sandbox Test Kartları

```
Başarılı:  5528790000000008
Başarısız: 5400010000000004
```

---

## Troubleshooting

### "Bu tenant için zaten bir abonelik mevcut"

**Sebep:** Subscription tablosunda duplicate
**Çözüm:** `DELETE FROM subscriptions WHERE tenant_id = $1` (dev ortamı)

### Dunning çalışmıyor

**Sebep 1:** Cron timezone yanlış
```typescript
// ✅ Doğru
@Cron('0 6 * * *', { timeZone: 'Europe/Istanbul' })

// ❌ Yanlış
@Cron('0 6 * * *')  // UTC
```

**Sebep 2:** RabbitMQ bağlantısı yok
```bash
docker-compose ps rabbitmq
```

### PDF oluşturulmuyor

**Sebep:** DejaVu font eksik
```bash
# nestjs.Dockerfile
RUN apk add --no-cache font-dejavu
```

---

## Referanslar

- iyzico Dev: https://dev.iyzipay.com
- Abonelik Pattern: https://stripe.com/docs/subscriptions
- Dunning Best Practices: https://www.chargebee.com/dunning/


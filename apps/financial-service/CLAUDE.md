# Financial-Service — Enkap ERP Mali Muhasebe Servisi

Türkiye'ye özgü **muhasebe, faturalama, vergi uyumu** ve **uluslararası ticaret** alanında uzmanlaştırılmış NestJS servisi. Port **:3003**.

---

## Servis Sorumluluğu

**Financial-Service**, aşağıdaki alan ve işlemlerin **merkezi yönetim noktası**:

1. **Faturalama (InvoiceModule)** — Satış (OUT) ve Alış (IN) faturaları, ödeme planı yönetimi, PO eşleştirmesi
2. **GIB e-Belge Entegrasyonu (GibModule)** — UBL-TR XML imzalama, MTOM SOAP, zarf yaşam döngüsü, e-Arşiv raporlama
3. **e-Defter (EdEfterModule)** — Yevmiye (journal entry), Büyük Defter, Muhasebeleştirme
4. **KDV Yönetimi (KdvModule)** — %0, %1, %10, %20 oranları, KDV tamamlama analizi, TDHP uyumu
5. **AR/AP (Accounts Receivable/Payable)** — Alacak/Borç takibi, yaşlandırma (aging), tahsil/ödeme
6. **Duran Varlık (AssetModule)** — Sabit kıymet, amortisman, maliyet analizi
7. **Proje Yönetimi (ProjectModule)** — Proje, görev, maliyet takibi
8. **Bütçe (BudgetModule)** — Bütçe planlama, varyans analizi
9. **Kur Yönetimi (CurrencyModule)** — TCMB kur güncellemesi, çoklu para birimi (TRY, USD, EUR, AED, SAR)
10. **Bölgesel Uyum** — UAE FTA VAT (UaeModule), KSA ZATCA (KsaModule)

---

## Modül Yapısı

```
apps/financial-service/src/
├── main.ts                   — Uygulama başlama noktası
├── app.module.ts             — Root modul (tüm modüller import)
├── invoice/                  — Fatura CRUD, ödeme planı, PO eşleştirmesi
│   ├── entities/
│   │   ├── invoice.entity.ts — Fatura başlığı (id, tenant_id, direction, document_behavior)
│   │   └── invoice-line.entity.ts — Fatura satırları
│   ├── invoice.service.ts    — İş mantığı (oluştur, onayla, iptal)
│   ├── invoice.controller.ts — REST API
│   ├── po-match.service.ts   — Fatura ← Satın Alma Siparişi eşleştirmesi
│   └── dto/
├── gib/                      — GIB e-Belge (e-Fatura, e-İrsaliye, e-Arşiv)
│   ├── entities/
│   │   ├── gib-envelope.entity.ts        — Zarf (status, uuid, retry)
│   │   └── application-response.entity.ts — GIB yanıtları
│   ├── ubl-builder.service.ts            — UBL-TR 2.1 XML üretimi
│   ├── mtom-soap.service.ts              — MTOM SOAP iletişimi
│   ├── gib-submission.service.ts         — İmzala → ZIP → MTOM gönder
│   ├── gib-polling.service.ts            — getApplicationResponse polling
│   ├── gib-envelope.service.ts           — Zarf yaşam döngüsü
│   ├── application-response.service.ts   — Kabul/Red yanıtları (8 gün kuralı)
│   ├── archive-reporting.service.ts      — e-Arşiv batch (23:59 cron)
│   ├── archive-report-builder.service.ts — eArsivRaporu XML
│   ├── gib-inbox.service.ts              — PUSH listener (gelen zarflar)
│   ├── gib-inbox-processor.service.ts    — Gelen zarfı yönlendir
│   ├── gib-audit.service.ts              — ÖEBSD SIS.5 denetim İzi (control_plane)
│   ├── document-behavior.ts              — ENVELOPE vs REPORTING routing
│   ├── sectoral-validator.pipe.ts        — SGK/ENERJI/İLAÇ sektörel alan validasyonu
│   └── gib.controller.ts                 — REST endpoints
├── edefter/                  — Muhasebe Defter Yönetimi
│   ├── entities/
│   │   ├── journal-entry.entity.ts
│   │   └── journal-entry-line.entity.ts
│   ├── yevmiye/
│   │   └── yevmiye-builder.service.ts    — Yevmiye kaydı oluşturma
│   ├── buyukdefter/
│   │   └── buyukdefter.service.ts        — Büyük defter sorgulama
│   ├── edefter.service.ts
│   └── edefter.controller.ts
├── kdv/                      — KDV Hesaplama ve Yönetimi
│   ├── kdv.engine.ts         — KDV %0/%1/%10/%20 hesaplama
│   ├── kdv.types.ts
│   └── kdv.module.ts
├── ar-ap/                    — Alacak / Borç Takibi
│   ├── reminder.service.ts   — Vadesi geçmiş hatırlatması
│   ├── entities/
│   │   └── ar-ap-aging.entity.ts
│   └── ar-ap.service.ts
├── asset/                    — Duran Varlık Yönetimi
│   ├── entities/
│   │   ├── fixed-asset.entity.ts       — Sabit kıymet
│   │   └── asset-depreciation.entity.ts — Amortisman çizelgesi
│   ├── asset.service.ts
│   ├── vuk-useful-life.ts  — VUK yararlanma ömrü tablosu
│   └── asset.controller.ts
├── project/                  — Proje Yönetimi
│   ├── entities/
│   │   ├── project.entity.ts
│   │   ├── project-task.entity.ts
│   │   └── project-cost.entity.ts
│   └── project.service.ts
├── budget/                   — Bütçe Planlama
│   ├── entities/
│   │   └── budget.entity.ts
│   └── budget.service.ts
├── currency/                 — Kur Yönetimi (TCMB)
│   ├── entities/
│   │   └── exchange-rate.entity.ts
│   ├── currency.service.ts   — @Cron: Her gün TCMB kuru çek
│   └── currency.controller.ts
├── babs/                     — Bilanço ve Gelir Tablosu
│   └── babs.service.ts
├── journal-entry/            — Harici Servisler İçin Yevmiye Endpoint'i
│   └── journal-entry.controller.ts — Fleet, HR vb. yevmiye INSERT edebilir
├── uae/                      — UAE FTA VAT + Peppol BIS 3.0
│   └── uae.service.ts
├── ksa/                      — KSA ZATCA Phase 2 + Zakat
│   ├── zatca/
│   │   ├── zatca-builder.service.ts
│   │   ├── zatca-submission.service.ts
│   │   └── csid.service.ts
│   ├── zakat/
│   │   └── zakat.calculator.ts
│   └── ksa.controller.ts
├── events/                   — RabbitMQ Event Tüketicileri
│   ├── hr-events.consumer.ts         — Bordro kesinleşme → yevmiye (770/360/361/335)
│   └── treasury-events.consumer.ts   — Ödeme → AP/AR kapatma + yevmiye
├── reporting/                — PDF/Excel Raporlama
│   └── reporting.module.ts
├── shared/                   — Para Birimi Araçları
│   └── money.ts             — Para işlemleri
└── account/                  — Muhasebe Hesapları
    ├── account.service.ts
    └── account.controller.ts
```

---

## GIB Module — Kritik Mimarileri

### Routing: ENVELOPE vs REPORTING

**DocumentBehavior** (`document-behavior.ts`), ProfileID'ye göre **otomatik** yönlendirme:

| `DocumentBehavior` | ProfileID'ler | Protokol | Timing | Endpoint |
|-------------------|---------------|----------|--------|----------|
| **ENVELOPE** | TICARIFATURA, TEMELFATURA, EARSIVFATURA (B2B), e-İrsaliye | MTOM SOAP 1.2 (anlık) | İmzalan → ZIP → gönder | `sendDocument` |
| **REPORTING** | EARSIVFATURA (B2C), ESMM, EMM, EBILET, EADISYON, EDÖVIZ | MTOM SOAP 1.2 (günlük batch) | Her gün 23:59 cron | `sendDocumentFile` + `getBatchStatus` |

**Kulllanım:**
```typescript
import { getDocumentBehavior } from './document-behavior';
const behavior = getDocumentBehavior(profileId);
// behavior === 'ENVELOPE' || 'REPORTING'
```

### İki Mali Mühür Kural

```typescript
// ENVELOPE: Tenant'ın kendi sertifikası
signerType: 'TENANT'  // env: GIB_SIGNER_ENDPOINT
// REPORTING: Enkap entegratör mühürü (B2C e-Arşiv vb.)
signerType: 'INTEGRATOR'  // env: GIB_INTEGRATOR_SIGNER_ENDPOINT
```

### ENVELOPE Akışı (e-Fatura, e-İrsaliye)

```
1. UblBuilderService.buildInvoiceUbl() → UBL-TR XML
2. GibSubmissionService.submitInvoice()
   ├─ MtomSoapService.signDocument(xml, signerType: 'TENANT')
   ├─ ZIP + MD5 hash
   ├─ MTOM SOAP sendDocument → GİB
   └─ GibEnvelopeService.create() → gib_envelopes durumu=1000 (WAITING_FOR_RESPONSE)
3. GibPollingService.pollApplicationResponses() [@Cron 5 saatte bir]
   ├─ GIB'den getApplicationResponse()
   ├─ GibEnvelopeService.updateStatus() → 1300 (SUCCESS) / 1140+ (FAILED)
   └─ ApplicationResponseService.processResponse()
4. TICARIFATURA ise: 8 gün (192 saat) kuralı → ApplicationResponseService.enforceTimeline()
```

**Durum kodları:**
- `1000` = WAITING_FOR_RESPONSE (başlangıç)
- `1220` = PROCESSING (GİB işliyor)
- `1300` = SUCCESS (kabul)
- `1140/1150/1160` = FAILED (hata)

### REPORTING Akışı (e-Arşiv, e-SMM)

```
1. UblBuilderService.buildInvoiceUbl() → UBL-TR XML
2. ArchiveReportingService.collectDailyBatch() [@Cron 23:59]
   ├─ O güne ait tüm REPORTING belgelerini topla
   └─ ArchiveReportBuilderService.buildEArsivRaporu()
3. eArsivRaporu UBL-TR XML
   ├─ MtomSoapService.signDocument(xml, signerType: 'INTEGRATOR')
   ├─ MTOM SOAP sendDocumentFile → GİB e-Arşiv SOAP API
   └─ GibEnvelopeService.create() → document_behavior='REPORTING', gib_reference_number=paketId
4. ArchiveReportingService.checkBatchStatus() → getBatchStatus(paketId)
   ├─ durumKodu=0 → başarı
   ├─ durumKodu=1+ → hata, retry düşün
```

**PDF Zorunlu İbaresi (e-Arşiv):**
```
"e-Arşiv İzni Kapsamında Elektronik Ortamda İletilmiştir"
```

**QR Kod Zorunlu (sağ üst):** GIB JSON formatı, 90×90pt, QR verisi ProfileID'ye göre değişir.

---

## Entity'ler (Kritik Sütunlar)

### invoices
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL (RLS aktif)
invoice_number VARCHAR(50) — IRS-{YYYY}-{NNNN} gibi
direction VARCHAR(2) NOT NULL — 'IN' (alış) / 'OUT' (satış)
document_behavior VARCHAR(10) — 'ENVELOPE' / 'REPORTING' (GIB)
total_amount_kurus BIGINT — kuruş cinsinden
is_draft BOOLEAN
is_approved BOOLEAN
is_cancelled BOOLEAN
cancelled_reason TEXT
gib_uuid VARCHAR(36) — ETTN (e-belge takip numarası)
purchase_order_id UUID — PO eşleştirmesi
sales_order_id UUID — Satış siparişi eşleştirmesi
created_at TIMESTAMP
updated_at TIMESTAMP
```

### gib_envelopes
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL
invoice_id UUID — fatura referansı
document_type VARCHAR(20) — INVOICE / WAYBILL
status_code INT — 1000/1220/1300/1140+
gib_reference_number VARCHAR(36) — GIB paketId / ETTN
retry_count INT DEFAULT 0
last_error TEXT
last_polled_at TIMESTAMP
created_at TIMESTAMP
```

### application_responses
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL
envelope_id UUID
response_code INT
is_accepted BOOLEAN — TRUE/FALSE
created_at TIMESTAMP
```

### e_archive_reports
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL
report_date DATE — raporun oluşturulduğu tarih
gib_reference_number VARCHAR(36) — GIB paketId
retry_count INT
last_error TEXT
invoice_count INT
created_at TIMESTAMP
```

### journal_entries
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL
entry_number VARCHAR(50) — BRD-{YYYY-MM}-123456 vb.
entry_date DATE
description TEXT
reference_type VARCHAR(20) — 'HR_PAYROLL', 'PAYMENT', 'OPENING_BALANCE'
reference_id UUID
is_posted BOOLEAN
posted_at TIMESTAMP
```

### journal_entry_lines
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL
entry_id UUID REFERENCES journal_entries
account_code VARCHAR(10) — 102, 120, 320, 360, 361, 335, 770 vb.
debit_amount NUMERIC(15,2)
credit_amount NUMERIC(15,2)
```

### fixed_assets
```sql
id UUID PRIMARY KEY
tenant_id UUID NOT NULL
asset_code VARCHAR(50)
asset_name VARCHAR(255)
useful_life_years INT — VUK tablosundan
acquisition_date DATE
original_cost_kurus BIGINT
accumulated_depreciation_kurus BIGINT DEFAULT 0
```

---

## API Endpoint'leri

### Invoice Module

```http
POST   /api/v1/invoices                    — Fatura oluştur
GET    /api/v1/invoices                    — Faturalar listele (direction filtresi)
GET    /api/v1/invoices/:id                — Fatura detayı
PATCH  /api/v1/invoices/:id                — Fatura güncelle (draft ise)
POST   /api/v1/invoices/:id/approve        — Onayla
POST   /api/v1/invoices/:id/cancel         — İptal { reason: string }
POST   /api/v1/invoices/:id/payment-plan   — Ödeme planı oluştur
GET    /api/v1/invoices/po-match           — PO eşleştirmesi sorgula
```

### GIB Module

```http
POST   /api/v1/gib/invoices/send                      — ENVELOPE faturasını GIB'e gönder
POST   /api/v1/gib/invoices/:id/application-response  — Kabul/Red yanıtı
GET    /api/v1/gib/envelopes/:id                      — Zarf durum sorgula
POST   /api/v1/gib/invoices/:id/archive-send         — REPORTING faturasını ilet
GET    /api/v1/gib/archive-reports                   — Günlük e-Arşiv raporları listele
POST   /api/v1/gib/invoices/:id/cancel               — İptal { reason: string }
```

### EdEfter Module

```http
GET    /api/v1/edefter/yevmiye                       — Yevmiye listesi
GET    /api/v1/edefter/yevmiye/:id                   — Yevmiye detayı
GET    /api/v1/edefter/buyukdefter                   — Büyük defter sorgula (account_code filtresi)
GET    /api/v1/edefter/balance-sheet                 — Bilanço
GET    /api/v1/edefter/income-statement              — Gelir tablosu
```

### AR/AP Module

```http
GET    /api/v1/ar-ap/aging                          — Yaşlandırma (5 dilim)
POST   /api/v1/ar-ap/reminder/send-overdue           — Vadesi geçmiş bildirim gönder
```

### Asset Module

```http
POST   /api/v1/assets                      — Varlık oluştur
GET    /api/v1/assets                      — Varlıklar listele
PATCH  /api/v1/assets/:id                  — Varlık güncelle
POST   /api/v1/assets/:id/depreciate       — Amortisman
POST   /api/v1/assets/:id/dispose          — Satış/elden çıkartma
```

### Currency Module

```http
GET    /api/v1/currency/rates              — Cari kur bilgileri
POST   /api/v1/currency/rates              — Manuel kur gir
GET    /api/v1/currency/rates/:code        — Spesifik kur
```

### Journal Entry (Harici Servisler)

```http
POST   /api/v1/journal-entries             — Fleet/HR yevmiye INSERT (ServiceAccount)
GET    /api/v1/journal-entries             — Yevmiye listesi
```

---

## RabbitMQ Event Tüketicileri

### HrEventsConsumer

**Routing Key:** `hr.payroll.finalized`

**Event:** `HrPayrollFinalizedEvent`
```typescript
{
  tenantId: UUID;
  periodYear: number;
  periodMonth: number;
  employeeCount: number;
  totalGrossKurus: number;      // Brüt ücret
  totalNetKurus: number;        // Net ücret
  totalIncomeTaxKurus: number;  // Gelir vergisi
  totalStampTaxKurus: number;   // Damga vergisi
  totalSgkWorkerKurus: number;  // SGK işçi payı
  totalSgkEmployerKurus: number; // SGK işveren payı
  approvedBy: UUID;
}
```

**İşlem:** Yevmiye kaydı oluştur (TDHP):
```
BORÇ  770 Genel Yönetim Giderleri = brüt + SGK işveren
ALACAK 360 Ödenecek Vergi ve Fonlar = gelir vergi + damga vergi
ALACAK 361 SGK Kesintileri = SGK işçi + SGK işveren
ALACAK 335 Personele Borç Edilen Ücret = net ücret
```

**Doğrulama:** `BORÇ = ALACAK` (dengeli muhasebe)

### TreasuryEventsConsumer

**Routing Key:** `treasury.payment.#`

**Event:** `PaymentCreatedEvent`
```typescript
{
  tenantId: UUID;
  invoiceId: UUID;
  amountKurus: number;
  transactionId: UUID;
  transactionDate: string;
  createdBy: UUID;
}
```

**İşlem:**
1. Faturanın ödeme planındaki ilk ödenmemiş taksiti "ödendi" işaretle
2. Ödeme yevmiye kaydı:
   - **Alış (IN):** BORÇ 320 (Satıcılar) / ALACAK 102 (Bankalar)
   - **Satış (OUT):** BORÇ 102 (Bankalar) / ALACAK 120 (Alıcılar)

---

## Cron Jobs

### CurrencyService.fetchAndUpdateExchangeRates()
- **Schedule:** `@Cron('0 2 * * *')` — Her gün 02:00 UTC
- **İşlem:** TCMB'den TRY/USD, TRY/EUR, TRY/AED, TRY/SAR kuru çek
- **Persistence:** `exchange_rates` tablosuna INSERT

### ArchiveReportingService.collectAndSendDailyBatch()
- **Schedule:** `@Cron('0 23 * * *')` — Her gün 23:59 UTC
- **İşlem:** O güne ait REPORTING belgelerini topla → eArsivRaporu → MTOM SOAP gönder

### GibPollingService.pollApplicationResponses()
- **Schedule:** `@Cron('0 */5 * * *')` — 5 saatte bir
- **İşlem:** GİB'den tüm aktif zarflar için `getApplicationResponse()` çek

---

## Kritik Kod Yazma Kuralları

### 1. Para Birimi — Her Zaman Kuruş

```typescript
// ✅ Doğru
const amountKurus: bigint = 123456n;  // 1234.56 TL
const amountTl = amountKurus / 100n;

// ❌ Yasak — kuruş, TL cinsinde DB'ye yazma
const amountTl: number = 1234.56;
```

### 2. TDHP Yevmiye — Dengeyi Kontrol Et

```typescript
// Her yevmiye INSERT'ten sonra
const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
const diff = Math.abs(totalDebit - totalCredit);
if (diff > 0.01) throw new Error('Muhasebe dengesi bozuk');
```

### 3. RabbitMQ — Idempotency

```typescript
// reference_type + reference_id unique constraint ile mükerrer kontrol
const existing = await ds.query(
  `SELECT id FROM journal_entries
   WHERE tenant_id = $1 AND reference_type = $2 AND reference_id = $3
   LIMIT 1`,
  [tenantId, 'HR_PAYROLL', `${tenantId}_${period}`],
);
if (existing.length > 0) {
  logger.warn('Idempotent: yevmiye zaten mevcut');
  return;
}
```

### 4. GIB Submission — senderAlias Hiyerarşisi

```typescript
// tenant_profiles.gib_gb_alias'ı kullan, yoksa fallback
const senderAlias = dto.senderAlias ?? seller.gbAlias ?? undefined;
```

### 5. Tenant İzolasyonu — Asla Atlama

```typescript
// ✅ Doğru
@UseGuards(TenantGuard)
async createInvoice(dto: CreateInvoiceDto) {
  const ctx = getTenantContext();
  // ctx.tenantId otomatik kullanılır
}

// ❌ Yasak — manual tenant_id parametre geçişi
async createInvoice(tenantId: UUID, dto: CreateInvoiceDto) {
  // yanışlıkla başka tenant'ın verisi erişilebilir
}
```

### 6. Fatura Yönü Kontrol Et

```typescript
// IN (alış) vs OUT (satış) — AP/AR açısından kritik
if (invoice.direction === 'IN') {
  // AP (Borç) — Satıcılara borcu kapat
  const accountCode = '320';
} else {
  // AR (Alacak) — Alıcılardan al
  const accountCode = '120';
}
```

### 7. GIB Tarafında Null/Undefined Kontrol

```typescript
// GIB API'si boş response dönebilir
const response = await mtomService.getApplicationResponse(...);
if (!response?.applicationResponse?.length) {
  logger.debug('GİB yanıt boş, sonra tekrar deneyelim');
  return;
}
```

### 8. Date Formatı — ISO 8601 (DB), dd.MM.yyyy (GIB)

```typescript
// DB: ISO 8601
const dateIso = new Date().toISOString(); // 2026-04-03T...Z

// GIB XML/UBL: dd.MM.yyyy Türkçe formatı
const dateGib = formatDate(date, 'dd.MM.yyyy');  // 03.04.2026
```

### 9. Log Seviyesi

```typescript
// İş mantığı bilgileri: info
this.logger.log('Fatura oluşturuldu', { invoiceId, amount });

// Operasyonel uyarılar: warn
this.logger.warn('GIB yanıtı boş, retry gerekli');

// Hata: error
this.logger.error('GIB submission başarısız', { error, invoiceId });

// Debug: debug
this.logger.debug('Processing envelope', { envelopeId, status });
```

---

## Veritabanı Migrasyonu

Tüm DDL (Data Definition Language) **tenant-service/src/provisioning/migration-runner.ts** ve **control_plane** için **apps/tenant-service** tarafından yönetilir.

**Finansal modüllere özgü migration'lar:**

| Version | Açıklama |
|---------|---------|
| V001–V047 | Temel finansal entity'leri (invoices, journal_entries, gib_envelopes vb.) |
| CP013 | GIB denetim günlüğü (gib_audit_logs, INSERT-ONLY) |
| V055 | Avans tablosu (HR ile entegrasyonu) |
| V060 | Bordro BES/İcra/Fazla Mesai/Avans sütunları |

**Finance-Service'te asla DDL çalıştırma:**
```typescript
// ❌ Yasak
async onModuleInit() {
  await this.db.query('CREATE TABLE IF NOT EXISTS invoices (...)');
}

// ✅ Doğru — migration'da tanımlanır, servis sadece kullanır
@InjectRepository(Invoice)
private invoiceRepo: Repository<Invoice>
```

---

## Environment Değişkenleri

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `DATABASE_URL` | Tenant DataSource | `postgresql://user:pass@host:5432/enkap` |
| `CONTROL_PLANE_DATABASE_URL` | Control plane DataSource | fallback: `DATABASE_URL` |
| `GIB_API_URL` | GIB e-Belge API | `https://earsivportaltest.efatura.gov.tr/...` |
| `GIB_SIGNER_ENDPOINT` | Tenant mali mühür | `https://signing-service.example.com/sign` |
| `GIB_INTEGRATOR_SIGNER_ENDPOINT` | Enkap entegratör mühürü | `https://signing-service.example.com/sign-integrator` |
| `GIB_EARSIV_SOAP_ENDPOINT` | e-Arşiv SOAP API | `https://earsivportaltest.efatura.gov.tr/arsivservice` |
| `RABBITMQ_URL` | RabbitMQ bağlantısı | `amqp://localhost:5672` |
| `PORT` | Servis portu | `3003` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector | `http://otel-collector:4317` |

---

## Çalıştırma

```bash
# Geliştirme
pnpm --filter @enkap/financial-service dev

# Build
pnpm --filter @enkap/financial-service build

# Test
pnpm --filter @enkap/financial-service test

# Tip kontrolü
pnpm --filter @enkap/financial-service typecheck
```

---

## İlgili Belgeler

- **Ana CLAUDE.md:** `../../CLAUDE.md` — Platform mimarisi, tenant izolasyonu, kurumsal kurallar
- **UI Rules:** `../../UI_RULES.md` — Dashboard sayfaları stil rehberi
- **Data Page Rules:** `../../ui_data_rule.md` — DataTable, KPI, filtre yapısı
- **Eksik Filtreler:** `../../eksik_filtreler.md` — UI'da var ama backend'de yok olanlar

---

## Kod Yazarken İlişkili Komutlar

```bash
# Yazım kontrolü ve formatı
pnpm --filter @enkap/financial-service typecheck
pnpm eslint src --fix

# Test çalıştır
pnpm --filter @enkap/financial-service test
pnpm --filter @enkap/financial-service test:e2e

# Bağımlılık kontrol
pnpm --filter @enkap/financial-service why [package-name]
```

---

## Debugging Tips

### GIB Submission Hataları

1. **Mock modunun etkin olup olmadığını kontrol et:**
   ```bash
   curl -X POST http://localhost:3003/api/v1/gib/invoices/send \
     -H "Content-Type: application/json" \
     -d '{"invoiceId":"..."}'
   ```

2. **Zarf durumunu kontrol et:**
   ```sql
   SELECT id, status_code, last_error FROM gib_envelopes
   WHERE invoice_id = '...' LIMIT 1;
   ```

3. **SOAP iletişimini izle:**
   ```typescript
   // mtom-soap.service.ts'de axios interceptor'ı etkinleştir
   console.log('SOAP Request:', soapEnvelope);
   console.log('SOAP Response:', response);
   ```

### Yevmiye Dengesi

```sql
SELECT
  entry_id,
  SUM(CASE WHEN debit_amount > 0 THEN debit_amount ELSE 0 END) AS total_debit,
  SUM(CASE WHEN credit_amount > 0 THEN credit_amount ELSE 0 END) AS total_credit
FROM journal_entry_lines
WHERE tenant_id = $1
GROUP BY entry_id
HAVING SUM(debit_amount) != SUM(credit_amount);
```

### RabbitMQ Event'i Manuel Test

```typescript
// financial-service test klasörü
const event: HrPayrollFinalizedEvent = {
  tenantId: 'test-tenant',
  periodYear: 2026,
  periodMonth: 4,
  totalGrossKurus: 100000,
  totalNetKurus: 75000,
  // ...
};
await consumer.onPayrollFinalized(event);
```

---

## Sık Sorulan Sorular

**S: Kuruş ve TL arasında nasıl dönüştürüm?**
A: `const tl = kurus / 100n;` veya `const kurus = tl * 100n;`

**S: e-Arşiv PDF'de QR kod nasıl eklenir?**
A: `@enkap/reporting` paketi `WaybillTemplate` veya `InvoiceTemplate`'de QR gömer.

**S: TICARIFATURA'nın 8 gün kuralı ne?**
A: `ApplicationResponseService.enforceTimeline()` — GIB yanıtı 8 gün (192 saat) içinde alınmazsa belgeler kabul edilir.

**S: e-Arşiv için "İmza Bilgileri" bölümü gerekli mi?**
A: Hayır — e-Arşiv PDF'lerde imza bloğu yoktur. İmza **SOAP iletişiminde** (INTEGRATOR sertifikası) gerçekleşir.

**S: Bordro yevmiye hesaplamasında SGK işveren payı iki kez sayılıyor mu?**
A: Evet, TDHP'de:
- BORÇ 770: brüt + SGK işveren (gider)
- ALACAK 361: SGK işçi + SGK işveren (vergi kesintisi)

---

**Yazılı:** 2026-04-03
**Version:** 1.0

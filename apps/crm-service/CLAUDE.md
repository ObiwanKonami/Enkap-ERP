# CRM Service — CLAUDE.md

Enkap CRM modülü için lokal geliştirme rehberi.

---

## Hızlı Başlangıç

### Port & Endpoints
- **Port:** 3009
- **API prefix:** `/api/v1`
- **Swagger:** `http://localhost:3009/docs`

### Modüller
| Modul | Dosya | Açıklama |
|-------|-------|---------|
| `ContactModule` | `src/contact/` | Müşteri ve tedarikçi kişi yönetimi (TCKN/VKN) |
| `LeadModule` | `src/lead/` | Satış fırsatları ve Kanban pipeline |
| `ActivityModule` | `src/activity/` | Çağrı, e-posta, toplantı, görev takibi |

### Veri Modeli
```
Contact (kişi)
  ├─ id: UUID
  ├─ tenantId: UUID (tenant izolasyonu)
  ├─ firstName / lastName (ad/soyad)
  ├─ companyName (şirket adı)
  ├─ vkn/tckn (vergi/kimlik numarası)
  ├─ email, phone, address, city
  ├─ source (referral/web/social/cold_call/other)
  ├─ tags (JSON array)
  ├─ ownerUserId (sorumlu satış temsilcisi)
  └─ isActive (soft delete)

Lead (fırsat/satış hattı)
  ├─ id: UUID
  ├─ contactId: UUID (ilgili kişi)
  ├─ title (fırsat başlığı)
  ├─ valueKurus (tutar, kuruş cinsinden)
  ├─ stage (new/qualified/proposal/negotiation/won/lost)
  ├─ probability (kazanma olasılığı %)
  ├─ expectedCloseDate (beklenen kapanma tarihi)
  ├─ ownerUserId (sorumlu satış temsilcisi)
  ├─ closedAt (kazanıldı/kaybedildiyse otomatik doldurulur)
  ├─ lostReason (kaybedilirse zorunlu)
  └─ weightedValueKurus (computed: valueKurus × probability / 100)

Activity (aktivite)
  ├─ id: UUID
  ├─ contactId: UUID (ilgili kişi)
  ├─ leadId: UUID | null (opsiyonel fırsat bağlantısı)
  ├─ type (call/meeting/email/task/note)
  ├─ subject (aktivite başlığı)
  ├─ body (detay notları)
  ├─ scheduledAt (planlanan zaman, task/meeting için)
  ├─ completedAt (null → bekliyor, dolu → tamamlandı)
  └─ ownerUserId (sorumlu kullanıcı)
```

---

## Contact Module

### Service: ContactService

**Raw SQL kullanımı:** TypeORM Repository API yerine `ds.query()` ile daha öngörülebilir query planları.

**CONTACT_SELECT constant:**
```typescript
const CONTACT_SELECT = `
  id,
  tenant_id AS "tenantId",
  COALESCE(company_name, first_name) AS name,
  contact_type AS type,
  email, phone, company_name AS "companyName",
  vkn, tckn, address, city,
  job_title AS "jobTitle", source, tags,
  notes, tax_office AS "taxOffice", mersis_no AS "mersisNo",
  owner_user_id AS "ownerUserId", is_active AS "isActive",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;
```

**Ana metodlar:**
- `findAll(filter)` → filtrelenmiş/sayfalanmış liste (50 kayıt varsayılan)
  - Filtreler: `ownerUserId`, `source`, `type`, `search` (ad/email/şirket ILIKE)
- `findOne(id)` → kişi detayı
- `create(dto)` → yeni kişi oluştur
- `update(id, dto)` → kişi güncelle
- `remove(id)` → soft delete (is_active = false)

**Özel kurallar:**
- `name` alanı: `companyName ?? firstName` (firma adı yoksa kişi adı)
- `tags` JSON array olarak saklanır
- Soft delete: `is_active = false` olarak işaretlenir
- `ownerUserId` → crm_contacts'in owner_user_id alanı (users tablosuna soft FK)

**Controller Endpoints:**
```
GET    /api/v1/contacts               (liste + filtre)
GET    /api/v1/contacts/:id           (detay)
POST   /api/v1/contacts               (oluştur)
PATCH  /api/v1/contacts/:id           (güncelle)
DELETE /api/v1/contacts/:id           (soft delete)
```

---

## Lead Module

### Service: LeadService

**Aşama geçiş matrisi (Kanban pipeline):**
```typescript
VALID_TRANSITIONS = {
  new:         → [qualified, lost]
  qualified:   → [proposal, lost]
  proposal:    → [negotiation, won, lost]
  negotiation: → [won, lost]
  won:         → []  (final)
  lost:        → []  (final)
}
```

**Ana metodlar:**
- `findAll(filter)` → filtrelenmiş fırsat listesi
  - Filtreler: `stage`, `ownerUserId`, `contactId`
- `findOne(id)` → fırsat detayı
- `create(dto)` → yeni fırsat oluştur (varsayılan: stage=new, probability=20%)
- `update(id, dto)` → fırsat güncelle
  - **Aşama geçişi doğrulaması:** VALID_TRANSITIONS kontrol edilir
  - **Lost kuralı:** stage=lost ise `lostReason` zorunludur
  - **Otomatik closedAt:** stage=won/lost → `closedAt = NOW()`
- `getPipelineSummary()` → Kanban özeti (her aşama için fırsat sayısı + toplam/ağırlıklı değer)

**Pipeline Özeti:**
```typescript
interface PipelineSummary {
  stage:            'new' | 'qualified' | 'proposal' | 'negotiation'
  count:            number              // fırsat sayısı
  totalValueKurus:  number              // toplam değer (kuruş)
  weightedKurus:    number              // ağırlıklı değer = SUM(valueKurus × probability / 100)
}
```

**Para birimi:** DB'de her zaman **kuruş** (bigint) saklanır.
- Frontend'de göster: `formatCurrency(kurusToTl(valueKurus))`

**Controller Endpoints:**
```
GET    /api/v1/leads                  (liste + filtre)
GET    /api/v1/leads/:id              (detay)
POST   /api/v1/leads                  (oluştur)
PATCH  /api/v1/leads/:id              (güncelle)
GET    /api/v1/leads/pipeline/summary (Kanban özeti)
```

---

## Activity Module

### Service: ActivityService

**Durum mantığı:**
```
pending:   completedAt IS NULL
completed: completedAt IS NOT NULL
overdue:   pending AND scheduledAt < NOW()
```

**Ana metodlar:**
- `findAll(filter)` → filtrelenmiş aktivite listesi
  - Filtreler: `contactId`, `leadId`, `ownerUserId`, `pending` (true/false/undefined)
  - Sıralama: `scheduled_at ASC NULLS LAST, created_at DESC`
- `findOne(id)` → aktivite detayı
- `create(dto)` → yeni aktivite oluştur
- `complete(id)` → aktiviteyi tamamlandı işaretle (completedAt = NOW())
  - Idempotent: zaten tamamlandıysa 404 fırlatır
- `overdueCount()` → dashboard widget için vadesi geçmiş bekleyen aktivite sayısı

**Activity Type'ları:**
- `call` — telefon görüşmesi
- `meeting` — yüz yüze/Zoom toplantısı
- `email` — e-posta
- `task` — atanmış görev
- `note` — serbest not (scheduledAt yok)

**Controller Endpoints:**
```
GET    /api/v1/activities                 (liste + filtre)
GET    /api/v1/activities/:id             (detay)
GET    /api/v1/activities/overdue-count   (dashboard widget)
POST   /api/v1/activities                 (oluştur)
PATCH  /api/v1/activities/:id/complete    (tamamla)
```

---

## Tenant İzolasyonu

Her istek otomatik olarak tenant'ın kendi şemasına yönlendirilir.

```typescript
// Service içinde
private async ds() {
  const { tenantId } = getTenantContext();
  return this.dsManager.getDataSource(tenantId);
}

// SQL sorguları
const rows = await ds.query('SELECT ... WHERE tenant_id = $1', [tenantId]);
```

**Kurallar:**
- `getTenantContext()` middleware'den gelir — parametre olarak geçilmez
- Her `INSERT/UPDATE` sorgusu `tenant_id` kontrol eder
- `WHERE tenant_id = $N` zorunludur (veri güvenliği)

---

## Güvenlik & RBAC

### Tüm endpoint'ler korunur:
```typescript
@UseGuards(TenantGuard, RolesGuard, FeatureGateGuard)
@Roles(Role.SATIS_TEMSILCISI)  // Satış temsilcisi
@RequiresPlan(Feature.CRM)      // CRM özelliği plan'da olmalı
```

### Feature Gate:
- `Feature.CRM` plan'da yoksa 403 Forbidden
- Tenant'ın subscription planına göre kontrol edilir

---

## Kod Kuralları

### 1. Raw SQL Sorguları
- `ds.query()` kullan — TypeORM Repository değil
- Parametreli sorgu: `$1, $2, ...` format (SQL injection koruması)
- Dinamik koşullar: `conditions` array'i ile oluştur

```typescript
const conditions: string[] = ['c.tenant_id = $1'];
const params: unknown[] = [tenantId];
let idx = 2;

if (filter.search) {
  conditions.push(`c.first_name ILIKE $${idx}`);
  params.push(`%${filter.search}%`);
  idx++;
}

const where = conditions.join(' AND ');
```

### 2. Sayfalama
- Varsayılan: page=1, limit=50
- Frontend: `page` başlayan 1 (0 değil)
- Response: `{ items: T[], total: number, page: number, limit: number }`

### 3. Para Birimi
- DB: kuruş (bigint)
- Frontend göster: `formatCurrency(kurusToTl(valueKurus))`
- Input: DTO'da `valueKurus` (kuruş)

### 4. Tarih Formatı
- ISO string: `'2026-04-03'` (YYYY-MM-DD)
- Veritabanında: `timestamptz`
- Frontend: `formatDate()` / `formatDateTime()` kullan

### 5. Logging
```typescript
private readonly logger = new Logger(ClassName.name);
this.logger.log(`Mesaj: ${id} tenant=${tenantId}`);
```

### 6. Exception Handling
- `NotFoundException` — kayıt bulunamazsa
- `BadRequestException` — validation hatası (ör. geçersiz aşama geçişi)
- Hata mesajları Türkçe, context'li

---

## Database Şeması (crm_contacts, crm_leads, crm_activities)

### crm_contacts
```sql
CREATE TABLE crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  first_name VARCHAR(200) NOT NULL,
  last_name VARCHAR(100),
  contact_type VARCHAR(20) DEFAULT 'customer',
  email VARCHAR(200),
  phone VARCHAR(30),
  company_name VARCHAR(200),
  vkn VARCHAR(10),
  tckn VARCHAR(11),
  address TEXT,
  city VARCHAR(100),
  tax_office VARCHAR(100),
  mersis_no VARCHAR(16),
  job_title VARCHAR(100),
  source VARCHAR(30),
  tags JSONB DEFAULT '[]',
  notes TEXT,
  owner_user_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### crm_leads
```sql
CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  value_kurus BIGINT DEFAULT 0,
  stage VARCHAR(30) DEFAULT 'new',
  probability SMALLINT DEFAULT 20,
  expected_close_date DATE,
  owner_user_id UUID,
  notes TEXT,
  closed_at TIMESTAMPTZ,
  lost_reason VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### crm_activities
```sql
CREATE TABLE crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  lead_id UUID,
  type VARCHAR(20) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  body TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  owner_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Geliştirme Talimatları

### Yeni Endpoint Ekleme
1. **Controller'da** `@Get/@Post/@Patch/@Delete` dekoratörü ekle
2. **Service'de** ilgili metodu implement et
3. **Swagger** açıklamasını ekle: `@ApiOperation`, `@ApiResponse`
4. **Test**: `pnpm test:e2e` ile kontrol et

### Yeni Field Ekleme
1. **Entity**'ye `@Column()` ekle
2. **Service**'de `CONTACT_SELECT` (vs.) güncelle
3. **Migration** yok (raw SQL, schema_version otomatik)
4. **DTO**'ya `@ApiProperty` ekle

### Hata Ayıklama
```bash
# Swagger UI'da endpoint test et
http://localhost:3009/docs

# Service logları
docker logs enkap_crm_service --tail 50

# SQL sorgularını debug et
# Service'de: console.log(where, params)
```

---

## Gözlemlenebilirlik

### Health Check
```bash
GET http://localhost:3009/health
```

### Metrics
```bash
GET http://localhost:3009/metrics  # Prometheus format
```

### Tracing (OpenTelemetry)
- OTEL_EXPORTER_OTLP_ENDPOINT env'ine göre (boşsa devre dışı)
- Her istek otomatik trace edilir

---

## Sık Yapılan İşlemler

### Kişi ara
```bash
curl "http://localhost:3009/api/v1/contacts?search=Ahmet&type=customer"
```

### Fırsat oluştur
```bash
curl -X POST http://localhost:3009/api/v1/leads \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contactId": "550e8400-...",
    "title": "ERP Satışı",
    "valueKurus": 5000000,
    "stage": "new",
    "probability": 20
  }'
```

### Aktivite tamamla
```bash
curl -X PATCH http://localhost:3009/api/v1/activities/ACTIVITY_ID/complete \
  -H "Authorization: Bearer JWT_TOKEN"
```

### Pipeline özeti al (Kanban)
```bash
curl "http://localhost:3009/api/v1/leads/pipeline/summary" \
  -H "Authorization: Bearer JWT_TOKEN"
```

---

## Todo & Known Issues

- [ ] Contact → Lead dönüşümü (qualification workflow)
- [ ] Activity scheduling → Email/SMS reminder integrations
- [ ] Lead kazanma → financial-service'e offer/invoice dönüşümü (Faz 4)
- [ ] Bulk lead import (CSV)
- [ ] Pipeline analytics dashboard (stage transition hızı, conversion rate)
- [ ] Contact tagging ve segmentasyon (advanced filters)

---

## İlgili Servisler

| Servis | Etkileşim | Konu |
|--------|-----------|------|
| auth-service | JWT token doğrulama | Kullanıcı kimliği |
| tenant-service | Tenant context | Veri izolasyonu |
| financial-service | Event listener | Lead → offer/invoice |
| notification-service | Event publisher | Activity reminder |
| web (frontend) | HTTP client | Dashboard/CRM UI |

---

## Referanslar

- **PROGRESS.md** — Genel proje durumu
- **CLAUDE.md** (kök) — Platform-geniş kurallar
- **UI_RULES.md** — Frontend bileşen standartları

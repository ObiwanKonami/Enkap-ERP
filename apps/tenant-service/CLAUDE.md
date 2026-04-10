# Tenant Service — Mimarı Rehberi

## Hızlı Başlangıç

**Port:** `:3002` — Tenant provizyon, onboarding, profil yönetimi

**Ana Modüller:**
- `ProvisioningModule` — Yeni tenant oluştur (şema + migrasyonlar + seed)
- `TenantProfileModule` — Şirket profili (VKN, TCKN, GİB bilgileri)
- `OnboardingModule` — 4 adımlı self-servis wizard
- `WhiteLabelModule` — Branding (domain, logo, renk, CSS)
- `AdminModule` — Platform yöneticisi dashboard

**Veritabanı:** `control_plane` (shared multi-tenant metadata)

---

## Modül Yapısı

```
apps/tenant-service/src/
├── provisioning/
│   ├── provisioning.controller.ts        # POST /api/v1/tenants/provision (internal)
│   ├── provisioning.module.ts
│   ├── provisioning-orchestrator.ts      # Saga pattern: provision flow
│   ├── schema-creator.ts                 # PostgreSQL şema DDL
│   ├── migration-runner.ts               # Squash baseline: V001 + CP001 (imports from migrations/)
  ├── migrations/
  │   ├── V001_InitialTenantSchema.ts   # Squashed tenant schema (V001–V063)
  │   └── CP001_InitialControlPlane.ts  # Squashed control plane schema (CP001–CP016)
│   ├── migration-runner-cli.ts           # K8s Job: node dist/provisioning/migration-runner-cli.js
│   ├── orphan-detection.service.ts       # 30 dakikada yarım kalan provizyon bulma
│   ├── tenant-seeder.ts                  # Demo veri: parametreler, başlangıç ürünleri
│   └── slug.util.ts                      # Tenant slug validasyonu (alfanümerik + - )
│
├── profile/
│   ├── tenant-profile.controller.ts      # GET /profile, PATCH /profile
│   ├── tenant-profile.service.ts
│   ├── tenant-profile.module.ts
│   └── tenant-profile.entity.ts          # VKN, TCKN, fatura seri, GİB alias'ları
│
├── onboarding/
│   ├── onboarding.controller.ts          # POST /register, GET /status/:tenantId
│   ├── onboarding.service.ts
│   ├── onboarding.module.ts
│   ├── onboarding.types.ts               # RegisterRequest, RegisterResult
│   └── (no entity — control_plane.tenant_profiles'ı kullanır)
│
├── white-label/
│   ├── white-label.controller.ts         # GET, PATCH white_label_configs
│   ├── white-label.service.ts
│   ├── white-label.module.ts
│   └── white-label-config.entity.ts      # Domain, logo, primary_color, app_name
│
├── admin/
│   ├── admin.module.ts
│   └── admin-tenants.controller.ts       # Platform yöneticisi endpoints
│
├── events/
│   └── billing-events.publisher.ts       # RabbitMQ: tenant.provisioning.* events
│
├── app.module.ts                         # ModuleImport sırası: Provisioning → Profile → ... → ControlPlaneHealthModule
├── main.ts                               # initTracing, Swagger setup
└── package.json
```

---

## Provisioning Flow — Kritik Saga Pattern

**Endpoint:** `POST /api/v1/tenants/provision` (internal only — Kong mTLS + IP restrict)

**DTO:**
```typescript
{
  tenantId:      'uuid-4',
  tenantSlug:    'acme-corp',                    // alphanumeric + hyphen
  tier:          'starter' | 'business' | 'enterprise',
  companyName:   'ACME Corporation',
  adminEmail:    'admin@acme.com',
  adminPassword: 'plain-text'                    // auth-service hash'ler
}
```

**Saga Adımları** (`ProvisioningOrchestrator.provision()`):

1. **Validation**
   - Slug benzersizliği → control_plane'de sorgu
   - Tier geçerliliği
   - E-posta formatı

2. **Schema Oluştur** (`SchemaCreator`)
   - PostgreSQL şemasını adlandır: `tenant_{tenantId_short}`
   - `CREATE SCHEMA` (idempotent: `IF NOT EXISTS`)
   - `GRANT` role permissions

3. **Migrasyonları Çalıştır** (`MigrationRunner.runBaseline()`)
   - `schema_version` tablosu oluştur
   - V001–V063 baseline migration'larını sırasıyla çalıştır
   - Kontrol: her migration yapılmadan önceki checksum doğru mu?
   - Başarısız: **compensation** → şemayı sil

4. **Seed Veri Yükle** (`TenantSeeder`)
   - Önceden tanımlanmış parametreler (KDV oranları, SGK dilim, asgari ücret)
   - Başlangıç ürün kategorileri
   - Demo cüzdan hesabı (Kasa)
   - Fatura seri numarası (invoice_seq_{year})

5. **Control Plane Profil Oluştur** (`TenantProfileService`)
   - `tenant_profiles` tablosuna INSERT
   - slug, company_name, vkn (nullable), tckn (nullable)

6. **Billing İntegrasyonu** (`BillingEventsPublisher`)
   - RabbitMQ: `tenant.provisioning.completed` → billing-service
   - 14 günlük trial aboneliği başlat

7. **Return Success**
   - Yanıt: tenantId, schemaName, durationMs

**Başarısız Olursa:**
- Her sagada compensation → schema sil + kontrol_plane profil sil
- **Orphan Detection**: 30 dakika sonra manuel temizlik için işaretler
- Log: provizyon adımlarının hangi noktada başarısız olduğu kayıt edilir

---

## Tenant Profile — GİB & Bordro Bilgileri

**Entity:** `control_plane.tenant_profiles`

**Zorunlu Alanlar:**
| Alan | Tip | Açıklama |
|------|-----|---------|
| `tenantId` | UUID | Tenant tanımlayıcı (unique) |
| `companyName` | VARCHAR(200) | Resmi şirket adı |
| `vkn` | CHAR(10) | B2B: Vergi Kimlik Numarası (10 hane) |
| `tckn` | CHAR(11) | Şahıs işletmesi: TCKN (11 hane) |
| `invoicePrefix` | VARCHAR(5) | Fatura seri (örn: 'ENK', 'ACM') — GİB gereksinimi |

**GİB Alias'ları** (CP015 migration):
| Alan | Açıklama |
|------|---------|
| `gibGbAlias` | GB alias (alıcı alias'ı — e-Fatura MTOM SOAP'ında) |
| `gibPkAlias` | PK (private key) alias'ı |
| `gibUsername` | GİB portal username |
| `gibEnrolledAt` | Mali mühür tescili tarihi |

**Bordro İlgili:**
| Alan | Açıklama |
|------|---------|
| `sgkEmployerNo` | İşyeri SGK numarası (bordro başlığında zorunlu) |
| `mersisNo` | MERSİS numarası (16 hane — resmi belgeler) |
| `taxOffice` | Vergi dairesi |

**Adres Bilgileri:**
```typescript
{
  address:   'Makine Mühendisliği Binası Zemin Kat',
  city:      'İstanbul',
  district:  'Beyoğlu',
  postalCode: '34430',
  country:   'Türkiye'
}
```

**Kontrol Noktaları:**
- VKN/TCKN doğrulama: checksum kontrolü (GİB standardı)
- IBAN: `^TR\d{24}$` regex
- Slug: `^[a-z0-9-]+$` ve unique

---

## Onboarding Wizard — 4 Adım

**Endpoint:** `POST /api/v1/onboarding/register`

**Flow:**

### Adım 1: Register (POST /register)
```typescript
{
  companyName:    'ACME Corp',
  adminEmail:     'admin@acme.com',
  adminPassword:  'SecurePass123!',
  phone:          '+90532...',
  // Optional
  vkn:            '1234567890',
  tradeName:      'ACME Ticaret',
}
```

**İş Akışı:**
1. Tenant oluştur → UUID
2. Slug üret: companyName'den slugify (ACME Corp → acme-corp)
3. **Provisioning çağır** (schema + migrations + seed)
4. **Auth-Service çağır**: Admin hesap oluştur + şifre sıfırlama e-postası
5. **Billing çağır**: 14 günlük trial başlat
6. **Yanıt:**
   ```json
   {
     "tenantId": "uuid-4",
     "tenantSlug": "acme-corp",
     "nextStep": "plan",  // veya "card", "completed"
     "trialEndsAt": "2026-04-17"
   }
   ```

### Adım 2: Plan Seçimi (opsiyonel — web UI'da)
- `POST /onboarding/:tenantId/set-plan`
- Tier: starter | business | enterprise
- **Rate limits** ve feature gates güncellenir (billing-service)

### Adım 3: Ödeme Kartı (opsiyonel)
```typescript
POST /onboarding/:tenantId/card
{
  cardNumber: '4282...',
  cardExpiry: '12/28',
  cardCvc: '123',
}
```

**İş Akışı:**
1. iyzico'ya kart kaydı (tokenize)
2. İlk ödeme denemesi (1 TL veya 0 TL verification)
3. Yanıt: card token döner (sonraki ödeme için)

### Adım 4: Tamamlama
- Status: `completed` → email gönder + web UI yönlendir

**Status Sorgusu:**
```
GET /api/v1/onboarding/:tenantId/status
→ { status: 'profile' | 'plan' | 'card' | 'completed' }
```

---

## White Label — Branding

**Entity:** `tenant_schemas.white_label_configs`

```typescript
{
  tenantId:      UUID,
  domain:        'acme.app.enkap.com.tr',    // Custom subdomain
  appName:       'ACME ERP',                  // Logo metni
  logoUrl:       'https://cdn.../logo.png',
  faviconUrl:    'https://cdn.../favicon.ico',
  primaryColor:  '#2563EB',                   // Hex renk
  customCss:     'body { font-family: ... }',
  supportEmail:  'support@acme.com',
}
```

**Endpoints:**
```
GET  /api/v1/white-label                    # Tenant profil alanını getir
PATCH /api/v1/white-label                   # Güncelle
```

**Kontrol Noktaları:**
- domain: DNS wildcard setup gerekli (`*.app.enkap.com.tr` → Web ingress)
- primaryColor: Hex format validasyonu
- logoUrl: HTTPS ve CDN erişebilirliği kontrol et

---

## Admin Endpoints — Platform Yöneticisi

### Tüm Tenant'larda Migration Çalıştır

```
POST /api/v1/tenants/admin/run-migrations
```

**Amaç:** Yeni migration (V045, CP011 vb.) mevcut tenantlara yay.

**İş Akışı:**
1. `TenantRoutingService.findAllActiveIds()` → tüm aktif tenant'ları listele
2. Her tenant'a `MigrationRunner.runBaseline(routing)` çağır
3. Yanıt: `{ total: N, ok: M, error: K, results: [...] }`

### Orphan Tenant Listesi

```
GET /api/v1/tenants/admin/orphaned
```

**Açıklama:** Son 30 dakikada yarım kalan provizyon işlemlerini listele.

**Entity:** `control_plane.tenants` (status: 'provisioning' → 'active' veya 'failed')

**Yanıt:**
```json
{
  "count": 2,
  "orphans": [
    { "tenantId": "uuid-1", "createdAt": "2026-04-03T10:30:00Z", "schemaName": "..." }
  ],
  "thresholdMinutes": 30
}
```

### Orphan Tenant'ı Başarısız İşaretle

```
POST /api/v1/tenants/admin/:tenantId/mark-failed
```

**Yanıt:** `{ success: true, tenantId }`

**Not:** PostgreSQL şema temizliği (`DROP SCHEMA`) manuel yapılmalıdır:
```sql
DROP SCHEMA IF EXISTS tenant_xxxxxxxx CASCADE;
```

---

## Migration System

**Kaynak:** `apps/tenant-service/src/provisioning/migration-runner.ts`

**İki Kategori:**

### Baseline (V001 squashed) — Tenant Şeması

Her tenant için yeni şemada çalıştırılır.

**Dosya:** `src/provisioning/migrations/V001_InitialTenantSchema.ts`

Tüm V001–V063 incremental migration'ları tek bir squash baseline'a birleştirilmiştir (2026-04-08).

**İçerdiği Önemli Tablolar:**
- `gib_envelopes`, `invoices`, `invoice_lines`, `e_archive_reports`, `application_responses`
- `waybills` (gib_status, gib_document_number, envelope_uuid dahil)
- `employees`, `payrolls` (BES, icra, SGK alanları dahil)
- `purchase_orders` (`vendor_id` → `crm_contacts` FK, `vendor_name` snapshot)
- `sales_orders`, `deliveries`, `goods_receipts`
- `vehicles`, `drivers`, `trips`, `hgs_records`, `gps_locations`
- `work_orders`, `boms`, `treasury_accounts`, `treasury_transactions`

**Checksum:** `squash-v001-v063-baseline-20260408`

### Control Plane (CP001 squashed) — Shared DB

`control_plane` şemasında bir kez çalıştırılır.

**Dosya:** `src/provisioning/migrations/CP001_InitialControlPlane.ts`

Tüm CP001–CP016 incremental migration'ları tek bir squash baseline'a birleştirilmiştir (2026-04-08).

**İçerdiği Önemli Tablolar/Alanlar:**
- `tenant_routing`, `provisioning_log`
- `tenant_profiles` — GİB alias'ları (gib_gb_alias, gib_pk_alias, gib_username, gib_enrolled_at dahil), phone UNIQUE partial index
- `billing_plans`, `subscriptions`, `payment_attempts`, `billing_invoices`
- `webhook_subscriptions`, `webhook_deliveries`, `webhook_outbox`
- `platform_settings`, `fiscal_params` (2025 seed: asgari ücret 22.104,67 TL)
- `report_definitions` (chart_type, data_source dahil), `dashboards`, `widgets`
- `gib_audit_logs` (document_uuid, signature_hash dahil — INSERT-ONLY RLS, ÖEBSD SIS.5)

**Checksum:** `squash-cp001-cp016-baseline-20260408`

---

## Event Publishing — RabbitMQ

**Publisher:** `BillingEventsPublisher` (ProvisioningModule'de)

| Event | Routing Key | Tüketici | Amaç |
|-------|-------------|----------|------|
| `ProvisioningCompleted` | `tenant.provisioning.completed` | billing-service | Trial aboneliği başlat |
| `ProvisioningFailed` | `tenant.provisioning.failed` | — | Log |

**Example:**
```typescript
await this.billingEventsPublisher.publishProvisioning({
  type: 'provisioning.completed',
  tenantId,
  tier,
  trialDays: 14,
  timestamp: new Date(),
});
```

---

## Veritabanı — Control Plane vs Tenant Schema

| Tablo | Şema | Kullanım |
|-------|------|---------|
| `tenant_profiles` | control_plane | Tenant meta, GİB alias'ları, fatura seri |
| `tenants` | control_plane | Provizyon status (provisioning/active/failed) |
| `white_label_configs` | control_plane | Branding (domain, logo, CSS) |
| `invoices` | tenant schema | Her tenant'ın faturası |
| `products` | tenant schema | Her tenant'ın ürünü |
| `schema_version` | tenant schema | Migration history |

**Bağlantı:**
- Default DataSource → control_plane (tenant-service için)
- TenantDataSourceManager → Her tenant'ın şemasına (provisioning sırasında)

---

## Önemli Kurallar

### 1. Slug Validasyonu
```typescript
// ✅ Geçerli
'acme-corp', 'a', 'company-2', 'xyz-123'

// ❌ Geçersiz
'ACME Corp' (uppercase), 'acme corp' (space), 'acme_corp' (underscore)
```

### 2. Tenant İzolasyonu
- Provisioning sırasında tenant şeması **fiziksel olarak ayrıdır**
- `TenantDataSourceManager.getDataSource(tenantId)` ile erişilir
- Cross-tenant sorgusu **asla müsaade edilmez**

### 3. Admin Endpoint'leri
- `POST /admin/*` endpoint'leri **internal only** — Kong IP restriction
- Production: `ADMIN_IPS=10.0.0.0/8,172.16.0.0/12` env ile kontrol

### 4. Migration Atomicity
- Bir migration başarısız olursa **compensation** (geri alma)
- Partial provisioning: orphan detection tarafından bulunur

### 5. Fatura Seri Üretimi
```typescript
// PostgreSQL fonksiyonu (V032 migration)
SELECT get_next_invoice_seq(year)  // invoices.invoice_number üretir
→ 'ENK-{YYYY}-{NNNN}'  // Örn: ENK-2026-0001
```

---

## Common Tasks

### Yeni Tenant Provizyon Et
```bash
curl -X POST http://localhost:3002/api/v1/tenants/provision \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "550e8400-e29b-41d4-a716-446655440000",
    "tenantSlug": "demo-corp",
    "tier": "starter",
    "companyName": "Demo Corporation",
    "adminEmail": "admin@demo.com",
    "adminPassword": "initial123"
  }'
```

### Tüm Tenant'lara Migration Yay
```bash
curl -X POST http://localhost:3002/api/v1/tenants/admin/run-migrations \
  -H "Authorization: Bearer <admin-jwt>"
```

### Orphan Tenant Temizle
```bash
# 1. Orphan listesi
curl http://localhost:3002/api/v1/tenants/admin/orphaned

# 2. Başarısız işaretle
curl -X POST http://localhost:3002/api/v1/tenants/admin/{orphan-id}/mark-failed

# 3. PostgreSQL'de şemayı sil
psql -c "DROP SCHEMA IF EXISTS tenant_{id_short} CASCADE;"
```

---

## Swagger & API Docs

**URL:** `http://localhost:3002/docs`

- `/api/v1/tenants/provision` — Provisioning (internal)
- `/api/v1/tenants/:id/provisioning-log` — Günlük (admin)
- `/api/v1/onboarding/register` — Wizard Adım 1
- `/api/v1/onboarding/:tenantId/status` — Status sorgula
- `/api/v1/tenants/admin/*` — Admin endpoints

---

## Troubleshooting

### Provision Başarısız Olmuş Tenant Var
1. `GET /admin/orphaned` → bul
2. `POST /admin/:tenantId/mark-failed` → işaretle
3. SQL: `DROP SCHEMA tenant_{id} CASCADE;` → temizle
4. Control plane'den `DELETE FROM tenant_profiles WHERE tenantId = '...'`

### Migration Yayınlanamayan Tenant'lar
1. `POST /admin/run-migrations` çalıştır
2. Yanıt: errors listesini kontrol et
3. Hata: SQL syntax veya constraint violation

### Fatura Seri Numarası Çakışıyor
- `invoice_prefix` unique değil kontrol et
- PostgreSQL sequence reset gerekli mi?

---

## Ilgili Bileşenler

- **Auth-Service** — Admin hesap oluşturma (onboarding)
- **Billing-Service** — Trial subscription başlatma
- **Financial-Service** — Fatura seri formatı (GİB)
- **HR-Service** — Bordro (SGK numarası)
- **Web Frontend** — Onboarding wizard UI

---

**Son Güncelleme:** 2026-04-03

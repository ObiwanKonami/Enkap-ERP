# Enkap ERP — Go-Live Öncesi QA Planı

> **Tarih:** 2026-03-21
> **Kapsam:** Onboarding → Billing → Core Business → AI → Security
> **Hedef:** Zero-fault go-live

---

## 1. Test Senaryosu Tablosu

### 1.1 Onboarding & Provisioning

| ID | Adım | Beklenen Sonuç | Kritiklik | Dosya |
|----|------|----------------|-----------|-------|
| TC-PROV-01 | Yeni tenant provision → `ProvisioningOrchestrator` çalıştır | HTTP 201, `status: active`, süre < 90 sn | **P0** | `auth-onboarding.spec.ts` |
| TC-PROV-02 | Duplicate slug ile provision | HTTP 409 Conflict | P1 | `auth-onboarding.spec.ts` |
| TC-PROV-03 | Migration adımında DB kilidi (deadlock) → Saga compensation | Schema ve kontrol düzlemi kaydı silinmeli | **P0** | `integration/saga.test.ts` |
| TC-PROV-04 | RLS politikaları — tenant_id olmadan INSERT deneme | `ERROR: new row violates row-level security` | **P0** | DB-level test |
| TC-PROV-05 | Orphan tenant detection (cron) | `status: provisioning` > 90 sn → otomatik temizlik | P1 | Cron manuel tetik |
| TC-AUTH-01 | Geçerli kimlik → dashboard erişimi | HTTP 200, KPI kartları görünür | **P0** | `auth-onboarding.spec.ts` |
| TC-AUTH-02 | Yanlış şifre | HTTP 401 + kullanıcı dostu mesaj | **P0** | `auth-onboarding.spec.ts` |
| TC-AUTH-03 | Anonim → korunan sayfa | /giris yönlendirmesi | **P0** | `auth-onboarding.spec.ts` |
| TC-AUTH-04 | Refresh token rotation | İkinci kullanımda 401 | **P0** | API-level test |
| TC-AUTH-05 | Access token süresi (1 saat sonra) | 401 Unauthorized | **P0** | API-level test |

### 1.2 Billing & Subscription

| ID | Adım | Beklenen Sonuç | Kritiklik | Dosya |
|----|------|----------------|-----------|-------|
| TC-BILL-01 | iyzico test kartı → Business plana geçiş | `tier: business`, cardToken saklanır | **P0** | `billing-feature-gate.test.ts` |
| TC-BILL-02 | Başarısız kart (bakiye yetersiz) | HTTP 402, abonelik aktif olmaz | **P0** | `billing-feature-gate.test.ts` |
| TC-BILL-03 | Plan yükseltme → ML erişimi anında açılır | Feature gate yeni tier'ı okur | **P0** | `billing-feature-gate.test.ts` |
| TC-BILL-04 | Dunning — 3. başarısız denemede iptal | `status: cancelled`, webhook atılır | P1 | Dunning job manuel tetik |
| TC-BILL-05 | Trial 14 gün sonu → `past_due` geçişi | Cron ile otomatik | P1 | Cron mock test |
| TC-FG-01 | Starter → ML endpoint | HTTP 403 | **P0** | `billing-feature-gate.test.ts` |
| TC-FG-02 | Enterprise → tüm özellikler açık | HTTP 200 her endpoint | **P0** | API smoke test |
| TC-FG-03 | White Label — sadece enterprise | Starter/Business → 403 | **P0** | `billing-feature-gate.test.ts` |

### 1.3 Core Business Logic

| ID | Adım | Beklenen Sonuç | Kritiklik | Dosya |
|----|------|----------------|-----------|-------|
| TC-INV-01 | Fatura listesi yükleme | Veri gösterilir, sayfalama çalışır | **P0** | `invoice.spec.ts` |
| TC-INV-02 | Yeni fatura oluşturma — KDV %20 | Toplam = satır × 1.20, BigInt ile tam | **P0** | `invoice.spec.ts` |
| TC-INV-03 | 1000 satırlı fatura — kuruş hata yok | `total = 12.00`, sıfır float sapması | **P0** | `invoice.spec.ts` |
| TC-INV-04 | Fatura tarihi UTC+3 kayması | issueDate bir gün geri gitmez | **P0** | `invoice.spec.ts` + `timezone.test.ts` |
| TC-INV-05 | GİB gönderim → `SENT` status | E-imzalı XML GİB'e iletilir | P1 | GİB sandbox |
| TC-STK-01 | Stok girişi → miktar artar | GIRIS hareketi kaydedilir | **P0** | `stock-movement.spec.ts` |
| TC-STK-02 | FIFO maliyet — 2 katman, 8 çıkış | Maliyet = ilk katmandan 8×300 TL | **P0** | `stock-movement.spec.ts` |
| TC-STK-03 | Stok çıkışı → yevmiye kaydı | GL entry oluşur (async, 3 sn) | **P0** | `stock-movement.spec.ts` |
| TC-STK-04 | Negatif stok koruması | HTTP 400/422, mesaj: "yetersiz" | **P0** | `stock-movement.spec.ts` |
| TC-STK-05 | Trendyol sipariş webhook → stok düşümü | Stok azalır, webhook tetiklenir | P1 | `stock-movement.spec.ts` |
| TC-SAL-01 | Satış siparişi → sevkiyat → fatura | SO → KISMEN_SEVK → FATURALANMIS | **P0** | API-level test |
| TC-PUR-01 | Satın alma onayı → mal kabul → stok giriş | PO RECEIVED → stok artar | **P0** | API-level test |
| TC-TRY-01 | Banka hareketi → bakiye güncellenmesi | Kasa/banka bakiyesi anlık | **P0** | API-level test |

### 1.4 AI & Analytics

| ID | Adım | Beklenen Sonuç | Kritiklik | Dosya |
|----|------|----------------|-----------|-------|
| TC-ML-01 | 14 günlük veri → XGBoost seçimi | `daily_points` array dolu | P1 | `billing-feature-gate.test.ts` |
| TC-ML-02 | 6 aylık veri → Prophet seçimi | `yhat`, `yhat_lower`, `yhat_upper` mevcut | P1 | ML service test |
| TC-ML-03 | Yetersiz veri (< 14 gün) | HTTP 422, açıklayıcı hata | P1 | `billing-feature-gate.test.ts` |
| TC-ML-04 | Anomali skoru → 0-1 aralığı | Her sonuç `0 ≤ score ≤ 1` | P1 | `billing-feature-gate.test.ts` |
| TC-ML-05 | Cross-tenant veri sızıntısı | Tahmin sadece kendi verisiyle | **P0** | Security test |
| TC-BI-01 | Cohort retention raporu | 12 aylık matris, %100 + %0 sınırları | P1 | API-level |
| TC-BI-02 | MRR hesabı | MRR = Σ(aktif abonelik × aylık ücret) | P1 | API-level |

### 1.5 Security & Tenant Isolation

| ID | Adım | Beklenen Sonuç | Kritiklik | Dosya |
|----|------|----------------|-----------|-------|
| TC-SEC-01 | Tenant A token → Tenant B fatura GET | HTTP 403 veya 404 — asla 200 | **P0** | `auth-onboarding.spec.ts` |
| TC-SEC-02 | URL ID manipülasyonu (IDOR) | TenantGuard engeller | **P0** | `load-test.js` |
| TC-SEC-03 | search_path injection (`SET search_path=`) | PostgreSQL rol kilitli, imkansız | **P0** | DB-level |
| TC-SEC-04 | RLS bypass (tablo sahibi user) | `FORCE ROW LEVEL SECURITY` engeller | **P0** | DB-level |
| TC-SEC-05 | JWT token — başka tenant_id ile imzala | JWT doğrulama reddeder | **P0** | API-level |
| TC-SEC-06 | SQL injection — filtre parametreleri | TypeORM parameterized, engellenir | **P0** | Parametre fuzzing |
| TC-SEC-07 | 500 eş zamanlı kullanıcı — veri karışması yok | Her VU sadece kendi verisini görür | **P0** | `load-test.js` |

### 1.6 Görünmez Noktalar (Special)

| ID | Adım | Beklenen Sonuç | Kritiklik | Dosya |
|----|------|----------------|-----------|-------|
| TC-MONEY-01 | 1000 satır × 0.01 TL → toplam | `10.00` tam (float değil BigInt) | **P0** | `money.stress.test.ts` |
| TC-MONEY-02 | KDV %20 yuvarlama 1000 farklı fiyat | Sıfır kümülatif hata | **P0** | `money.stress.test.ts` |
| TC-MONEY-03 | 1M TL fatura → overflow yok | Pozitif, doğru toplam | **P0** | `money.stress.test.ts` |
| TC-COLD-01 | Tüm servisler kapalı → dashboard | DEMO_KPI gösterilir, null crash yok | **P0** | `auth-onboarding.spec.ts` TC-AUTH-06 |
| TC-COLD-02 | Yeni tenant, 0 veri → her sayfa | Boş state UI, hata yok | **P0** | E2E new tenant |
| TC-TZ-01 | 21.03.2026 date-only → GİB tarihi | "21.03.2026" — gün kayması yok | **P0** | `timezone.test.ts` |
| TC-TZ-02 | 31.12 23:30 UTC → Yılbaşı | İstanbul saati 01.01 doğru | **P0** | `timezone.test.ts` |
| TC-TZ-03 | Cron dunning 06:00 İstanbul | UTC 03:00 çalışır | P1 | `timezone.test.ts` |

---

## 2. Cypress/Playwright Script Skeletonları

Üç kritik akış için tam test dosyaları oluşturuldu:

| Dosya | Akış | Test Sayısı |
|-------|------|-------------|
| `tests/e2e/playwright/auth-onboarding.spec.ts` | Login + Onboarding + Isolation + Cold Start | 9 test |
| `tests/e2e/playwright/invoice.spec.ts` | Fatura listesi + Oluşturma + Kuruş stres + Timezone | 6 test |
| `tests/e2e/playwright/stock-movement.spec.ts` | Stok girişi + FIFO + Yevmiye + Negatif stok + Trendyol | 7 test |

**Çalıştırma:**
```bash
# Tüm E2E testler
npx playwright test --config tests/e2e/playwright.config.ts

# Belirli dosya
npx playwright test tests/e2e/playwright/invoice.spec.ts --headed

# Sadece P0 (giriş testleri)
npx playwright test tests/e2e/playwright/auth-onboarding.spec.ts
```

---

## 3. Load Test Stratejisi (k6)

**Dosya:** `tests/load/k6/load-test.js`

### Senaryo Dağılımı

| Senaryo | Ağırlık | Açıklama |
|---------|---------|----------|
| Dashboard okuma | %35 | Ana sayfa KPI'ları |
| Fatura listesi | %25 | Pagination + filtre |
| Stok listesi | %15 | Ürün arama |
| Fatura oluşturma | %10 | Write-heavy |
| Karma okuma | %10 | Dashboard + stok |
| Tenant izolasyon testi | %5 | Güvenlik — sürekli |

### Eşik Değerleri (Thresholds)

| Metrik | Hedef | Kritiklik |
|--------|-------|-----------|
| P95 gecikme | < 500ms | **P0** |
| P99 gecikme | < 1000ms | **P0** |
| Login P99 | < 2000ms | **P0** |
| Hata oranı | < %1 | **P0** |
| Tenant sızıntı | = 0 | **P0 — Kırılırsa STOP** |

### Çalıştırma

```bash
# Temel yük testi
k6 run tests/load/k6/load-test.js

# Grafana ile izleme
k6 run --out influxdb=http://localhost:8086/k6 tests/load/k6/load-test.js

# Ortam değişkenleriyle
BASE_URL=https://staging.enkap.com.tr \
TENANT_TOKENS=token1,token2,token3 \
k6 run tests/load/k6/load-test.js
```

### Altyapı Ön Koşulları (500 VU için)

```
PostgreSQL:  max_connections = 200, PgBouncer pool_size = 50/tenant
Redis:       maxmemory 2GB, eviction: allkeys-lru
NestJS:      Fastify, cluster mode (4 worker)
Kong:        rate-limit: 100 req/min/tenant (starter), 500 (business)
```

---

## 4. Failure Mode Raporu

### 4.1 Auth Service

| Hata Modu | Senaryo | Sistem Yanıtı | Telafi |
|-----------|---------|---------------|--------|
| Redis çöküyor | Refresh token doğrulanamaz | 401 tüm isteklerde | Redis Sentinel/Cluster |
| Şifre sıfırlama spam | 100 req/dk aynı email | Rate limit 429 | Redis sliding window |
| JTI revoke race condition | Eş zamanlı 2 refresh | Lua atomik DELETE — sadece biri başarılı | ✅ Zaten korunuyor |
| JWT secret sızıntısı | Başka tenant imzası | Signature verification → 401 | Secret rotation + Vault |

### 4.2 Tenant Provisioning (Saga)

| Hata Modu | Adım | Kompansasyon | Test ID |
|-----------|------|--------------|---------|
| DB deadlock (schema create) | Adım 2 | Schema DROP + control plane DELETE | TC-PROV-03 |
| Migration fail | Adım 3 | Schema DROP + control plane DELETE | TC-PROV-03 |
| RLS policies timeout | Adım 4 | Schema DROP | TC-PROV-03 |
| Seeding fail | Adım 5 | Seeding yeniden denenebilir (idempotent) | Retry logic |
| RabbitMQ down | Adım 7 | Tamamlandı ama event yok — outbox ile retry | Outbox pattern |
| Orphan schema (saga yarıda) | Herhangi | Cron job 90 sn sonra temizler | TC-PROV-05 |

### 4.3 Financial Service (Money)

| Hata Modu | Risk | Mevcut Koruma | Test ID |
|-----------|------|---------------|---------|
| Float rounding 1000 satır | Kuruş sapması | BigInt SCALE=10000 | TC-MONEY-01 |
| KDV %8 eski oran | Yanlış vergi | Enum kontrolü (%0/%1/%10/%20) | Code review |
| GİB tarih timezone kayması | Yanlış fatura tarihi | Date-only string, Intl Istanbul | TC-TZ-01 |
| NUMERIC overflow (>19 hane) | DB hatası | Pratik max ~100B TL — sorun yok | Edge case |
| Tevkifat bölme hata | Yanlış KDV kesintisi | BigInt tam bölme | `money.stress.test.ts` |

### 4.4 Stock Service (FIFO/AVG)

| Hata Modu | Risk | Mevcut Koruma | Test ID |
|-----------|------|---------------|---------|
| Eş zamanlı stok çıkışı | Race condition | Pessimistic write lock | Concurrent test |
| FIFO katman tutarsızlığı | Hatalı maliyet | Transaction + lock | TC-STK-02 |
| Negatif stok | Fiziksel imkansız | Validation + guard | TC-STK-04 |
| RabbitMQ gecikme → GL yok | Yevmiye eksik | Async, retry + DLQ | TC-STK-03 |
| Marketplace double-consume | Sipariş çift işlenir | Idempotency key | TC-STK-06 |

### 4.5 ML Inference

| Hata Modu | Risk | Mevcut Koruma | Test ID |
|-----------|------|---------------|---------|
| Cross-tenant veri sızıntısı | Rekabet bilgisi | tenant_id query filter | TC-ML-05 |
| Model drift | Yanlış tahmin | Isolation Forest drift check | Airflow job |
| < 14 gün veri | Crash | `if len(data) < 14: raise ValueError` | TC-ML-03 |
| Redis cache poisoning | Başka tenant cevabı | Cache key = tenant_id+params | Security audit |
| SHAP timeout | 500 hata | `include_shap: false` varsayılan | TC-ML-01 |

### 4.6 Tenant Isolation (Kritik)

| Hata Modu | Risk | Mevcut Koruma | Test ID |
|-----------|------|---------------|---------|
| `search_path` manipülasyonu | Cross-schema okuma | PostgreSQL rol kilitli | TC-SEC-03 |
| RLS bypass | Başka tenant verisi | FORCE ROW LEVEL SECURITY | TC-SEC-04 |
| AsyncLocalStorage kayıp | tenantId=null | Exception fırlatır (sessiz fail yok) | TC-SEC-05 |
| IDOR (URL ID değişikliği) | Veri sızıntısı | TenantGuard + RLS çift katman | TC-SEC-01 |
| Yük altında VU karışması | Race condition | Her istek bağımsız ALS context | TC-SEC-07 |

---

## 5. Gerçek Zamanlı Veri Setleri (AI'dan İste)

ML testleri için aşağıdaki veri setleri kullanılabilir:

### Satış Tahmini Dummy Verisi (6 Ay)
```bash
# demo-seed.ts çalıştırarak gerçekçi 6 aylık satış verisi ekle
DATABASE_URL=... pnpm demo:seed

# Ya da ML inference'a doğrudan dummy veri gönder
curl -X POST http://localhost:3005/api/v1/debug/seed-sales \
  -H "Content-Type: application/json" \
  -d '{ "days": 180, "base_revenue": 50000, "noise_pct": 20, "trend": "up" }'
```

### Anomali Testi Verisi
```json
{
  "inject_spike": {
    "day": 150,
    "multiplier": 5.0,
    "description": "Fiyat spike simülasyonu"
  }
}
```

---

## 6. CI/CD Entegrasyonu

```yaml
# .github/workflows/qa.yml (ek adım)
- name: Unit & Integration Tests
  run: |
    npx jest --config tests/jest.config.ts --coverage

- name: E2E Tests (Playwright)
  run: |
    npx playwright test --config tests/e2e/playwright.config.ts

- name: Load Test (k6) — Staging Only
  if: github.ref == 'refs/heads/main'
  run: |
    k6 run tests/load/k6/load-test.js \
      -e BASE_URL=${{ secrets.STAGING_URL }}
```

---

## 7. Öncelik Sırası (Go-Live Öncesi)

```
P0 (Blocker — Go-Live olmaz):
  ✅ Tenant izolasyon (TC-SEC-01..07)
  ✅ Kuruş hata yok (TC-MONEY-01..03)
  ✅ Auth akışları (TC-AUTH-01..05)
  ✅ Cold start crash yok (TC-COLD-01..02)
  ✅ Timezone kayması yok (TC-TZ-01..02)
  ✅ Fatura KDV doğruluğu (TC-INV-02..03)
  ✅ Negatif stok koruması (TC-STK-04)
  ✅ Feature gate (TC-FG-01..03)

P1 (Go-Live sonrası Sprint):
  - GİB XML doğrulama
  - ML drift monitoring
  - Dunning tam akış
  - Trendyol webhook tam akış
```

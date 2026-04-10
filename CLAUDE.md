# Enkap ERP — Master Geliştirme Rehberi

Bu dokuman **tüm proje modüllerine kapı görevini yapar**. Her modül kendi `CLAUDE.md` dosyasına sahiptir — detaylı bilgi için aşağıdaki linklerden ulaşabilirsiniz.

---

## 🎯 Proje Özeti

**Enkap**, Türkiye pazarına özel, multi-tenant, mobile-first, AI destekli **SaaS ERP platformu**.

| Özellik | Açıklama |
|---------|---------|
| **Hedef Kitle** | Türk KOBİ'leri (10-500 çalışan) |
| **Ölçek** | Multi-tenant → her müşteri verisi tamamen izole |
| **Mobil** | React Native + Expo → native deneyim, offline mod |
| **AI** | XGBoost satış tahmini, Prophet, Isolation Forest anomali |
| **Uyum** | e-Fatura, e-Arşiv, GİB, TDHP, KDV, KVKK, SGK |
| **Döviz** | TRY, USD, EUR, AED (UAE), SAR (KSA) |

---

## 🏗️ Mimarı Katmanlar

```
┌─────────────────────────────────────────────┐
│   Presentation Layer                        │
│   Web (Next.js) | Mobile (React Native)    │
│   Portal (Self-Servis)                     │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   API Gateway (Kong)                        │
│   Rate Limit, mTLS, IP Restriction         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   Microservices (18 NestJS + 2 FastAPI)    │
│   └─ Bkz. "Servisler" bölümü               │
└──────────────────┬──────────────────────────┘
                   │
      ┌────────────┼────────────┐
      │            │            │
   ┌──▼──┐     ┌──▼──┐     ┌──▼──┐
   │ TDB │     │Cache│     │AMQP │
   │PgSQL│     │Redis│     │MQ   │
   └─────┘     └─────┘     └─────┘
```

---

## 📦 Teknoloji Yığını (Hızlı Referans)

| Katman | Teknoloji | Notlar |
|--------|-----------|--------|
| **Backend Framework** | NestJS 10 (TypeScript) + Fastify | Express değil |
| **Web Framework** | Next.js 14 (React) | Dashboard, SSR |
| **Mobile Framework** | React Native ~52 + Expo EAS | WatermelonDB offline |
| **Veritabanı** | PostgreSQL 16 | Schema-per-tenant (hybrid) |
| **Cache / Pub-Sub** | Redis 7 | ioredis client |
| **Message Broker** | RabbitMQ | Event streaming (olaylar) |
| **ORM** | TypeORM 0.3 | NestJS ile native entegrasyon |
| **GİB Signing** | Java 17 + BouncyCastle | XAdES-T — sadece bu dil |
| **Secret Management** | HashiCorp Vault | Per-tenant AES-256 |
| **Container Orch.** | Kubernetes | Istio strict mTLS |
| **Monitoring** | OpenTelemetry + Jaeger + Grafana | Distributed tracing |
| **CI/CD** | GitHub Actions | `.github/workflows/` |
| **Monorepo** | pnpm + Turborepo 2 | Workspace management |
| **ML/AI** | FastAPI + XGBoost + Prophet | Python 3.11 |

---

## 🔗 Servisler & Modüller

### Backend Servisleri (NestJS :3001-:3018)

| Port | Servis | Amaç | CLAUDE.md |
|------|--------|------|----------|
| 3001 | **auth-service** | JWT, OAuth2, FCM, RBAC | [📖 Oku](./apps/auth-service/CLAUDE.md) |
| 3002 | **tenant-service** | Provizyon, White Label, Admin | [📖 Oku](./apps/tenant-service/CLAUDE.md) |
| 3003 | **financial-service** | Fatura, KDV, GİB, AR/AP, Muhasebe | [📖 Oku](./apps/financial-service/CLAUDE.md) |
| 3004 | **stock-service** | Ürün, Depo, Lojistik, e-Ticaret | [📖 Oku](./apps/stock-service/CLAUDE.md) |
| 3005 | **ml-inference** | XGBoost, Prophet, SHAP | [📖 Oku](./apps/ml-inference/CLAUDE.md) |
| 3006 | **webhook-hub** | Outbox Pattern, Webhook Teslimatı | [📖 Oku](./apps/webhook-hub/CLAUDE.md) |
| 3007 | **hr-service** | Bordro, Çalışan, SGK, İzin | [📖 Oku](./apps/hr-service/CLAUDE.md) |
| 3008 | **billing-service** | iyzico, Dunning, Subscriptions | [📖 Oku](./apps/billing-service/CLAUDE.md) |
| 3009 | **crm-service** | Kişi, Lead, Aktivite, Kanban | [📖 Oku](./apps/crm-service/CLAUDE.md) |
| 3010 | **analytics-service** | Platform Metrikleri, BI, Cohort | [📖 Oku](./apps/analytics-service/CLAUDE.md) |
| 3011 | **purchase-service** | Satın Alma, Mal Kabul, Onay | [📖 Oku](./apps/purchase-service/CLAUDE.md) |
| 3012 | **order-service** | Satış Siparişi, Sevkiyat | [📖 Oku](./apps/order-service/CLAUDE.md) |
| 3013 | **treasury-service** | Kasa, Banka, Nakit Akışı | [📖 Oku](./apps/treasury-service/CLAUDE.md) |
| 3014 | **manufacturing-service** | BOM, MRP, İş Emri | [📖 Oku](./apps/manufacturing-service/CLAUDE.md) |
| 3017 | **fleet-service** | Araç, Sürücü, GPS, HGS, Bakım | [📖 Oku](./apps/fleet-service/CLAUDE.md) |
| 3018 | **waybill-service** | e-İrsaliye, UBL-TR, GİB | [📖 Oku](./apps/waybill-service/CLAUDE.md) |
| 3019 | **notification-service** | RabbitMQ → Email/SMS/Push | [📖 Oku](./apps/notification-service/CLAUDE.md) |

### Python Servisleri (FastAPI :3005, :3016)

| Port | Servis | Amaç | CLAUDE.md |
|------|--------|------|----------|
| 3005 | **ml-inference** | Tahminleme, Anomali, Feature Store | [📖 Oku](./apps/ml-inference/CLAUDE.md) |
| 3016 | **ai-assistant** | LLM, OCR, Belge Analizi | [📖 Oku](./apps/ai-assistant/CLAUDE.md) |

### Frontend & Portals

| Port | Uygulama | Açıklama | CLAUDE.md |
|------|----------|---------|----------|
| 3000 | **web** | Next.js Dashboard (Tüm sayfalar) | [📖 Oku](./apps/web/CLAUDE.md) |
| 3015 | **portal** | Müşteri/Tedarikçi Self-Servis | Bağımsız (mobile hariç) |
| - | **mobile** | React Native Expo EAS | Bağımsız (React Native) |

---

## 📚 Paket Kütüphaneleri

| Paket | Amaç | Lokasyon |
|-------|------|----------|
| `@enkap/shared-types` | Paylaşılan TS type'ları (JWT, TenantContext, vb.) | `packages/shared-types/` |
| `@enkap/database` | Tenant izolasyonu, RBAC, TenantGuard | `packages/database/` |
| `@enkap/health` | Health checks, OpenTelemetry, Prometheus | `packages/health/` |
| `@enkap/mailer` | Nodemailer, Türkçe şablonlar | `packages/mailer/` |
| `@enkap/reporting` | PDF/Excel builders (DejaVu font) | `packages/reporting/` |

---

## 🔐 Kritik Mimarı Kurallar

### 1. Tenant İzolasyonu (ASLA İhlal Edilmez)
```typescript
// ✅ Doğru — getTenantContext() AsyncLocalStorage'dan
const { tenantId } = getTenantContext();
const repo = await TenantDataSourceManager.getDataSource(tenantId);

// ❌ Yanlış — tenant_id parametre olarak geçirilme, güvenilmez
function getInvoices(tenantId: string) { }
```

### 2. Token Güvenliği & Refresh Rotation
- Access: 1 saat, JTI revoke edilebilir
- Refresh: 7 gün, **tek kullanımlık** (Lua atomik sil)
- Mobilde: `expo-secure-store` (asla `AsyncStorage`)

### 3. Veritabanı Kural
- Tenant DataSource: `TenantDataSourceManager.getDataSource(tenantId)`
- Control Plane: `@InjectDataSource('control_plane')`
- Ham `pg` bağlantısı yasak — her zaman TypeORM

### 4. Gözlemlenebilirlik (Observability)
```typescript
// main.ts'de — NestFactory.create'ten ÖNCESİ
initTracing('service-name');

// AppModule'de
imports: [
  HealthModule,       // Zorunlu
  MetricsMiddleware,  // forRoutes('*')
]
```

### 5. Hata Yönetimi
- Domain hatası → kendi Exception sınıfı (`CrossTenantWriteError`, `TenantNotFoundError`)
- Saga pattern başarısız → `compensations.reverse()`
- Fire-and-forget → `.catch((err) => logger.warn(...))`

### 6. Türkiye Kuralları
- **KDV Oranları**: %0, %1, %10, %20
- **Tarih**: `dd.MM.yyyy` (GİB standarı)
- **Para**: ₺1.234,56 (`Intl.NumberFormat 'tr-TR'`)
- **Saat Dilimi**: `Europe/Istanbul` (DST yok)
- **Bordro 2025**: Asgari ücret 22.104,67 TL, SGK tavan 165.785,03 TL
- **Veri Merkezi**: Türkiye'de (KVKK md.9)

### 7. Migration Sistemi
- **Kaynağı**: `apps/tenant-service/src/provisioning/migration-runner.ts`
- **Tenant Şeması**: V001–V061
- **Control Plane**: CP001–CP015
- **DDL**: Asla uygulama kodu tarafından çalıştırılmaz

---

## 📡 RabbitMQ Olay Akışı

```
┌─────────────────┐
│ Order Service   │─► hr.employee.hired
│ HR Service      │─► hr.advance.approved
│ Financial-Svc   │◄─ Consume & TDHP yevmiye
└─────────────────┘

Topic Exchange: "enkap"
Routing Keys:
  - tenant.provisioning.*
  - waybill.*
  - hr.*
```

**Kritik Olaylar:**
| Routing Key | Kaynak | Hedef | Açıklama |
|------------|--------|-------|---------|
| `hr.employee.hired` | hr-service | auth-service | Hesap oluştur |
| `hr.employee.terminated` | hr-service | auth-service | Hesap kapat |
| `hr.advance.approved` | hr-service | treasury-service | Ödeme emri |
| `hr.payroll.finalized` | hr-service | financial-service | TDHP yevmiye |
| `waybill.*` | order/purchase | waybill-service | e-İrsaliye |

---

## 🚀 Hızlı Başlangıç

### 1. Repository Setup
```bash
cd /home/obi/Desktop/enkap

# Bağımlılıkları yükle
pnpm install

# Veritabanı & altyapı başlat
docker compose up -d postgres redis pgbouncer rabbitmq

# Migrasyonları çalıştır
pnpm db:migrate
```

### 2. Geliştirme Modu (Tüm Servisler)
```bash
# Terminal 1: Tüm servisleri başlat (Turborepo paralel)
pnpm dev

# Terminal 2: Watch lint/typecheck
pnpm typecheck --watch
```

### 3. Belirli Servis Çalıştırma
```bash
# Sadece financial-service
pnpm --filter @enkap/financial-service dev

# Sadece web dashboard
pnpm --filter @enkap/web dev
```

### 4. Test Çalıştırma
```bash
pnpm test:unit
pnpm test:integ
pnpm test:e2e
pnpm test:load
```

### 5. Demo Seed Data
```bash
pnpm demo:seed
# → Örnek tenant, kullanıcı, fatura, ürün oluşturur
```

---

## 📋 Modül Seçim Rehberi

**Hangi modülü çalışmamı gerekiyor?**

| Görev | Modül | Başla |
|-------|-------|-------|
| Yeni kullanıcı / OAuth | **auth-service** | [CLAUDE.md](./apps/auth-service/CLAUDE.md) |
| Fatura, KDV, GİB | **financial-service** | [CLAUDE.md](./apps/financial-service/CLAUDE.md) |
| Ürün, Depo, Lojistik | **stock-service** | [CLAUDE.md](./apps/stock-service/CLAUDE.md) |
| Satış Siparişi | **order-service** | [CLAUDE.md](./apps/order-service/CLAUDE.md) |
| Satın Alma | **purchase-service** | [CLAUDE.md](./apps/purchase-service/CLAUDE.md) |
| e-İrsaliye, UBL-TR | **waybill-service** | [CLAUDE.md](./apps/waybill-service/CLAUDE.md) |
| Bordro, SGK, İzin | **hr-service** | [CLAUDE.md](./apps/hr-service/CLAUDE.md) |
| Kasa, Banka, Mutabakat | **treasury-service** | [CLAUDE.md](./apps/treasury-service/CLAUDE.md) |
| Kiracı Provizyon | **tenant-service** | [CLAUDE.md](./apps/tenant-service/CLAUDE.md) |
| Platform Metrikleri, BI | **analytics-service** | [CLAUDE.md](./apps/analytics-service/CLAUDE.md) |
| Lead, Kişi, Aktivite | **crm-service** | [CLAUDE.md](./apps/crm-service/CLAUDE.md) |
| Tahminleme (XGBoost, Prophet) | **ml-inference** | [CLAUDE.md](./apps/ml-inference/CLAUDE.md) |
| LLM, OCR, Belge Analizi | **ai-assistant** | [CLAUDE.md](./apps/ai-assistant/CLAUDE.md) |
| Webhook Teslimatı | **webhook-hub** | [CLAUDE.md](./apps/webhook-hub/CLAUDE.md) |
| Abonelik, iyzico | **billing-service** | [CLAUDE.md](./apps/billing-service/CLAUDE.md) |
| Dashboard UI | **web** | [CLAUDE.md](./apps/web/CLAUDE.md) |
| Araç, Sürücü, GPS | **fleet-service** | [CLAUDE.md](./apps/fleet-service/CLAUDE.md) |
| BOM, MRP | **manufacturing-service** | [CLAUDE.md](./apps/manufacturing-service/CLAUDE.md) |

---

## 🔧 Genel Geliştirme Kuralları

### Code Style
```typescript
// ✅ Clean Code — Single Responsibility
export class InvoiceService {
  async createInvoice() { }
  async publishToGib() { }
}

// ✅ SOLID — Interface'ler I prefix'siz
interface IInvoiceRepository { }

// ❌ Hiç any tipi
const data: any = { };  // YASAK

// ✅ unknown veya gerçek tip
const data: unknown = { };
const data: InvoiceDTO = { };
```

### Async/Await
```typescript
// ✅ Bağımsız işlemleri paralel
await Promise.all([
  this.createInvoice(),
  this.sendNotification(),
  this.updateCache()
]);

// ❌ Gereksiz yere sequential
await this.createInvoice();
await this.sendNotification();
```

### Logging
```typescript
// ✅ Her servis loggerlı
private logger = new Logger(InvoiceService.name);
this.logger.error('Fatura oluşturulamadı', error);

// İş mantığı Türkçe, teknik İngilizce
this.logger.warn(`Kasa ${accountId} müdürü tarafından onay bekleniyor`);
```

### Para Birimi
```typescript
// ✅ DB: kuruş (integer/bigint)
const amountKurus = 123456;  // 1234.56 TL

// ✅ Gösterim: Intl.NumberFormat veya lib/format.ts
import { formatCurrency, kurusToTl } from '@/lib/format';
formatCurrency(kurusToTl(amountKurus))  // ₺1.234,56

// ❌ Inline dönüşüm
const tl = amountKurus / 100;  // YASAK
```

---

## 📊 Deployment & Infrastructure

### Lokal (Docker Compose)
```bash
docker compose up -d

# Kontrol et
docker compose ps
docker logs enkap_financial
```

### Kubernetes
```bash
# Build tüm image'ları
docker build -f infrastructure/docker/nestjs.Dockerfile .

# Deployment YAML'ları
kubectl apply -f infrastructure/kubernetes/
```

**Kritik Config'ler:**
- `infrastructure/kubernetes/config/` — ConfigMap, ExternalSecrets
- `infrastructure/kubernetes/monitoring/` — Prometheus, Grafana, Jaeger
- `infrastructure/kubernetes/network-policies/` — mTLS, ingress rules

### GitHub Actions
```
.github/workflows/
├── ci.yml          ← Lint, typecheck, test
├── deploy.yml      ← Staging/production deploy
└── mobile.yml      ← React Native EAS build
```

---

## 🐛 Hata Ayıklama

### Veritabanı Sorguları
```bash
# PostgreSQL psql ile bağlan
docker exec -it enkap_postgres psql -U enkap_user -d enkap_prod

# Tenant şemasında
SET search_path TO "tenant_uuid_here";
SELECT * FROM invoices LIMIT 5;

# Control plane
SELECT * FROM platform_metrics_snapshots;
```

### Logs
```bash
# Tüm servisler
docker compose logs -f

# Belirli servis
docker logs -f enkap_financial

# Kubernetes
kubectl logs -f deployment/financial-service
kubectl logs -f deployment/financial-service --previous  # Crashed pod
```

### Redis Debugging
```bash
docker exec -it enkap_redis redis-cli
> KEYS "tenant:*"
> GET "refresh:token:uuid"
```

### RabbitMQ Management
```
http://localhost:15672
Kullanıcı: guest
Şifre: guest

Queues: enkap topic exchange → routing key'lere abone kuyruklara
```

---

## 📚 Kaynaklar & Linkler

| Kaynak | Açıklama |
|--------|----------|
| **[PROGRESS.md](./PROGRESS.md)** | Görev takibi, sprint durumu |
| **[eksik_filtreler.md](./eksik_filtreler.md)** | Backend'de var olmayan filtreler |
| **[UI_RULES.md](./UI_RULES.md)** | Dashboard stil, renk, bileşen |
| **[ui_data_rule.md](./ui_data_rule.md)** | Veri sayfası (liste/tablo) formatı |
| **GIB_ENT_ROADMAP.md** | e-Belge uygulaması (eğer var ise) |
| **[Türkçe Paket.json](./package.json)** | Komut referansı |

---

## ❓ Sık Sorulan Sorular (FAQ)

**S: Yeni bir microservice nasıl eklerim?**
A: [Bkz. CLAUDE.md → "Yeni Servis Ekleme Şablonu"](./MASTER_CLAUDE.md#8-yeni-servis-ekleme-şablonu)

**S: Tenant verilerini sızıntıdan nasıl korurum?**
A: `getTenantContext()` + `TenantGuard` + `TenantAwareSubscriber` — [auth-service CLAUDE.md'ye bakın](./apps/auth-service/CLAUDE.md)

**S: GİB'e fatura nasıl gönderirim?**
A: [financial-service CLAUDE.md — GİB Modülü bölümü](./apps/financial-service/CLAUDE.md)

**S: Webhook nasıl çalışır?**
A: [webhook-hub CLAUDE.md — Outbox Pattern](./apps/webhook-hub/CLAUDE.md)

**S: Bordro hesaplaması 2025 kurallarına uygun mu?**
A: Evet — [hr-service CLAUDE.md](./apps/hr-service/CLAUDE.md)

---

## 📞 İletişim & Destek

| Kanal | Amaç |
|-------|------|
| **GitHub Issues** | Bug report, feature request |
| **Slack #enkap** | Team iletişim |
| **Docs** | Bkz. bu dosya ve her modülün CLAUDE.md |
| **Code Review** | PR açın, team feedback alın |

---

## 📝 Versiyon

- **Proje**: Enkap ERP
- **Ana Versiyon**: 0.1.0 (Beta)
- **Son Güncelleme**: 2026-04-03
- **Node**: ≥20.0.0
- **pnpm**: ≥9.0.0

---

## 🎓 Sonraki Adımlar

1. **Modülünüzü seçin** — Yukarıdaki tablodan
2. **CLAUDE.md'sini okuyun** — İlgili modülün detaylı rehberi
3. **Lokal setup yapın** — `pnpm install` + `docker compose up`
4. **Code yazın** — Style guide'ı takip edin
5. **Test edin** — `pnpm test`
6. **PR açın** — Team review için

**Kod yazma başlamadan önce modülün CLAUDE.md'sini okumanız şiddetle tavsiye olunur!**

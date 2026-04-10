# analytics-service (:3010) — CLAUDE.md

Analytics Service, Enkap platformunun **platform metrikleri**, **Business Intelligence (BI)** ve **kiracı kullanım takibi** modüllerini sağlar.

---

## Genel Bakış

| Özellik | Ayrıntı |
|---------|---------|
| Port | 3010 |
| Framework | NestJS 10 + Fastify |
| ORM | TypeORM 0.3 |
| DataSource | **control_plane** (platform-wide metrikleri) |
| Health Module | `ControlPlaneHealthModule` |
| Cron Jobs | 2 adet (daily usage collection, scheduled reports) |
| Modüller | `PlatformMetricsModule` · `BIModule` · `UsageModule` |

---

## Modül Yapısı

```
apps/analytics-service/src/
├── platform/
│   ├── platform-metrics.module.ts          PlatformMetricsModule
│   ├── platform-metrics.service.ts         Metrikleri sorgula
│   ├── platform-metrics.controller.ts      Platform admin endpoint'leri
│   └── platform-metrics.entity.ts          PlatformMetricsSnapshot entity
├── bi/
│   ├── bi.module.ts                        BIModule
│   ├── bi.service.ts                       Rapor/Dashboard/Widget CRUD + @Cron
│   ├── bi.controller.ts                    BI endpoint'leri
│   ├── bi-schema.initializer.ts            BI tablolarını IF NOT EXISTS oluştur
│   ├── entities/
│   │   ├── report-definition.entity.ts
│   │   ├── dashboard.entity.ts
│   │   └── widget.entity.ts
│   └── dto/
│       ├── create-report.dto.ts
│       └── create-dashboard.dto.ts
├── usage/
│   ├── usage.module.ts                     UsageModule
│   ├── usage-collector.service.ts          Günlük @Cron metrikler
│   └── tenant-usage.entity.ts              TenantUsageMetric entity
├── app.module.ts                           Root module
└── main.ts                                 Entry point
```

---

## Servisler & Sorumlulukları

### PlatformMetricsModule

**Amaç:** Platform yöneticisinin kiracı sayıları, gelir (MRR/ARR), özellik benimseme, cohort retention gibi metrikleri görmesi.

**PlatformMetricsService:**
```typescript
async getOverview(): Promise<PlatformOverview>
// → { today: {...}, trend: 30 günlük }
// today: totalTenants, activeTenants, mrrKurus, newTenants, vb.
// trend: tarihsel (aktiveTenant + MRR)

async getFeatureAdoption(): Promise<FeatureAdoptionRow[]>
// → [Marketplace, ML, HR, CRM] adoption % (7 günlük)

async getLeaderboard(limit?): Promise<TenantLeaderboard[]>
// → EN aktif 20 tenant (fatura sayısı + kullanıcı sayısı)

async getTenantHistory(tenantId, days?): Promise<TenantUsageMetric[]>
// → Tek kiracının 90 günlük kullanım geçmişi

async getCohortRetention(): Promise<CohortRow[]>
// → Kayıt ayına göre 12 aylık retention % (CTE SQL)
```

**PlatformMetricsController:**
```
GET  /api/v1/analytics/overview
GET  /api/v1/analytics/feature-adoption
GET  /api/v1/analytics/leaderboard?limit=20
GET  /api/v1/analytics/tenant/:tenantId/history?days=90
GET  /api/v1/analytics/cohort-retention
```

**Entity: PlatformMetricsSnapshot**
```typescript
{
  id: bigint;
  metricName: string;           // 'active_tenants' vs 'mrr_kurus'
  value: numeric;
  labels: JSONB;                // { tier: 'business', ... }
  recordedAt: timestamptz;
}
```

---

### BIModule — Business Intelligence (Sprint 6B)

**Amaç:** Kiracıların özel SQL raporları oluşturması, dashboard'lar tasarlaması, zamanlanmış rapor çalıştırıp e-posta alması.

**BIService:**
```typescript
async createReport(dto: CreateReportDto, tenantId): Promise<ReportDefinition>
// SQL template doğrulama (SELECT-only, no DDL)
// WHERE tenant_id = $1 zorunlu

async updateReport(id, dto, tenantId): Promise<ReportDefinition>
// Rapor metadata, schedule, email güncellemesi

async deleteReport(id, tenantId): Promise<void>

async listReports(tenantId): Promise<ReportDefinition[]>

async getReport(id, tenantId): Promise<ReportDefinition>

async executeReport(id, tenantId, params?): Promise<any[]>
// SQL çalıştır → { data: [...], columns: [...] }
// Kiracının tenant şemasında: getTenantContext() + TenantDataSourceManager

async runScheduledReports(): Promise<void>
// @Cron('0 9 * * *') — sabah 9:00 UTC
// İlk @Cron decorator methodlarını tarayarak otomatik çalıştır
// schedule_cron && schedule_email → Excel oluştur → e-posta

async createDashboard(dto, tenantId): Promise<Dashboard>

async updateDashboard(id, dto, tenantId): Promise<Dashboard>
// Grid layout güncelleme (lg=12 kolon, md=10 kolon)

async generateShareToken(dashboardId, tenantId): Promise<string>
// UUID token: public erişim için

async deleteShareToken(dashboardId, tenantId): Promise<void>
```

**BIController:**
```
# ReportDefinition
POST   /api/v1/bi/reports
GET    /api/v1/bi/reports
GET    /api/v1/bi/reports/:id
PATCH  /api/v1/bi/reports/:id
DELETE /api/v1/bi/reports/:id
POST   /api/v1/bi/reports/:id/execute          { parameters: {...} }
GET    /api/v1/bi/reports/:shareToken/public   (no auth)

# Dashboard
POST   /api/v1/bi/dashboards
GET    /api/v1/bi/dashboards
GET    /api/v1/bi/dashboards/:id
PATCH  /api/v1/bi/dashboards/:id
DELETE /api/v1/bi/dashboards/:id
POST   /api/v1/bi/dashboards/:id/share         { expiresAt?: Date }
GET    /api/v1/bi/dashboards/:shareToken/public (no auth)

# Widget
POST   /api/v1/bi/widgets
GET    /api/v1/bi/dashboards/:dashboardId/widgets
PATCH  /api/v1/bi/widgets/:id
DELETE /api/v1/bi/widgets/:id
```

**Entity: ReportDefinition**
```typescript
{
  id: UUID;
  tenantId: UUID;               // Tenant izolasyonu
  name: string;
  description?: string;
  queryTemplate: string;        // "SELECT ... FROM ... WHERE tenant_id = $1"
  parameters: JSONB;            // [{name: 'date_from', type: 'date'}, ...]
  isPublic: boolean;
  shareToken?: UUID unique;     // Public share linki
  scheduleCron?: string;        // '0 9 * * *' (cron expression)
  scheduleEmail?: string;       // E-posta alıcısı (virgülle ayrılmış)
  scheduleFormat: 'pdf'|'excel';
  lastRunAt?: timestamptz;
  createdBy: UUID;              // Kiracı içindeki user_id
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**Entity: Dashboard**
```typescript
{
  id: UUID;
  tenantId: UUID;               // Tenant izolasyonu
  name: string;
  description?: string;
  layout: DashboardLayout;      // JSON { lg: GridItem[], md: GridItem[] }
  isDefault: boolean;           // Tek dashboard = true olabilir
  shareToken?: UUID unique;     // Public share linki
  createdAt: timestamptz;
  updatedAt: timestamptz;
  widgets: Widget[];            // OneToMany
}

interface GridItem {
  i: string;        // Widget ID
  x: number;        // Sol kolon (0–11)
  y: number;        // Üst satır
  w: number;        // Genişlik (1–12 kolon)
  h: number;        // Yükseklik (satırlar)
}

interface DashboardLayout {
  lg: GridItem[];   // Masaüstü (12 kolon)
  md: GridItem[];   // Tablet (10 kolon)
}
```

**Entity: Widget**
```typescript
{
  id: UUID;
  dashboardId: UUID;            // Dashboard'a bağlı (ForeignKey)
  type: 'bar'|'line'|'pie'|'table'|'kpi';
  reportDefinitionId?: UUID;    // Veya inline query
  title: string;
  description?: string;
  config: JSONB;                // { yAxis: 'value', xAxis: 'date', colors: [...] }
  position: GridItem;           // { i, x, y, w, h }
  refreshIntervalSeconds?: number; // 60 = her dakika yenile (Frontend)
  createdAt: timestamptz;
  updatedAt: timestamptz;
}
```

**BISchemaInitializer:**
- `OnModuleInit()` → control_plane'de BI tabloları IF NOT EXISTS oluştur
- Geliştirme modunda Docker init.sql çalıştırılamadıysa backup olarak çalışır

---

### UsageModule

**Amaç:** Her kiracının günlük kullanım metriklerini (invoice, user, product, vb.) topla.

**UsageCollectorService:**
```typescript
@Cron('0 2 * * *')  // Her gün UTC 02:00
async collectDailyMetrics(): Promise<void> {
  // 1. TenantRoutingService.findAllActiveIds() → tüm tenant ID'leri
  // 2. Her tenant için:
  //    - TenantDataSourceManager.getDataSource(tenantId) → tenant şeması
  //    - COUNT(*) FROM invoices WHERE DATE(created_at) = YESTERDAY
  //    - COUNT(DISTINCT user_id) FROM members
  //    - COUNT(*) FROM products
  //    - COUNT(*) FROM stock_movements
  //    - COUNT(*) FROM crm_contacts WHERE type = 'lead'
  //    - COUNT(*) FROM employees WHERE status = 'active'
  // 3. INSERT INTO tenant_usage_metrics (tenant_id, metric_date, ...)
  //    VALUES (tenantId, YESTERDAY, invoiceCount, ...)
  //    ON CONFLICT (tenant_id, metric_date) DO UPDATE
}
```

**Entity: TenantUsageMetric**
```typescript
{
  id?: bigint;
  tenantId: UUID;               // control_plane'de
  metricDate: date;             // YESTERDAY (backfill için)
  userCount: int;
  invoiceCount: int;
  productCount: int;
  stockMovements: int;
  leadCount: int;
  employeeCount: int;
  usedMarketplace?: boolean;
  usedMl?: boolean;
  usedHr?: boolean;
  usedCrm?: boolean;
  recordedAt: timestamptz DEFAULT NOW();
}
```

---

## Database Tables (control_plane şeması)

| Tablo | Migration | Açıklama |
|-------|-----------|---------|
| `platform_metrics_snapshots` | CP009 | Günlük platform metrikleri snapshot |
| `report_definitions` | CP010 | Özel SQL raporları |
| `dashboards` | CP010 | BI dashboard'ları |
| `widgets` | CP010 | Dashboard widget'ları |
| `tenant_usage_metrics` | CP011 | Kiracı günlük kullanım |

---

## API Endpoints

### Platform Metrikleri (Yönetici)
```
GET  /api/v1/analytics/overview
     → PlatformOverview { today: {...}, trend: [...] }

GET  /api/v1/analytics/feature-adoption
     → [{ feature: 'Marketplace', tenantCount, adoptionPct }, ...]

GET  /api/v1/analytics/leaderboard?limit=20
     → TenantLeaderboard[] (invoice_count DESC)

GET  /api/v1/analytics/tenant/:tenantId/history?days=90
     → TenantUsageMetric[]

GET  /api/v1/analytics/cohort-retention
     → [{ cohort_month, cohort_size, still_active, churned, retention_pct }, ...]
```

### BI Raporlar (Kiracı)
```
POST   /api/v1/bi/reports
       CreateReportDto → ReportDefinition

GET    /api/v1/bi/reports
       → ReportDefinition[] (tenantId tarafından filtrelenen)

GET    /api/v1/bi/reports/:id
       → ReportDefinition

PATCH  /api/v1/bi/reports/:id
       → ReportDefinition (güncellenen)

DELETE /api/v1/bi/reports/:id
       → 204 No Content

POST   /api/v1/bi/reports/:id/execute
       Request: { parameters: { date_from: '2026-01-01', ... } }
       Response: { data: [...], columns: [...] }

GET    /api/v1/bi/reports/:shareToken/public
       (Kimlik doğrulamayız) → Rapor sonuçları (isPublic=true)
```

### BI Dashboard'ları (Kiracı)
```
POST   /api/v1/bi/dashboards
       CreateDashboardDto → Dashboard

GET    /api/v1/bi/dashboards
       → Dashboard[]

GET    /api/v1/bi/dashboards/:id
       → Dashboard (+ widgets)

PATCH  /api/v1/bi/dashboards/:id
       → Dashboard (layout güncellemesi)

DELETE /api/v1/bi/dashboards/:id
       → 204 No Content

POST   /api/v1/bi/dashboards/:id/share
       Request: { expiresAt?: Date }
       Response: { shareToken, expiresAt }

GET    /api/v1/bi/dashboards/:shareToken/public
       (Kimlik doğrulamayız) → Dashboard + widgets
```

### BI Widget'ları (Kiracı)
```
POST   /api/v1/bi/widgets
       CreateWidgetDto → Widget

GET    /api/v1/bi/dashboards/:dashboardId/widgets
       → Widget[]

PATCH  /api/v1/bi/widgets/:id
       → Widget (config/position güncellemesi)

DELETE /api/v1/bi/widgets/:id
       → 204 No Content
```

---

## Önemli Kurallar & Uyarılar

### 1. SQL Validation
```typescript
// ✅ Doğru — SELECT-only
SELECT invoice_no, total_amount FROM invoices WHERE tenant_id = $1

// ❌ Yasak — DDL/DML
CREATE TABLE ..., DROP TABLE ..., DELETE FROM ..., INSERT INTO ...
TRUNCATE, ALTER, UPDATE
```

**Validasyon:**
- Regex: `/\b(CREATE|DROP|DELETE|INSERT|UPDATE|TRUNCATE|ALTER)\b/i` → Exception
- Token analizi: WHERE tenant_id = $1 kontrol

### 2. Tenant İzolasyonu
```typescript
// BIService.executeReport() içinde:
const tenantContext = getTenantContext();
const tenantDs = await TenantDataSourceManager.getDataSource(tenantContext.tenantId);

// SQL parametreleri:
// queryTemplate: "SELECT ... WHERE tenant_id = $1"
// Parametreler: [tenantId, ...userParams]
```

### 3. Scheduled Reports (@Cron)
```typescript
// BIService.runScheduledReports() — @Cron('0 9 * * *')
// 1. schedule_cron && schedule_email olan raporları bul
// 2. SQL çalıştır (executeReport)
// 3. ExcelBuilderService → Excel bytes oluştur
// 4. MailerService.send({ to: schedule_email, attachment: excel })
```

### 4. Dashboard Layout (Responsive)
```typescript
// Grid: lg=12 kolon, md=10 kolon
const layout: DashboardLayout = {
  lg: [
    { i: 'widget-1', x: 0, y: 0, w: 6, h: 4 },  // Sol yarı
    { i: 'widget-2', x: 6, y: 0, w: 6, h: 4 },  // Sağ yarı
  ],
  md: [
    { i: 'widget-1', x: 0, y: 0, w: 10, h: 5 }, // Full width
    { i: 'widget-2', x: 0, y: 5, w: 10, h: 5 }, // Full width
  ],
};
```

### 5. Share Token
```typescript
// Dashboard/Report public share:
const shareToken = crypto.randomUUID();
dashboard.shareToken = shareToken;
await dashboardRepo.save(dashboard);

// Frontend:
// GET /api/v1/bi/dashboards/{shareToken}/public → Kimlik doğrulamayız
// Middleware'de: if (shareToken) → TenantGuard atla
```

### 6. Cron Jobs — UTC Timezone
```typescript
@Cron('0 2 * * *')      // 02:00 UTC (05:00 TRY)
@Cron('0 9 * * *')      // 09:00 UTC (12:00 TRY)
@Cron('0 23 * * *')     // 23:00 UTC (02:00 TRY ertesi gün)

// ⚠️ TRY timezone KULLANMA — UTC sabit
```

### 7. Health Checks
```typescript
// ControlPlaneHealthModule
GET /api/v1/health      → { status: 'up', checks: {...} }
GET /api/v1/health/ready → K8s readiness probe
```

---

## Geliştirme & Test

### Çalıştırma
```bash
pnpm --filter @enkap/analytics-service dev
# NODE_ENV=development ts-node -r tsconfig-paths/register src/main.ts
```

### Test Sorgularını Çalıştırma
```bash
# Platform metrikleri
curl http://localhost:3010/api/v1/analytics/overview

# BI rapor oluşturma
curl -X POST http://localhost:3010/api/v1/bi/reports \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aylık Satışlar",
    "queryTemplate": "SELECT DATE(created_at) as day, SUM(total_kurus) as total FROM invoices WHERE tenant_id = $1 GROUP BY DATE(created_at)",
    "scheduleCron": "0 9 * * MON",
    "scheduleEmail": "satismanager@company.com",
    "scheduleFormat": "excel"
  }'

# Dashboard oluşturma
curl -X POST http://localhost:3010/api/v1/bi/dashboards \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sales Dashboard",
    "layout": {
      "lg": [{"i":"widget-1","x":0,"y":0,"w":6,"h":4}],
      "md": [{"i":"widget-1","x":0,"y":0,"w":10,"h":4}]
    }
  }'
```

---

## Kaynaklar

- **Ana CLAUDE.md:** `/home/obi/Desktop/enkap/CLAUDE.md` — analytics-service (:3010) bölümü
- **Backend doğrulaması:** TypeORM DataSource, TenantDataSourceManager
- **Frontend:** `/home/obi/Desktop/enkap/apps/web/src/services/analytics.ts`


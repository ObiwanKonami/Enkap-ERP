# Manufacturing Service — Üretim Modülü (Port :3014)

## Nedir?

Manufacturing Service, Enkap ERP'de **üretim planlama ve BOM (Reçete) yönetimi** sağlar. Ürün üretim sürecini reçete tanımlamadan iş emri oluşturmaya kadar yönetir. Temel sorumluluklar:

- **BOM (Reçete)**: Mamul ürün için gereken hammadde/yarı mamul listesi
- **İş Emri (Work Order)**: Üretim talimatı — reçeteye dayalı planlama ve takip
- **MRP (Material Requirements Planning)**: Verilen hedef üretim miktarı için hammadde ihtiyaçlarını otomatik hesapla
- **Operasyon Adımları**: Üretim sürecindeki her aşamayı tanımla ve izle

---

## Modül Yapısı

```
apps/manufacturing-service/
├── src/
│   ├── main.ts                       ← Bootstrap (Fastify, OTel tracing)
│   ├── app.module.ts                 ← Root modul
│   ├── bom/
│   │   ├── entities/
│   │   │   ├── bom.entity.ts         ← Reçete entity
│   │   │   └── bom-line.entity.ts    ← Reçete kalemi entity
│   │   ├── dto/
│   │   │   ├── create-bom.dto.ts     ← Reçete oluşturma
│   │   │   └── update-bom.dto.ts     ← Reçete güncelleme
│   │   ├── bom.service.ts            ← Business logic
│   │   ├── bom.controller.ts         ← REST endpoints
│   │   └── bom.module.ts             ← Module definition
│   ├── work-order/
│   │   ├── entities/
│   │   │   ├── work-order.entity.ts  ← İş emri entity
│   │   │   └── work-order-operation.entity.ts ← Operasyon adımı
│   │   ├── dto/
│   │   │   ├── create-work-order.dto.ts
│   │   │   └── complete-work-order.dto.ts
│   │   ├── work-order.service.ts     ← İş emri işlemleri
│   │   ├── work-order.controller.ts  ← REST endpoints
│   │   └── work-order.module.ts
│   └── mrp/
│       ├── mrp.service.ts            ← MRP hesaplama
│       ├── mrp.controller.ts         ← Hesaplama API
│       └── mrp.module.ts
├── package.json
└── tsconfig.json
```

---

## Entity Modeli

### BOM (Reçete) — `boms` tablosu

```typescript
@Entity('boms')
export class Bom {
  id: UUID;                     // PK
  tenantId: UUID;               // Tenant izolasyonu (MANDATORY)
  productId: UUID;              // Mamul ürün (stock-service referans)
  productName: string;          // Snapshot — stok değişirse etkilenmez
  revisionNo: string;           // Mühendislik revizyon (1.0, 2.1 vb.)
  description?: string;         // Reçete açıklaması
  isActive: boolean;            // Bir ürün için max 1 aktif reçete
  lines: BomLine[];             // OneToMany ilişki
  createdAt: Date;
  updatedAt: Date;
}
```

**Kurallar:**
- Bir mamul ürün için **en fazla bir aktif reçete** olabilir
- Yeni aktif reçete oluşturulursa eski aktif reçete otomatik pasife alınır
- Reçete hiçbir zaman fiziksel olarak silinmez — `isActive=false` yapılır
- `revisionNo` mühendislik değişikliklerini izler

### BOM Line (Reçete Kalemi) — `bom_lines` tablosu

```typescript
@Entity('bom_lines')
export class BomLine {
  id: UUID;                    // PK
  bomId: UUID;                 // Reçete referans (CASCADE ON DELETE)
  materialId: UUID;            // Hammadde/yarı mamul (stock-service)
  materialName: string;        // Snapshot
  sku?: string;                // Stok kodu
  quantity: NUMERIC(12,3);     // Net miktar (ör: 2.500 KG)
  scrapRate: NUMERIC(5,2);     // Fire oranı % (0-100, default: 0)
                               // Brüt ihtiyaç = quantity × (1 + scrapRate/100)
  warehouseId?: UUID;          // Hammaddenin çekileceği depo
  unitOfMeasure: VARCHAR(20);  // ADET, KG, LT, MT vb. (default: ADET)
}
```

**Brüt İhtiyaç Formülü (MRP'de kullanılır):**
```
Brüt ihtiyaç = hedef_üretim_miktarı × kalem_miktarı × (1 + fire_oranı / 100)
```

Örnek:
- Hedef üretim: 100 masa
- Bir masa için çelik levha: 2.5 KG
- Fire oranı: %5
- **Brüt ihtiyaç = 100 × 2.5 × 1.05 = 262.5 KG**

### WorkOrder (İş Emri) — `work_orders` tablosu

```typescript
@Entity('work_orders')
export class WorkOrder {
  id: UUID;                      // PK
  tenantId: UUID;                // Tenant izolasyonu
  woNumber: VARCHAR(20) UNIQUE;  // Format: WO-{YYYY}-{NNNN}
                                 // Seq: SELECT get_next_wo_seq($1) — PostgreSQL fonksiyon
  bomId: UUID;                   // Kullanılan reçete
  productId: UUID;               // Mamul ürün
  productName: string;           // Snapshot
  targetQuantity: NUMERIC(12,3); // Hedef üretim miktarı
  producedQuantity: NUMERIC(12,3); // Gerçekleşen (default: 0)

  status: ENUM;                  // TASLAK | PLANLI | URETIMDE | TAMAMLANDI | IPTAL
  plannedStartDate: DATE;        // Planlanan başlama
  plannedEndDate: DATE;          // Planlanan bitiş
  actualStartDate?: DATE;        // Fiili başlama (startProduction() çağrıldığında)
  actualEndDate?: DATE;          // Fiili bitiş (complete() çağrıldığında)

  warehouseId?: UUID;            // Mamulün girileceği depo
  notes?: TEXT;                  // Notlar (ör: "Acil sipariş")
  createdBy: UUID;               // Oluşturan kullanıcı
  operations: WorkOrderOperation[]; // OneToMany ilişki
  createdAt: Date;
  updatedAt: Date;
}
```

**Status Geçiş Diyagramı:**
```
TASLAK ──create──> PLANLI ──startProduction──> URETIMDE ──complete──> TAMAMLANDI
  │                                                │
  └────────────────── cancel() ──────────────────> IPTAL
```

### WorkOrderOperation (Operasyon Adımı) — `work_order_operations` tablosu

```typescript
@Entity('work_order_operations')
export class WorkOrderOperation {
  id: UUID;
  workOrderId: UUID;              // İş emri referans (CASCADE)
  sequence: INT;                  // Sıra numarası (küçük değer önce)
  operationName: VARCHAR(200);    // Talaşlama, Montaj, Boya vb.
  workCenter?: VARCHAR(100);      // Torna Tezgahı 1, Montaj Hattı A vb.

  plannedDurationMinutes: INT;    // Planlanan süre (dakika)
  actualDurationMinutes?: INT;    // Fiili süre (completeOperation() sonunda)

  status: ENUM;                   // BEKLIYOR | DEVAM | TAMAMLANDI
  completedAt?: TIMESTAMP;        // Tamamlanma zamanı
}
```

**Status değerleri:**
- `BEKLIYOR`: Başlanmamış
- `DEVAM`: Devam ediyor
- `TAMAMLANDI`: Tamamlandı

---

## API Endpoint'leri

### BOM Endpoints

```
POST   /api/v1/bom
       Reçete oluştur
       Body: CreateBomDto
       Response: Bom (lines ile birlikte)

GET    /api/v1/bom?productId=UUID&isActive=true&page=1&limit=20
       Reçete listesi (pagination + filtre)
       Response: { items: Bom[], total, page, limit }

GET    /api/v1/bom/:id
       Reçete detayı
       Response: Bom (lines ile)

PATCH  /api/v1/bom/:id
       Reçete güncelle
       Body: UpdateBomDto (kısmi update)
       Response: Bom

DELETE /api/v1/bom/:id
       Reçeteyi pasife al (soft delete — isActive=false)
       Response: 204 No Content
```

### WorkOrder Endpoints

```
POST   /api/v1/work-order
       İş emri oluştur
       Body: CreateWorkOrderDto
       Response: WorkOrder (operations ile)

GET    /api/v1/work-order?status=URETIMDE&productId=UUID&page=1&limit=20
       İş emri listesi
       Response: { items: WorkOrder[], total, page, limit }

GET    /api/v1/work-order/:id
       İş emri detayı
       Response: WorkOrder

PATCH  /api/v1/work-order/:id/start
       Üretimi başlat (PLANLI → URETIMDE)
       Body: { actualStartDate?: Date }
       Response: WorkOrder (actualStartDate doldurulur)

POST   /api/v1/work-order/:id/complete
       Üretimi tamamla (URETIMDE → TAMAMLANDI)
       Body: CompleteWorkOrderDto { producedQuantity, notes? }
       Response: WorkOrder (actualEndDate doldurulur)

POST   /api/v1/work-order/:id/cancel
       İş emri iptal et (any status → IPTAL)
       Body: { reason?: string }
       Response: WorkOrder
```

### MRP Endpoint

```
GET    /api/v1/mrp/requirements?bomId=UUID&quantity=100
       Hammadde ihtiyaçlarını hesapla
       Response: MaterialRequirement[]
       [
         {
           materialId: UUID,
           materialName: "Çelik Levha",
           sku: "MAT-001",
           requiredQuantity: 262.5,  // Fire dahil brüt
           warehouseId?: UUID,
           unitOfMeasure: "KG"
         },
         ...
       ]
```

---

## DTO'lar

### CreateBomDto

```typescript
{
  productId: UUID;              // Mamul ürün (zorunlu)
  productName: string;          // Mamul adı (zorunlu)
  revisionNo?: string;          // Default: "1.0"
  description?: string;         // Açıklama
  isActive?: boolean;           // Default: true — yeni aktif reçete diğerlerini pasife alır
  lines: CreateBomLineDto[];    // En az 1 adet (zorunlu)
}

// CreateBomLineDto
{
  materialId: UUID;             // Hammadde (zorunlu)
  materialName: string;         // Hammadde adı (zorunlu)
  sku?: string;                 // Stok kodu
  quantity: number;             // Net miktar > 0 (zorunlu)
  scrapRate?: number;           // %0-100, default: 0
  warehouseId?: UUID;           // Depo
  unitOfMeasure?: string;       // Default: ADET
}
```

### UpdateBomDto

```typescript
{
  productName?: string;
  revisionNo?: string;
  description?: string;
  isActive?: boolean;           // true ise diğer aktif reçeteler pasife alınır
  lines?: CreateBomLineDto[];   // Tüm kalemleri değiştirir (delete + insert)
                                 // En az 1 adet olmalı
}
```

### CreateWorkOrderDto

```typescript
{
  bomId: UUID;                  // Reçete (zorunlu)
  productId: UUID;              // Mamul ürün (zorunlu)
  productName: string;          // Mamul adı (zorunlu)
  targetQuantity: number;       // Hedef miktar > 0 (zorunlu)
  plannedStartDate: ISO8601;    // Format: 2026-04-01 (zorunlu)
  plannedEndDate: ISO8601;      // Format: 2026-04-15 (zorunlu)
  warehouseId?: UUID;           // Mamulün girileceği depo
  notes?: string;               // Notlar
  operations?: CreateWorkOrderOperationDto[]; // Operasyon adımları (opsiyonel)
}

// CreateWorkOrderOperationDto
{
  sequence: int;                // Sıra numarası >= 1 (zorunlu)
  operationName: string;        // Operasyon adı (zorunlu)
  workCenter?: string;          // İş merkezi
  plannedDurationMinutes: int;  // Süre >= 1 (zorunlu)
}
```

### CompleteWorkOrderDto

```typescript
{
  producedQuantity: number;     // Gerçekleşen miktar >= 0 (zorunlu)
  notes?: string;               // Not ekle
}
```

---

## Service Metodları

### BomService

```typescript
// Reçete oluştur — isActive=true ise eski aktif reçeteler pasife alınır
async create(dto: CreateBomDto): Promise<Bom>

// Reçete listesi
async findAll(params?: {
  productId?: UUID;
  isActive?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ items: Bom[], total, page, limit }>

// Reçete detayı (lines ile birlikte)
async findOne(id: UUID): Promise<Bom>

// Reçete güncelle — lines güncellenebilir
async update(id: UUID, dto: UpdateBomDto): Promise<Bom>

// Reçeteyi pasife al (soft delete)
async deactivate(id: UUID): Promise<void>
```

### WorkOrderService

```typescript
// İş emri oluştur
// WO numarası: PostgreSQL sequence get_next_wo_seq($1) ile otomatik oluşturulur
// Format: WO-{YYYY}-{NNNN} (ör: WO-2026-0001)
async create(dto: CreateWorkOrderDto, createdBy: UUID): Promise<WorkOrder>

// İş emri listesi
async findAll(params?: {
  status?: WorkOrderStatus;
  productId?: UUID;
  page?: number;
  limit?: number;
}): Promise<{ items: WorkOrder[], total, page, limit }>

// İş emri detayı
async findOne(id: UUID): Promise<WorkOrder>

// Üretimi başlat — PLANLI → URETIMDE
// actualStartDate = now() (veya parametre varsa o tarih)
async startProduction(id: UUID, actualStartDate?: Date): Promise<WorkOrder>

// Üretimi tamamla — URETIMDE → TAMAMLANDI
// producedQuantity ve actualEndDate doldurulur
async complete(id: UUID, dto: CompleteWorkOrderDto): Promise<WorkOrder>

// İş emri iptal et — any status → IPTAL
async cancel(id: UUID, reason?: string): Promise<WorkOrder>

// Operasyon adımlarını güncelle
async updateOperations(id: UUID, operations: CreateWorkOrderOperationDto[]): Promise<WorkOrder>
```

### MrpService

```typescript
// Hammadde ihtiyaçlarını hesapla
// Her kalem için brüt ihtiyaç = quantity × (1 + scrapRate/100) çarpılı talep miktarı ile
async calculateRequirements(
  bomId: UUID,
  quantity: number
): Promise<MaterialRequirement[]>
// MaterialRequirement {
//   materialId: UUID,
//   materialName: string,
//   sku?: string,
//   requiredQuantity: number,  // Brüt (fire dahil)
//   warehouseId?: UUID,
//   unitOfMeasure: string
// }
```

---

## Önemli Kurallar

### 1. Tenant İzolasyonu
- Her entity'de `tenantId` zorunludur
- `TenantGuard` ile endpoint'ler korunur
- `TenantDataSourceManager.getDataSource(tenantId)` ile tenant'a özgü DB bağlantısı alınır

```typescript
async findOne(id: UUID): Promise<Bom> {
  const { tenantId } = getTenantContext();
  const ds = await this.dsManager.getDataSource(tenantId);
  const bomRepo = ds.getRepository(Bom);
  return bomRepo.findOne({ where: { id, tenantId } });
}
```

### 2. Reçete Aktiflik Kuralı
- Bir ürün için **en fazla bir aktif reçete** (isActive=true)
- Yeni aktif reçete oluşturulursa eski otomatik pasife alınır
- Hiçbir fiziksel silme yapılmaz

```typescript
if (dto.isActive !== false) {
  await em.update(
    Bom,
    { tenantId, productId: dto.productId, isActive: true },
    { isActive: false },
  );
}
```

### 3. İş Emri Numaralandırması
- Format: `WO-{YYYY}-{NNNN}` (ör: WO-2026-0001)
- PostgreSQL sequence fonksiyonu: `get_next_wo_seq($1)` — yıl parametresi ile
- Yarış koşulu yok — veritabanı seviyesinde atomik

```typescript
const seqRow = await ds.query(`SELECT get_next_wo_seq($1) AS seq`, [year]);
const woNumber = `WO-${year}-${String(seqRow[0].seq).padStart(4, '0')}`;
```

### 4. Brüt İhtiyaç Hesaplama (MRP)
- Formül: `quantity × (1 + scrapRate / 100)`
- Hammadde temininde bu brüt miktarı dikkate almak gerekir
- Fire oranı (scrapRate) %0-100 arası olabilir

### 5. Transaction Kullanımı
- BOM ve WO oluşturma `ds.transaction()` içinde yapılır
- Atomiklik sağlanır — kısmi oluşturma yok

```typescript
return ds.transaction(async (em) => {
  // İşlemler
  const saved = await em.save(Bom, bom);
  return saved;
});
```

### 6. Status Geçişleri (WorkOrder)
```
TASLAK  ──create──>  PLANLI  ──startProduction──>  URETIMDE  ──complete──>  TAMAMLANDI
  │                                                   │
  └──────────────────────── cancel() ───────────────>│
                                                      └──────→  IPTAL
```

- `cancel()` **her durumdan** çalışır → IPTAL
- `startProduction()` sadece PLANLI'den çalışır
- `complete()` sadece URETIMDE'den çalışır

---

## İlişkiler (Relations)

```
Bom (1) ──────────────────────────── (M) BomLine
  id = bomId (FK)
  - CASCADE ON DELETE
  - Eager loading (findOne, findAll'da relations: ['lines'])

WorkOrder (1) ─────────────────────── (M) WorkOrderOperation
  id = workOrderId (FK)
  - CASCADE ON DELETE
  - Eager loading (findOne'da relations: ['operations'])
```

---

## Veritabanı Göçleri (Migrations)

Manufacturing-service tabloları **tenant şemasına** oluşturulur. Göç dosyası:
- **Dosya**: `apps/tenant-service/src/provisioning/migration-runner.ts`
- **Kaynak**: `BASELINE_MIGRATIONS`

Tablolar:
- `boms` — Reçeteler
- `bom_lines` — Reçete kalemleri
- `work_orders` — İş emirleri
- `work_order_operations` — Operasyon adımları
- **Sequence**: `wo_seq_{yıl}` — WO numarası üretimi

Migration versiyonları:
- V037+ — İş emri sequence'i ve tablolar

---

## Stock-Service Entegrasyonu

Manufacturing-service, stock-service'ten **sadece okuma** yapar:
- BOM oluşturulurken `productId` ve `materialId` doğrulanmaz (UUID formatı kontrolü yeterli)
- Gerçek ürün detayları UI'da stock-service API'sinden çekilir
- WO oluşturulurken hedef miktar vs. stok bakiyesi kontrolü yapılmaz — bu üretime bağlı

---

## Treasury-Service Entegrasyoni (Gelecek)

İş emri tamamlandığında ilgili hammadde çıkışları ve üretim girdileri treasury-service'e bildirilecek. Şimdilik bu bağlantı yok — MRP hesabı yalnız yapılıyor.

---

## Geliştirme Başlangıcı

### Yerel Çalıştırma

```bash
# Manufacturing-service dev modunda başlat
pnpm --filter @enkap/manufacturing-service dev
# Listens on :3014

# Veya docker-compose ile
docker-compose up manufacturing-service postgres redis
```

### Örnek Request'ler

**Reçete Oluştur:**
```bash
curl -X POST http://localhost:3014/api/v1/bom \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "c3d4e5f6-...",
    "productName": "Masa Model A",
    "revisionNo": "1.0",
    "lines": [
      {
        "materialId": "a1b2c3d4-...",
        "materialName": "Çelik Levha 2mm",
        "sku": "MAT-001",
        "quantity": 2.5,
        "scrapRate": 5,
        "unitOfMeasure": "KG"
      }
    ]
  }'
```

**İş Emri Oluştur:**
```bash
curl -X POST http://localhost:3014/api/v1/work-order \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bomId": "b2c3d4e5-...",
    "productId": "c3d4e5f6-...",
    "productName": "Masa Model A",
    "targetQuantity": 100,
    "plannedStartDate": "2026-04-01",
    "plannedEndDate": "2026-04-15",
    "operations": [
      {
        "sequence": 1,
        "operationName": "Talaşlama",
        "workCenter": "Torna Tezgahı 1",
        "plannedDurationMinutes": 480
      },
      {
        "sequence": 2,
        "operationName": "Montaj",
        "workCenter": "Montaj Hattı A",
        "plannedDurationMinutes": 240
      }
    ]
  }'
```

**Hammadde İhtiyaçlarını Hesapla:**
```bash
curl "http://localhost:3014/api/v1/mrp/requirements?bomId=b2c3d4e5-...&quantity=100" \
  -H "Authorization: Bearer <token>"
```

---

## Swagger Documentation

Swagger UI üzerinde tüm endpoint'ler dokümante edilmiş. Erişim:
```
http://localhost:3014/api/docs
```

---

## Kod Kuralları

1. **Logger**: Her servis `new Logger(ClassName.name)` kullanır
2. **Exception Handling**: NestJS standard exceptions (NotFoundException, BadRequestException, ConflictException)
3. **Transaction**: Veri tutarlılığı için `ds.transaction()` kullanılır
4. **Türkçe Yorum**: İş mantığı Türkçe, teknik terimler İngilizce
5. **DTO Validation**: class-validator ile otomatik validasyon
6. **Any Type Yasak**: TypeScript strict mode — `unknown` veya gerçek tip

---

## Sorun Giderme

| Hata | Çözüm |
|------|-------|
| `Reçete bulunamadı` | BOM ID'nin doğru olup olmadığını ve BOM'un aktif olup olmadığını kontrol et |
| `Reçetede en az bir kalem olmalıdır` | BOM oluşturmada `lines` array'i boş gönderilmiş |
| `İş emri PLANLI durumda değil` | `startProduction()` sadece PLANLI durumdan çalışır |
| `Tenant context bulunamadı` | TenantGuard eksik — endpoint'e `@UseGuards(TenantGuard)` ekle |
| `WO sequence hatası` | PostgreSQL sequence `get_next_wo_seq` yok — migration'ı çalıştır |

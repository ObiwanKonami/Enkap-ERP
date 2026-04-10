# Fleet Service — Filo Yönetimi API

**Port:** 3017 | **Teknoloji:** NestJS + Fastify + TypeORM + WebSocket (Socket.IO)

Enkap ERP'nin filo yönetimi (araç, sürücü, sefer, bakım, yakıt, GPS, HGS) modülüdür. Türkiye mevzuatına ve multi-tenant mimarisine uygun olarak geliştirilmiştir.

---

## Modüller (AppModule Imports)

```typescript
VehicleModule       // Araç CRUD
DriverModule        // Sürücü, ehliyet, statü
TripModule          // Sefer planlama ve yönetimi
MaintenanceModule   // Araç bakım ve onarım kayıtları
FuelModule          // Yakıt gideri takibi
GpsModule           // Gerçek zamanlı GPS konumlandırma + WebSocket push
HgsModule           // Gişe geçiş (Otoyol Bilgi Sistemi) kayıtları
```

> **Tenant Context:** Tüm entity'lerde `tenant_id` sütunu zorunlu. TenantContextMiddleware otomatik olarak istek bağlamına tenant'ı yükler.

---

## Entity Yapıları

### Vehicle (araçlar)

**Tablo:** `vehicles`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `plate` | VARCHAR(20) | Plaka (örn: 34 ABC 123) |
| `brand` | VARCHAR(100) | Marka (Ford, Mercedes, Volvo) |
| `model` | VARCHAR(100) | Model (Transit, Actros) |
| `year` | INT | Model yılı |
| `type` | VARCHAR(20) | Araç tipi: `TIR`, `KAMYON`, `KAMYONET`, `PICKUP`, `FORKLIFT`, `DIGER` |
| `capacity_kg` | NUMERIC(10,2) | Yük kapasitesi (kg) |
| `volume_m3` | NUMERIC(10,2) | Hacim kapasitesi (m³) |
| `status` | VARCHAR(20) | Durumu: `AKTIF`, `PASIF`, `BAKIMDA` |
| `assigned_warehouse_id` | UUID | Bağlı depo (stock-service) |
| `current_km` | INT | Güncel kilometre sayacı |
| `vin` | VARCHAR(50) | Şasi numarası (VIN) |
| `registration_expires` | DATE | Ruhsat geçerlilik tarihi |
| `inspection_expires` | DATE | Muayene son tarihi |
| `insurance_expires` | DATE | Kasko son tarihi |
| `traffic_insurance_expires` | DATE | Trafik sigortası son tarihi |
| **GPS/Telematik** | | |
| `gps_device_id` | VARCHAR(100) | GPS cihaz ID'si (sağlayıcısından) |
| `gps_provider` | VARCHAR(50) | GPS sağlayıcı (teltonika, icomera vb.) |
| `last_lat` | NUMERIC(10,7) | Son enlem |
| `last_lng` | NUMERIC(10,7) | Son boylam |
| `last_speed_kmh` | INT | Son hız (km/h) |
| `last_location_at` | TIMESTAMP | Son konum güncellemesi |

**VehicleType enum:**
```typescript
type VehicleType = 'TIR' | 'KAMYON' | 'KAMYONET' | 'PICKUP' | 'FORKLIFT' | 'DIGER';
type VehicleStatus = 'AKTIF' | 'PASIF' | 'BAKIMDA';
```

---

### Driver (Sürücüler)

**Tablo:** `drivers`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `employee_id` | UUID | HR servisindeki çalışan ID'si (opsiyonel) |
| `first_name` | VARCHAR(100) | Ad |
| `last_name` | VARCHAR(100) | Soyadı |
| `phone` | VARCHAR(20) | İletişim telefonu |
| `license_class` | VARCHAR(5) | Ehliyet sınıfı: `B`, `C`, `CE`, `D`, `DE` |
| `license_number` | VARCHAR(50) | Ehliyet numarası |
| `license_expires` | DATE | Ehliyet geçerlilik tarihi |
| `status` | VARCHAR(20) | Durumu: `AKTIF`, `PASIF`, `IZINDE` |
| `current_vehicle_id` | UUID | Şu an atanmış araç |

**LicenseClass enum (Türkiye — 2016 Trafik Tüzüğü):**
```typescript
type LicenseClass = 'B'   // Otomobil
                  | 'C'   // Kamyon (7.5t üstü)
                  | 'CE'  // Kamyon + römork (tır ehliyeti)
                  | 'D'   // Otobüs
                  | 'DE'; // Otobüs + römork

type DriverStatus = 'AKTIF' | 'PASIF' | 'IZINDE';
```

> **HR Senkronizasyonu:** `hr-sync.controller.ts` — HR servisinden yeni çalışan event'i geldiğinde sürücü profili otomatik oluşturulabilir.

---

### Trip (Seferler)

**Tablo:** `trips`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `trip_number` | VARCHAR(30) | Sefer numarası: `SF-{YYYY}-{NNNN}` (PostgreSQL seq) |
| `vehicle_id` | UUID | Araç FK |
| `driver_id` | UUID | Sürücü FK |
| `sales_order_id` | UUID | İlişkili satış siparişi (order-service) |
| `delivery_id` | UUID | İlişkili sevkiyat (order-service delivery) |
| `origin` | VARCHAR(300) | Çıkış noktası (adres/depo) |
| `destination` | VARCHAR(300) | Varış noktası (adres/müşteri adresi) |
| `planned_departure` | TIMESTAMP | Planlanan kalkış |
| `actual_departure` | TIMESTAMP | Gerçek kalkış (yola çıkınca set) |
| `planned_arrival` | TIMESTAMP | Planlanan varış |
| `actual_arrival` | TIMESTAMP | Gerçek varış (tamamlanınca set) |
| `start_km` | INT | Başlangıç km sayacı |
| `end_km` | INT | Bitiş km sayacı |
| `distance_km` | INT | Hesaplanan mesafe (`endKm - startKm`) |
| `status` | VARCHAR(20) | Durumu: `PLANLANMIS`, `YOLDA`, `TAMAMLANDI`, `IPTAL` |
| `notes` | TEXT | Sefer notları |
| `created_by` | VARCHAR(100) | Oluşturan kullanıcı |

**TripStatus enum:**
```typescript
type TripStatus = 'PLANLANMIS'   // Oluşturuldu, henüz yola çıkmadı
                | 'YOLDA'         // Araç hareket halinde
                | 'TAMAMLANDI'    // Varış noktasına ulaşıldı
                | 'IPTAL';        // Sefer iptal edildi
```

> **Sefer Numarası:** PostgreSQL sequence `trip_seq_{yıl}` ile race-free üretilir. Format: `SF-2026-0001`

---

### GPS Location (Gerçek Zamanlı Konumlar)

**Tablo:** `gps_locations`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `trip_id` | UUID | Sefer FK |
| `vehicle_id` | UUID | Araç FK |
| `latitude` | NUMERIC(10,7) | Enlem |
| `longitude` | NUMERIC(10,7) | Boylam |
| `speed_kmh` | INT | Hız (km/h) |
| `direction` | INT | Yön (0–359 derece) |
| `recorded_at` | TIMESTAMP | GPS kaydı zamanı |

> **Webhook Entegrasyonu:** GPS cihazı (teltonika, icomera) `POST /api/v1/gps/webhook` endpoint'ine konum gönderir. Sistem otomatik olarak `vehicles.last_lat`, `last_lng`, `last_speed_kmh`, `last_location_at` günceller ve WebSocket üzerinden istemcilere broadcast yapar.

---

### Maintenance Record (Bakım Kayıtları)

**Tablo:** `maintenance_records`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `vehicle_id` | UUID | Araç FK |
| `maintenance_type` | VARCHAR(50) | Bakım tipi: `YAGLI_DEGISIM`, `LASTIK_DEGISIMI`, `MUAYENE`, `KAPORTA` vb. |
| `service_date` | DATE | Bakım tarihi |
| `cost_kurus` | BIGINT | Bakım ücreti (kuruş) |
| `next_due_date` | DATE | Sonraki bakım tarihi |
| `performed_by` | VARCHAR(200) | Bakım yapan servis/teknisyen |
| `notes` | TEXT | Bakım notları |

---

### Fuel Record (Yakıt Kayıtları)

**Tablo:** `fuel_records`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `vehicle_id` | UUID | Araç FK |
| `fuel_date` | DATE | Yakıt alım tarihi |
| `quantity_liters` | NUMERIC(10,2) | Yakıt miktarı (litre) |
| `cost_kurus` | BIGINT | Yakıt ücreti (kuruş) |
| `cost_per_liter_kurus` | BIGINT | Litre başına maliyet (kuruş) |
| `km_reading` | INT | Kilometre sayacı |
| `fuel_type` | VARCHAR(20) | Yakıt tipi: `BENZIN`, `DIESEL`, `LPG`, `ELEKTRIK` |

---

### HGS Record (Gişe Geçiş Kayıtları)

**Tablo:** `hgs_records`

| Sütun | Tip | Açıklama |
|-------|-----|---------|
| `id` | UUID | Primary Key |
| `tenant_id` | UUID | Multi-tenant izolasyonu |
| `vehicle_id` | UUID | Araç FK |
| `transaction_date` | TIMESTAMP | İşlem zamanı |
| `toll_road_name` | VARCHAR(200) | Otoyol adı (örn: O-4, D-750) |
| `toll_amount_kurus` | BIGINT | Geçiş ücreti (kuruş) |
| `gis_id` | VARCHAR(50) | GİŞ tarafından verilen işlem ID'si |
| `location` | VARCHAR(200) | Gişe konumu |
| `vehicle_category` | VARCHAR(10) | Araç kategorisi (2, 3, 4, 5, 6) |

> **HGS Entegrasyonu:** Türkiye Otoyol İşletme A.Ş.'den gişe geçiş verilerinin entegrasyonu (API polling veya webhook). Finansal raporlamada yakıt gideriyle birlikte logistik maliyetine dâhil edilir.

---

## API Endpoint'leri

### Vehicle Endpoints

```
POST   /api/v1/vehicles                      → Araç oluştur
GET    /api/v1/vehicles                      → Araç listesi (pagination, filter)
GET    /api/v1/vehicles/:id                  → Araç detayı
PATCH  /api/v1/vehicles/:id                  → Araç güncelle
DELETE /api/v1/vehicles/:id                  → Araç sil (soft delete)
POST   /api/v1/vehicles/:id/assign-warehouse → Depoya ata
POST   /api/v1/vehicles/:id/assign-driver    → Sürücü ata
GET    /api/v1/vehicles/:id/trips            → Araç seferleri
GET    /api/v1/vehicles/:id/gps-history      → GPS geçmişi (son 7 gün)
```

### Driver Endpoints

```
POST   /api/v1/drivers                       → Sürücü oluştur
GET    /api/v1/drivers                       → Sürücü listesi
GET    /api/v1/drivers/:id                   → Sürücü detayı
PATCH  /api/v1/drivers/:id                   → Sürücü güncelle
DELETE /api/v1/drivers/:id                   → Sürücü sil
POST   /api/v1/drivers/:id/assign-vehicle    → Araç ata
POST   /api/v1/drivers/:id/license-renewal   → Ehliyet yenileme bildirimi
GET    /api/v1/drivers/license-expirations   → Son tarihe yakın ehliyetler
```

### Trip Endpoints

```
POST   /api/v1/trips                         → Sefer oluştur
GET    /api/v1/trips                         → Sefer listesi (filter: status, dateRange)
GET    /api/v1/trips/:id                     → Sefer detayı
PATCH  /api/v1/trips/:id                     → Sefer güncelle (durum, km, zaman)
POST   /api/v1/trips/:id/start               → Seferi başlat (PLANLANMIS → YOLDA)
POST   /api/v1/trips/:id/complete            → Seferi tamamla (YOLDA → TAMAMLANDI)
POST   /api/v1/trips/:id/cancel              → Seferi iptal et
GET    /api/v1/trips/:id/gps-waypoints       → Sefer GPS rotası
```

### GPS Endpoints

```
POST   /api/v1/gps/webhook                   → GPS cihazı konumu gönder (webhook)
GET    /api/v1/gps/vehicles/:vehicleId       → Araç güncel konumu
GET    /api/v1/gps/vehicles/:vehicleId/history → Konumlandırma geçmişi
GET    /api/v1/gps/real-time                 → WebSocket kayıt (Socket.IO)
```

### Maintenance Endpoints

```
POST   /api/v1/maintenance                   → Bakım kaydı oluştur
GET    /api/v1/maintenance                   → Bakım kayıtları
GET    /api/v1/maintenance/:id               → Bakım detayı
PATCH  /api/v1/maintenance/:id               → Bakım güncelle
GET    /api/v1/maintenance/due               → Bakım vadesi gelen araçlar
```

### Fuel Endpoints

```
POST   /api/v1/fuel                          → Yakıt kaydı oluştur
GET    /api/v1/fuel                          → Yakıt kayıtları
GET    /api/v1/fuel/:id                      → Yakıt detayı
PATCH  /api/v1/fuel/:id                      → Yakıt kaydı güncelle
GET    /api/v1/fuel/consumption-report       → Yakıt tüketim raporu (km başına L)
```

### HGS Endpoints

```
POST   /api/v1/hgs                           → HGS kaydı oluştur
GET    /api/v1/hgs                           → HGS kayıtları
GET    /api/v1/hgs/sync                      → HGS sistemi ile senkronize et
GET    /api/v1/hgs/report                    → Gişe geçiş raporu (tarih aralığı)
```

---

## Servis Mimarisi

### VehicleService

```typescript
// Ana CRUD ve iş mantığı
create(dto, tenantId)
findAll(tenantId, filter, pagination)
findById(id, tenantId)
update(id, dto, tenantId)
delete(id, tenantId)
assignWarehouse(vehicleId, warehouseId, tenantId)
assignDriver(vehicleId, driverId, tenantId)
getGpsHistory(vehicleId, tenantId, days = 7)
```

### DriverService

```typescript
create(dto, tenantId)
findAll(tenantId, filter)
findById(id, tenantId)
update(id, dto, tenantId)
delete(id, tenantId)
assignVehicle(driverId, vehicleId, tenantId)
checkLicenseExpirations(tenantId)    // Cron job ile çağrılır
```

### TripService

```typescript
create(dto, tenantId)        // PLANLANMIS durumu ile başlar
findAll(tenantId, filter)
findById(id, tenantId)
startTrip(tripId, tenantId)  // PLANLANMIS → YOLDA, actualDeparture set
completeTrip(tripId, tenantId, endKm) // YOLDA → TAMAMLANDI, distanceKm = endKm - startKm
cancelTrip(tripId, reason, tenantId)
getWaypoints(tripId, tenantId)  // GPS rotası
```

### GpsService

```typescript
processWebhook(deviceId, location, timestamp)  // Webhook'tan çağrılır
updateVehicleLocation(vehicleId, lat, lng, speed)
getLatestLocation(vehicleId, tenantId)
getLocationHistory(vehicleId, tenantId, startDate, endDate)
broadcastToClients(vehicleId, location)  // WebSocket broadcast
```

> **WebSocket Entegrasyonu:** Socket.IO üzerinde real-time konum yayını. Bağlanan istemciler `subscribe:vehicle:{vehicleId}` event'ine katılır, konum güncellemesi alırlar.

---

## Cron Job'ları

| Zamanla | İş | Servis |
|---------|-----|--------|
| Her gün 08:00 | Ruhsat, muayene, sigorta son tarihleri kontrol et → uyarı | VehicleService |
| Her gün 08:15 | Ehliyet son tarihleri kontrol et → uyarı | DriverService |
| Her 6 saat | GPS cihazlarından verileri poll et (webhook değilse) | GpsService |
| Her 24 saat | Tamamlanan seferleri arşivle, bakım vadesi geçen araçları işaretle | TripService |

---

## İş Kuralları

### Sefer Yaşam Döngüsü

```
PLANLANMIS
    ↓
    POST /trips/:id/start
    ↓
    YOLDA (actualDeparture set, GPS trackingine başlar)
    ↓
    POST /trips/:id/complete
    ↓
    TAMAMLANDI (actualArrival, endKm, distanceKm set)

    ├─ Herhangi noktadan:
    └─ POST /trips/:id/cancel
       ↓
       IPTAL (reason + cancelledAt set)
```

### Araç Durumu Kuralları

- **AKTIF** → Sefer atanabilir, bakım, yakıt kaydı oluşturulabilir
- **PASIF** → Yeni sefer atanamaz, ancak tamamlanmayan seferler devam edebilir
- **BAKIMDA** → Sefer atanmaz, GPS takip devam eder

### Sürücü Durumu Kuralları

- **AKTIF** → Sefer atanabilir, ehliyet geçerliyse
- **PASIF** → Sefer atanamaz
- **IZINDE** → Seferleri başka sürücü tarafından devralabilir

---

## Tenant İzolasyonu

Her entity'de `tenant_id` sütunu **zorunludur** ve otomatik olarak `TenantContextMiddleware` tarafından eklenir:

```typescript
// ✅ Doğru — getTenantContext() otomatik
async create(dto: CreateVehicleDto) {
  const { tenantId } = getTenantContext();
  const vehicle = this.repo.create({ ...dto, tenantId });
  return this.repo.save(vehicle);
}

// ❌ Yanlış — parametre olarak geçirme
async create(dto: CreateVehicleDto, tenantId: string) { ... }
```

**Cross-tenant sızıntısını önlemek:** Tüm `findBy*()` sorgularında `WHERE tenant_id = $1` şartı **mutlak zorunlu**.

---

## Türkiye Mevzuatı

### Ehliyet Sınıfları (2016 Trafik Tüzüğü)

| Sınıf | Araç Tipi | Kurallı Yaş |
|-------|-----------|-----------|
| B | Otomobil (max 9 kişi) | 18+ |
| C | Kamyon (7.5t–12t) | 18+ |
| CE | Kamyon + römork (tır) | 18+ |
| D | Otobüs (8+ kişi) | 24+ |
| DE | Otobüs + römork | 24+ |

### Zorunlu İdari Veriler

- **Ruhsat (Belge-E):** Yıllık yenileme (3 aydır uygun olmayan araçla seyrüsefer cezalı)
- **Muayene (Teknik Kontrol):** 12 aylık periyod (son muayene tarihinden)
- **Kasko:** İşletme tercih ve şartı (bazı kurumlar zorunlu)
- **Trafik Sigortası:** Zorunlu (Kamulaştırma Kanunu)
- **HGS (Gişe Geçiş):** Ücretli otoyollarda zorunlu (fotoğraf cezası riski)

> Hepsi `vehicles` tablosunda tarih sütunları olarak saklanır, cron job'la uyarı tetiklenir.

---

## Entegrasyon Noktaları

### Order Service (→)

Sefer oluşturma sırasında:
- `salesOrderId`: sipariş numarası referansı
- `deliveryId`: sevkiyat referansı
- Trip tamamlandığında order-service'e event pub: `fleet.trip.completed`

### Stock Service (←)

Araç-depo atama:
- `assignedWarehouseId`: stock-service'den warehouse ID
- Depo transferi `GET /fleet/vehicles/{id}` endpoint'i warehouse validasyonu için

### HR Service (←)

Sürücü oluşturma:
- `employeeId`: HR servisindeki çalışan ID'si (opsiyonel)
- HR event: `hr.employee.hired` → Driver profile auto-create (opsiyonel)

### Financial Service (→)

Bakım ve yakıt maliyeti raporu:
- `POST /financial/expenses` → Bakım/Yakıt/HGS kayıtlarından gideri yayınla
- Filo maliyeti analize katılır

---

## İçin Dikkat Edilecekler

### 1. GPS Webhook Güvenliği

```typescript
// ✅ Doğru — HMAC signature doğrulaması
async processWebhook(req: Request) {
  const signature = req.headers['x-gps-signature'];
  const body = req.rawBody; // buffer
  const hash = crypto.createHmac('sha256', GPS_SECRET).update(body).digest('hex');
  if (hash !== signature) throw new UnauthorizedException();
}

// ❌ Yanlış — güvenlik kontrolü olmadan
async processWebhook(dto: GpsLocationDto) { ... }
```

### 2. Sefer Durum Geçişleri (Strict)

```typescript
// ✅ Doğru — durum kontrolü
async startTrip(tripId: string) {
  const trip = await this.repo.findOne(tripId);
  if (trip.status !== 'PLANLANMIS') {
    throw new BadRequestException(`Sefer ${trip.status} durumundadır`);
  }
  trip.status = 'YOLDA';
  trip.actualDeparture = new Date();
  return this.repo.save(trip);
}

// ❌ Yanlış — durum kontrolü olmadan
async startTrip(tripId: string) {
  await this.repo.update(tripId, { status: 'YOLDA' });
}
```

### 3. Kilometre Sayacı Mantığı

```typescript
// ✅ Doğru — km artışı monoton
async completeTrip(tripId: string, endKm: number) {
  const trip = await this.repo.findOne(tripId);
  if (endKm < trip.startKm) {
    throw new BadRequestException('Bitiş km başlangıçtan küçük olamaz');
  }
  trip.endKm = endKm;
  trip.distanceKm = endKm - trip.startKm;
  trip.status = 'TAMAMLANDI';
  trip.actualArrival = new Date();
  return this.repo.save(trip);
}
```

### 4. WebSocket Broadcast Kanal İzolasyonu

```typescript
// ✅ Doğru — tenant izolasyonlu kanal
@WebSocketGateway()
export class GpsGateway {
  private server: Server;

  @SubscribeMessage('subscribe:vehicle')
  subscribe(client: Socket, payload: { vehicleId: string }) {
    const { tenantId } = getTenantContext();
    // Doğrulama: vehicle tenantId'ye ait mi?
    client.join(`fleet:${tenantId}:vehicle:${vehicleId}`);
  }

  broadcastLocation(tenantId: string, vehicleId: string, location: GpsLocation) {
    this.server.to(`fleet:${tenantId}:vehicle:${vehicleId}`).emit('location-update', location);
  }
}
```

---

## Geliştirme

### Servis Başlatma

```bash
# Izole modda (dev)
pnpm --filter @enkap/fleet-service dev

# Docker'da (compose)
docker compose up fleet-service
```

### Swagger API Docs

```
http://localhost:3017/api/docs
```

### Test Senaryo — Sefer Oluştur ve Takip Et

```bash
# 1. Araç oluştur
curl -X POST http://localhost:3017/api/v1/vehicles \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "plate": "34 ABC 123", "brand": "Ford", "model": "Transit", "type": "KAMYONET" }'

# 2. Sürücü oluştur
curl -X POST http://localhost:3017/api/v1/drivers \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "firstName": "Ahmet", "lastName": "Yılmaz", "licenseClass": "B" }'

# 3. Sefer oluştur
curl -X POST http://localhost:3017/api/v1/trips \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "vehicleId": "...", "driverId": "...",
    "origin": "İstanbul Depo", "destination": "Ankara Şubesi",
    "plannedDeparture": "2026-04-03T09:00:00Z", "plannedArrival": "2026-04-03T18:00:00Z"
  }'

# 4. Seferi başlat
curl -X POST http://localhost:3017/api/v1/trips/{tripId}/start \
  -H "Authorization: Bearer $TOKEN"

# 5. GPS webhook (veya WebSocket üzerinden)
curl -X POST http://localhost:3017/api/v1/gps/webhook \
  -H "X-GPS-Signature: ..." \
  -d '{ "deviceId": "...", "latitude": 41.0082, "longitude": 28.9784, "speed": 85 }'

# 6. Seferi tamamla
curl -X POST http://localhost:3017/api/v1/trips/{tripId}/complete \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "endKm": 250 }'
```

---

## İlişkili Dosyalar

- `/apps/fleet-service/src/app.module.ts` — Modül import'ları
- `/apps/fleet-service/src/vehicle/` — Vehicle CRUD
- `/apps/fleet-service/src/driver/` — Driver CRUD + HR sync
- `/apps/fleet-service/src/trip/` — Trip lifecycle
- `/apps/fleet-service/src/gps/` — GPS WebSocket gateway
- `/apps/fleet-service/src/maintenance/` — Bakım kaydı
- `/apps/fleet-service/src/fuel/` — Yakıt kaydı
- `/apps/fleet-service/src/hgs/` — HGS entegrasyonu

Ayrıntılı kurallar için bkz: `/CLAUDE.md` (projeye ait proje-geneli talimatlar)


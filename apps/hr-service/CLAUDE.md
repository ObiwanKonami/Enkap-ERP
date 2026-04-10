# HR Service — Geliştirici Rehberi

## Hızlı Başlangıç

**Port:** 3007
**Teknoloji:** NestJS 10 + FastifyAdapter + PostgreSQL (tenant schema)
**Ana sorumluluk:** Çalışan yönetimi, bordro hesaplama (2025 SGK oranları), izin, SGK, masraf, avans, puantaj, fazla mesai, zimmet, işten çıkış

## Modül Yapısı

```
apps/hr-service/src/
├── employee/         Çalışan CRUD, işe alım, işten çıkış
├── payroll/          Bordro hesaplama, pusulası, onay
├── leave/            İzin talepleri, bakiye yönetimi
├── sgk/              SGK 4A bildirgeleri, muhtasar
├── expense/          Masraf talepleri, onay akışı
├── advance/          Avans istekleri, onay, düşüm
├── attendance/       Puantaj kayıtları, devamsızlık
├── overtime/         Fazla mesai, onay, bordro entegrasyonu
├── asset/            Zimmet yönetimi, çalışan bazında takip
├── termination/      İşten çıkış, son ödeme hesaplaması
├── events/           RabbitMQ event publisher
├── app.module.ts     Ana modül, DataSource'lar
└── main.ts           Bootstrap, Swagger setup
```

## Veri Modeli — Kritik Entity'ler

### Employee Entity
```typescript
{
  id, tenantId, sicilNo, tckn, sgkNo,
  name, surname, birthDate, hireDate,
  title, department,
  grossSalaryKurus,        // Tam ay brüt (kuruş)
  salaryType,              // 'monthly' | 'hourly'
  status,                  // 'active' | 'suspended' | 'terminated'
  disabilityDegree,        // 0, 1, 2, 3 (vergi indirimi için)
  besOptOut,               // BES otomatik katılım opt-out flag
  hasIcra,                 // Maaş haczi (İİK md.83) uygulanıyor mu
  icraRate,                // Haciz oranı (0.00–1.00, net üzerinden)
  icraFixedKurus,          // Haciz sabit tutar (oran yerine)
  licenseClass,            // Sürücü ise 'A', 'B', 'C1', 'C', 'D' vb.
  licenseNumber,           // Ehliyet numarası
  licenseExpires,          // Ehliyet bitiş tarihi (fleet-service senkronizasyonu)
  bankIban,                // Bordro ödemesi için IBAN
  email, phone,
  createdAt, updatedAt
}
```

### Payroll Entity
```typescript
{
  id, tenantId, employeeId,
  periodYear, periodMonth,           // Hangi döneme ait
  workingDays, totalDays,            // Çalışılan gün / toplam iş günü

  // ─── Brüt ───
  grossKurus,                        // Orantılanmış brüt + fazla mesai

  // ─── İşçi Kesintileri ───
  sgkWorkerKurus,                    // SGK işçi payı (emeklilik+sağlık)
  unemploymentWorkerKurus,           // İşsizlik işçi payı
  incomeTaxKurus,                    // Gelir vergisi (muafiyet sonrası)
  stampTaxKurus,                     // Damga vergisi
  besDeductionKurus,                 // BES kesinti (brüt × %3)
  icraDeductionKurus,                // Maaş haczi (net × rate veya sabit)
  advanceDeductionKurus,             // Onaylı avanslar net'ten düşülmüş

  // ─── Net ───
  netKurus,                          // Brüt - tüm işçi kesintileri

  // ─── İşveren Maliyeti ───
  sgkEmployerKurus,                  // SGK işveren payı (%20.5)
  unemploymentEmployerKurus,         // İşsizlik işveren payı

  status,                            // 'DRAFT' | 'APPROVED' | 'PAID'
  approvedBy,                        // Onaylayan kullanıcı ID
  approvedAt,
  paidAt,
  notes,
  createdAt, updatedAt
}
```

### Advance Entity
```typescript
{
  id, tenantId, employeeId,
  amount,                            // Avans tutarı (kuruş)
  currency,                          // 'TRY' | 'USD' | ...
  reason,                            // Avans nedeni metni
  requestedAt,
  status,                            // 'PENDING' | 'APPROVED' | 'REJECTED' | 'DEDUCTED'
  approvedBy, approvedAt,
  deductedInPayroll,                 // Bordro ID'si (NULL ise henüz düşülmedi)
  createdAt, updatedAt
}
```

### Leave Entity
```typescript
{
  id, tenantId, employeeId,
  leaveType,                         // 'ANNUAL' | 'SICK' | 'UNPAID' | 'MATERNITY' | 'PATERNITY'
  startDate, endDate,
  dayCount,                          // Gün sayısı (iş günleri bazında)
  approvalStatus,                    // 'PENDING' | 'APPROVED' | 'REJECTED'
  notes,
  createdAt, updatedAt
}
```

### OvertimeEntry Entity
```typescript
{
  id, tenantId, employeeId,
  workDate,
  hours,                             // Fazla mesai saat sayısı
  status,                            // 'PENDING' | 'APPROVED' | 'REJECTED'
  approvedBy, approvedAt,
  overtimeKurus,                     // Hesaplanan fazla mesai ücreti (kuruş)
  includedInPayroll,                 // Hangi bordro'ya dahil edildi (payroll ID)
  createdAt, updatedAt
}
```

### AttendanceEntry Entity
```typescript
{
  id, tenantId, employeeId,
  workDate,
  clockIn,                           // Saatlik: ne zaman başladı
  clockOut,                          // Saatlik: ne zaman bitti
  worked,                            // İş günü ise true, izin/hastalık ise false
  deductedDays,                      // Devamsızlık gün sayısı (0–1 arasında)
  notes,
  createdAt, updatedAt
}
```

### EmployeeAsset Entity (Zimmet)
```typescript
{
  id, tenantId, employeeId,
  assetName,                         // Bilgisayar, aracı, cep telefonu, vb.
  assetCode,                         // İç takip kodu
  assignedAt,
  terminatedAt,                      // NULL ise hala çalışanda
  status,                            // 'ACTIVE' | 'RETURNED' | 'LOST'
  returnedAt,
  returnNotes,
  createdAt, updatedAt
}
```

### TerminationDetails Entity
```typescript
{
  id, tenantId, employeeId,
  terminationDate,
  reason,                            // 'RESIGNATION' | 'DISMISSAL' | 'RETIREMENT' | 'DEATH'
  severanceAmount,                   // Kıdem tazminatı (kuruş, uygulanıyorsa)
  lastPayrollId,                     // Son bordro
  createdAt, updatedAt
}
```

## Bordro Hesaplama Motoru (PayrollCalculatorService)

### Yasal Dayanak
- **5510 Sayılı Kanun**: SGK (sosyal güvenlik)
- **193 Sayılı GVK**: Gelir Vergisi Kanunu
- **488 Sayılı DVK**: Damga Vergisi Kanunu
- **4447 Sayılı Kanun**: İşsizlik Sigortası
- **4632 Sayılı Kanun**: BES otomatik katılım (md.6) — %3 brüt
- **İİK md.83**: Maaş haczi — net maaşın %25'ini aşamaz

### 2025 Sabitler (fiscal_params Tablosundan)

```typescript
// FiscalParamsService tarafından yıl başında yüklenir
fiscal_params: {
  year: 2025,

  // SGK Oranları
  sgkWorkerRate:            0.15,    // %15 işçi (emeklilik %9 + sağlık %5 + işsizlik %1)
  sgkEmployerRate:          0.205,   // %20.5 işveren
  sgkContributionCap:       165_78503, // Tavan (kuruş) — üzeri SGK yok

  // Asgari ücret
  minimumWage:              2_210467, // 22.104,67 TL (kuruş cinsinden)

  // GV Dilim Tablosu (kümülatif)
  incomeAnnualBrackets: [
    { from: 0,        rate: 0.15 },
    { from: 36_000000, rate: 0.20 },  // 360.000 TL
    { from: 120_000000, rate: 0.27 }, // 1.200.000 TL
    { from: 270_000000, rate: 0.35 }, // 2.700.000 TL
    { from: 600_000000, rate: 0.40 }  // 6.000.000 TL
  ],

  // GV Muafiyeti (asgari ücrette GV indirim)
  minWageIncomeExemption:   true,

  // Damga Vergisi
  stampTaxRate:             0.00759,  // Brüt üzerinden

  // İşsizlik Sigortası
  unemploymentRate:         0.02,     // %2 işçi, %3.5 işveren

  // Disabilite indirimi
  disabilityTaxCredit: [
    { degree: 1, creditRate: 0.10 },  // %10 indirim GV matrahından
    { degree: 2, creditRate: 0.15 },  // %15
    { degree: 3, creditRate: 0.20 }   // %20
  ]
}
```

### Hesaplama Akışı

```typescript
async calculate(input: PayrollInput, year: number): Promise<PayrollResult> {
  // 1. Brüt orantılandır (eksik gün varsa)
  const proportionedGross = input.grossKurus * (input.workingDays / input.totalDays);

  // 2. Fazla mesai ekle
  const totalGross = proportionedGross + (input.overtimeKurus ?? 0);

  // 3. SGK'yı hesapla (brüt üzerinden, tavan kuralı)
  const sgkBase = Math.min(totalGross, sgkContributionCap);
  const sgkWorker = Math.round(sgkBase * sgkWorkerRate);

  // 4. İşsizlik hesapla
  const unemploymentWorker = Math.round(sgkBase * 0.01); // %1

  // 5. GV matrahı (brüt - SGK - işsizlik)
  const incomeBase = totalGross - sgkWorker - unemploymentWorker;

  // 6. GV'yi dilim tablosundan hesapla (kümülatif)
  const cumulativeBase = input.prevCumulativeBaseKurus + incomeBase;
  const incometax = calculateIncomeTabledTax(
    input.prevCumulativeBaseKurus,
    cumulativeBase,
    brackets,
    input.disabilityDegree
  );

  // 7. Damga vergisi (brüt × %0.759)
  const stampTax = Math.round(totalGross * 0.00759);

  // 8. BES (brüt × %3, sadece opt-out değilse)
  const besDeduction = input.besEnabled === false ? 0 : Math.round(totalGross * 0.03);

  // 9. Net'i hesapla
  const net = totalGross - sgkWorker - unemploymentWorker - incomeTax - stampTax - besDeduction;

  // 10. Maaş haczi (net × oran, max %25)
  const icraDeduction = input.icraRate
    ? Math.min(Math.round(net * input.icraRate), Math.round(net * 0.25))
    : input.icraFixedKurus ?? 0;

  // 11. Avans düşümü (net'ten)
  const netAfterDeductions = net - icraDeduction - (input.advanceDeductionKurus ?? 0);

  return {
    grossKurus: totalGross,
    sgkWorkerKurus: sgkWorker,
    unemploymentWorkerKurus: unemploymentWorker,
    incomeTaxKurus: incomeTask,
    stampTaxKurus: stampTax,
    besDeductionKurus: besDeduction,
    icraDeductionKurus: icraDeduction,
    netKurus: netAfterDeductions,
    sgkEmployerKurus: Math.round(sgkBase * sgkEmployerRate),
    unemploymentEmployerKurus: Math.round(sgkBase * 0.035)
  };
}
```

**Kurallar:**
- Tüm tutarlar **kuruş cinsinden** (integer/bigint)
- GV dilim tablosu **kümülatif** — önceki ayın matrahıyla beraber
- Maaş haczi: net maaşın **max %25'i** aşamaz
- BES: brüt × %3 — sadece `besOptOut = false` ise
- Asgari ücret muafiyeti: GV matrahında indirim (muafiyet oranı tabloya göre)
- **BES, hacız, avans** bordro kesinleşmeden DRAFT'ta değişebilir

## Bordro Onay ve Finalizasyon Akışı

### Dönem Hesapla: `POST /api/v1/payroll/calculate-period`
```typescript
{
  year: 2025,
  month: 3
}
```

**İş Akışı:**
1. Aktif çalışanları çek
2. Her çalışan için önceki ay kümülatif GV matrahını al
3. `PayrollCalculatorService.calculate()` ile bordroyu hesapla
4. `payrolls` tablosuna DRAFT olarak kaydet (UPSERT)
5. Bordro PDF'si draft olarak tasarlanır (henüz e-imza yok)

### Bordro Onayı: `PATCH /api/v1/payroll/:id/approve`
```typescript
{
  // Onay metadata'sı
  approverNotes?: string,
  changes?: {
    // Sadece DRAFT'ta değişiklik yapılabilir
    workingDays?: number,
    overtimeKurus?: number,
    advanceDeductionKurus?: number,
  }
}
```

**İş Akışı:**
1. Bordro DRAFT ise değişiklikler uygulanır, yeniden hesapla
2. Statüsü APPROVED olarak işaretle
3. `approvedBy`, `approvedAt` doldur
4. **RabbitMQ event yayınla:** `hr.payroll.finalized`
   - financial-service'e yevmiye kayıtları (770 brüt maaş, 360/361 kesintiler, 335 işveren payı)

### Bordro Ödeme: `PATCH /api/v1/payroll/:id/mark-paid`
```typescript
{
  paidAt: '2026-04-05',
  paymentMethod: 'BANK_TRANSFER',
  reference: 'İzleme kodu'
}
```

**Kurallar:**
- APPROVED statüsünden geçiş
- Ödeme tarihi geriye alınamaz

## RabbitMQ Events (HrEventsPublisher)

| Routing Key | Kaynak Servis | Hedef Servis | Amaç |
|-------------|---------------|--------------|------|
| `hr.employee.hired` | EmployeeService | auth-service | Hesap oluştur, şifre sıfırlama e-postası gönder |
| `hr.employee.terminated` | TerminationService | auth-service | Hesabı devre dışı bırak, tüm token'ları revoke et |
| — | — | notification-service | Zimmet uyarısı: çalışan işten çıktı, zimmet kaydı var mı? |
| `hr.advance.approved` | AdvanceService | treasury-service | Ödeme emri oluştur (kasaya / bankaya çıkış) |
| `hr.expense.approved` | ExpenseService | treasury-service | Ödeme emri oluştur |
| `hr.payroll.finalized` | PayrollService | financial-service | Yevmiye kaydı: 770 brüt, 360/361 kesinti, 335 işveren payı |

**Event Formatı:**
```typescript
{
  tenantId: UUID,
  eventId: UUID,
  timestamp: ISO 8601,
  eventType: string,    // routing key'nin işçi kısmı
  payload: {...}        // Servis spesifik
}
```

## API Endpoint'leri

### Employee (:3007)
```
GET    /api/v1/employees                 Tüm çalışanlar (paginated)
POST   /api/v1/employees                 Yeni çalışan ekle (işe alım)
GET    /api/v1/employees/:id             Çalışan detayı
PATCH  /api/v1/employees/:id             Çalışan bilgileri güncelle
PATCH  /api/v1/employees/:id/terminate   İşten çıkar (şirket + tarih)

POST   /api/v1/employees/:id/fleet-sync  Fleet servisi ile senkronize (sürücüyse)
```

### Payroll (:3007)
```
POST   /api/v1/payroll/calculate-period  Dönem bordrosunu hesapla (DRAFT)
GET    /api/v1/payroll/period/:year/:month  Dönem bordroları listele
GET    /api/v1/payroll/:id               Bordro detayı (hesaplama + net/brüt)
PATCH  /api/v1/payroll/:id/approve       Bordroyu onayla (APPROVED → RabbitMQ event)
PATCH  /api/v1/payroll/:id/mark-paid     Ödeme işaretle (PAID)
GET    /api/v1/payroll/:id/payslip       Bordro pusulası PDF (PdfBuilderService)

GET    /api/v1/fiscal-params/:year       Yıllık yasal parametreler
PATCH  /api/v1/fiscal-params/:year       Parametreleri güncelle (admin)
```

### Leave (:3007)
```
POST   /api/v1/leaves                    İzin talep et
GET    /api/v1/leaves?employee=...       Çalışan izinleri
PATCH  /api/v1/leaves/:id/approve        İzni onayla
PATCH  /api/v1/leaves/:id/reject         İzni reddet

GET    /api/v1/leaves/balance/:employeeId  Açık izin bakiyesi (yıllık/hastalık/vs)
```

### Attendance (:3007)
```
POST   /api/v1/attendance/clock-in       Giriş yap (mobile/web)
POST   /api/v1/attendance/clock-out      Çıkış yap
GET    /api/v1/attendance?month=...      Puantaj listesi
POST   /api/v1/attendance/record         Manuel puantaj kaydı
```

### Overtime (:3007)
```
POST   /api/v1/overtime                  Fazla mesai bildir
GET    /api/v1/overtime?month=...        Fazla mesai listesi
PATCH  /api/v1/overtime/:id/approve      Onay (bordro'ya dahil edilecek)
PATCH  /api/v1/overtime/:id/reject       Reddet
```

### Advance (:3007)
```
POST   /api/v1/advances                  Avans iste
GET    /api/v1/advances?employee=...     Çalışan avansları
PATCH  /api/v1/advances/:id/approve      Avans onayla (RabbitMQ → treasury)
PATCH  /api/v1/advances/:id/reject       Avans reddet
```

### Expense (:3007)
```
POST   /api/v1/expenses                  Masraf talebi
GET    /api/v1/expenses?employee=...     Çalışan masrafları
PATCH  /api/v1/expenses/:id/approve      Masrafı onayla (RabbitMQ → treasury)
PATCH  /api/v1/expenses/:id/reject       Masrafı reddet
```

### Asset (Zimmet) (:3007)
```
POST   /api/v1/assets                    Zimmet ata
GET    /api/v1/assets?employee=...       Çalışan zimmetleri
PATCH  /api/v1/assets/:id/return         Zimmet iade al
```

### Termination (:3007)
```
POST   /api/v1/terminations              İşten çıkış işlemi başlat
GET    /api/v1/terminations/:id          Çıkış detayı (kıdem tazminatı hesabı)
```

### SGK (:3007)
```
GET    /api/v1/sgk/bildirge/:year/:month  4A bildirgesi PDF
GET    /api/v1/sgk/muhasarat/:year/:month Muhasarat beyannamesi PDF
POST   /api/v1/sgk/send-bildirge           Bildirgeyi (mock) GİB'e gönder
```

## Kritik Kurallar

### 1. Tenant İzolasyonu
```typescript
// ✅ Doğru
const { tenantId } = getTenantContext();
const ds = await this.dsManager.getDataSource(tenantId);
const repo = ds.getRepository(Employee);

// ❌ Yanlış
const repo = this.employeeRepository; // tenantId otomatik takip edilmez
```

### 2. Bordro Hesaplama Güvenliği
- Tüm tutarlar **kuruş** cinsinden (float kullanma)
- Kümülatif GV matrahı: her bordro **önceki ayı temel alır**
- Hesaplama sonucu her zaman **veriye yazılmadan önce doğrulanır** (net + kesintiler ≈ brüt)
- BES, avans, hacız: DRAFT'ta değiştirilebilir, APPROVED'tan sonra **okunaklı**

### 3. RabbitMQ Event Yayınlaması
```typescript
// ✅ Doğru — try/catch yoksa event kaybı kabul
await this.hrEvents.publishEmployeeHired({
  tenantId,
  employeeId,
  email,
  ...
});

// ❌ Yanlış
try {
  await this.hrEvents.publishEmployeeHired(...);
} catch {
  // Event kaybedildi
}
```

### 4. Avans Yönetimi
- Avans: PENDING → APPROVED (RabbitMQ) → DEDUCTED (bordro kesinleşince)
- APPROVED avans: treasury-service'e ödeme emri gider (nakit çıkış)
- DEDUCTED: bordro'ya kayıt `Advances.deductedInPayroll = payroll.id`
- İptal kuralı: APPROVED ödenmişse geri çekilemez (bordro yeniden hesaplanır)

### 5. Fazla Mesai Ödeme
```
Fazla mesai saati = brüt / 225 × saatSayısı × çarpan

Çarpan:
  - Normal gün: 1.0×
  - Hafta sonu (Cumartesi): 1.5×
  - Hafta sonu (Pazar): 2.0×
  - Tatil günü: 2.5×
```

### 6. Damga Vergisi Eklemesi
- Tüm bordrolara otomatik eklenir: brüt × %0.759
- KDV yok (bordro başında KDV işlemi yapılmaz)
- Net'den **sonra** düşülür (vergi matrahına dahil değil)

### 7. SGK'nın Tavan Kuralı
```
Aylık tavan (2025): 165.785,03 TL (kuruş cinsinden: 16_578503)

// ✅ Doğru
const sgkBase = Math.min(totalGross, SGK_CAP_KURUS);
const sgkWorker = Math.round(sgkBase * 0.15);

// ❌ Yanlış — brüt üzerinden hesapla
const sgkWorker = Math.round(totalGross * 0.15); // Tavan yok!
```

### 8. İşten Çıkış Akışı
```typescript
// POST /api/v1/terminations
{
  employeeId: UUID,
  terminationDate: '2026-04-30',
  reason: 'RESIGNATION' | 'DISMISSAL' | 'RETIREMENT' | 'DEATH'
}

// İş Akışı:
// 1. TerminationService.create() — TerminationDetails kaydı
// 2. Çalışan Employee.status = 'terminated'
// 3. Kıdem tazminatı hesapla (4857 md.14 — kdem başına %30)
// 4. Son bordro oluştur (işten çıkış tarihi + çalışılan günler)
// 5. RabbitMQ: hr.employee.terminated event yayınla
// 6. auth-service: hesap devre dışı, token revoke
// 7. notification-service: zimmet uyarısı (başında zimmet varsa)
```

### 9. Puantaj (Attendance) Kuralları
```typescript
// workDate ile clockIn/clockOut arasındaki fark
const hoursWorked = (clockOut - clockIn) / 3600000; // ms to hours

// Günü çalışılan saatlerine göre orantıla (8 saatlik iş günü)
const workingDayRatio = hoursWorked / 8.0;

// Bordro hesaplamada:
const proportionedGross = totalGross * workingDayRatio;
```

### 10. BES Kesintisi
- **Yasalı:** 4632 Sayılı Kanun md.6
- **Oran:** Brüt × %3
- **Opt-out:** `Employee.besOptOut = true` ise kesilmez
- **Deducted:** Bordro onayı sırasında finalize
- **NET'ten düşülür** (vergi matrahına dahil değil)

### 11. Zimmet Kaydı
```typescript
// İşe alım sırasında zimmet atanabilir
// POST /api/v1/assets
{
  employeeId,
  assetName: 'MacBook Pro 2024',
  assetCode: 'MB-001'
}

// İşten çıkış sırasında kontrol
// Zimmet.terminatedAt = NULL olan kayıt varsa uyarı verdir
```

### 12. E-posta Şablonları (@enkap/mailer)
- **Bordro Pusulası:** Bordro onayı → çalışana e-posta (PDF ekli)
- **İzin Onayı:** İzin onayı → çalışana bildirim
- **Avans Tasdiki:** Avans onayı → çalışana tasdik e-postası

## Migration Versionları (hr-service tarafından kullanılan)

| Versiyon | Açıklama | İçerik |
|----------|---------|--------|
| V055 | Advances tablosu | avans_yönetimi |
| V056 | AttendanceEntry tablosu | puantaj kayıtları |
| V057 | OvertimeEntry tablosu | fazla_mesai |
| V058 | EmployeeAsset + TerminationDetails | zimmet + işten_çıkış |
| V059 | Employee BES/İcra sütunları | bes_opt_out, has_icra, icra_rate, icra_fixed_kurus |
| V060 | Payroll BES/İcra/Fazla Mesai sütunları | bordro hesaplama sonuçları |
| V061 | FiscalParams tablosu | yıllık yasal parametreler (2025 oranları vb.) |

## Geliştirme Talimatları

### Yeni Module Ekleme
1. `src/{module_name}/` klasörü oluştur
2. Entity, Service, Controller, Module yazılır
3. DTO'lar `dto/` alt klasöründe
4. AppModule'e import et
5. Swagger decorator'ları ekle
6. RabbitMQ event gerekli ise `HrEventsPublisher` ekle

### Bordro Hesaplamada Değişiklik
1. `payroll-calculator.service.ts` güncellenme
2. `fiscal_params` tablosu temel alınır (hardcoded değil)
3. Tüm testler `payroll.spec.ts`'de
4. Migration gerekli ise `payroll.entity.ts` güncellenecek

### Yeni Çalışan Alanı (Bordro Etkisi)
1. `employee.entity.ts`'ye kolon ekle
2. `PayrollInput` arayüzüne parametre ekle
3. `PayrollCalculatorService.calculate()`'de logik ekle
4. `fiscal_params`'a referans gerekli ise Migration V061+ güncelle
5. Frontend form güncelle

## Debug İpuçları

### Bordro Hesaplama Hataları
```bash
# 1. Kümülatif matrah kontrol et
SELECT * FROM payrolls
WHERE employee_id = '...'
ORDER BY period_year, period_month;

# 2. Kesinti formülü doğrulama
SELECT gross_kurus, sgk_worker_kurus,
       (gross_kurus * 0.15) AS expected_sgk
FROM payrolls WHERE id = '...';

# 3. GV dilim matrisi kontrol et
SELECT * FROM fiscal_params WHERE year = 2025;
```

### RabbitMQ Event Yayınlanmadı
```typescript
// HrEventsPublisher.onModuleInit() çalışıp çalışmadığını kontrol et
// RABBITMQ_URL env variable tanımlı mı?
// RabbitMQ servisi çalışıyor mu? (docker ps | grep rabbitmq)
// Channel'ın ready flag'ı true mu?
```

### Avans/Masraf Ödemesi Boş
```bash
# TreasuryService'e event ulaştı mı?
docker logs enkap_treasury --tail 100 | grep "advance.approved\|expense.approved"
```

## Çalıştırma

```bash
# HR Service'i geliştirme modunda başlat
pnpm --filter @enkap/hr-service dev

# Port 3007 dinleyecek, Swagger: http://localhost:3007/docs

# Test çalıştır
pnpm --filter @enkap/hr-service test

# Build
pnpm --filter @enkap/hr-service build
```

## Kaynaklar

- **Ana CLAUDE.md:** `/home/obi/Desktop/enkap/CLAUDE.md`
- **Shared Types:** `@enkap/shared-types` — HrEmployeeHiredEvent, HrPayrollFinalizedEvent, vb.
- **Database Paketi:** `@enkap/database` — TenantContext, TenantGuard, RBAC
- **Health Paketi:** `@enkap/health` — HealthModule, Tracing, Metrics
- **Mailer Paketi:** `@enkap/mailer` — Türkçe e-posta şablonları
- **Reporting Paketi:** `@enkap/reporting` — PDF bordro pusulası, Excel rapor

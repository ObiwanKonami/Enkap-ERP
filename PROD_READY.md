# Production-Ready Audit — Findings Report

**Tarih:** 2026-04-03
**Durum:** ⏳ Onay Bekliyor
**Toplam Bulgusu:** 12 (4 🔴 CRITICAL, 3 🟠 HIGH, 2 🟡 MEDIUM, 3 🟢 LOW)

---

## 🔴 CRITICAL FINDINGS

### 1. RabbitMQ Retry Count Not Incremented on Requeue

**Dosya:** `apps/financial-service/src/events/hr-events.consumer.ts:93-98`

**Sorun:** Consumer, `msg.properties.headers?.['x-retry-count']` kontrol ederek DLQ vs requeue karar veriyor, ancak `channel.nack(msg, false, true)` (requeue=true) çağrıldığında RabbitMQ custom headers'ı otomatik olarak artırmıyor. Sonuçlar:
- Mesaj orijinal x-retry-count ile yeniden sıraya alınır (muhtemelen 0 veya undefined)
- Consumer tekrar aynı sayıyı görür → broker restarts ise sonsuz requeue döngüsü
- Max 2 retry kuralı uygulanmaz

**Kod Düzeltmesi:**
```typescript
// apps/financial-service/src/events/hr-events.consumer.ts:91-99
} catch (err) {
  this.logger.error(`HR event işleme hatası: ${err}`);
  const retryCount = (msg.properties.headers?.['x-retry-count'] as number) ?? 0;

  if (retryCount >= 2) {
    this.channel.nack(msg, false, false); // DLQ
  } else {
    // ✅ Requeue öncesi header'ı artır
    msg.properties.headers = msg.properties.headers || {};
    msg.properties.headers['x-retry-count'] = (retryCount + 1).toString();
    this.channel.nack(msg, false, true); // Requeue
  }
}
```

**Etki:** CRITICAL — Mesaj sonsuz retry yapabilir, yevmiye kaydı tekrar oluşabilir.

---

### 2. GIB Archive Reporting sendDocumentFile Exception Handling Yok

**Dosya:** `apps/financial-service/src/gib/archive-reporting.service.ts:138-155`

**Sorun:** `gib-envelope.service.ts` `sendDocument()` öğesini try/catch'e sarıyor (satır 115-131), ancak `archive-reporting.service.ts` `sendDocumentFile()` öğesini try/catch'e SAÇ. MTOM SOAP exception fırlatırsa:
- Process çöker, tenant raporu tamamlanmaz
- Audit log oluşturulmaz
- e_archive_reports kaydı yazılmaz (durum bilinmiyor)
- Kullanıcı için hata mesajı yok

**Kod Düzeltmesi:**
```typescript
// apps/financial-service/src/gib/archive-reporting.service.ts:138-156
let paketId: string | undefined;
let gibDurumKodu: number | undefined;
let lastError: string | undefined;

try {
  const sendResult = await this.mtomSoap.sendDocumentFile(signedXml, reportFilename);

  if (sendResult.success && paketId) {
    const statusResult = await this.mtomSoap.getBatchStatus(paketId);
    gibDurumKodu = statusResult.durumKodu;
    if (gibDurumKodu !== 0 && gibDurumKodu !== 200) {
      lastError = statusResult.durumAciklama;
    }
  } else if (!sendResult.success) {
    lastError = sendResult.rawResponse?.slice(0, 500) ?? 'Bağlantı hatası';
  }
} catch (err) {
  this.logger.error(`GIB e-Arşiv SOAP gönderim hatası: ${err}`);
  lastError = `İç hata: ${(err as Error).message.slice(0, 400)}`;
  // Continue — failure record yazılacak
}

const isSuccess = sendResult?.success ?? false; // ← Undefined sendResult'ı işle
```

**Etki:** CRITICAL — Service çökebilir, audit trail eksik, müşteri verisi kaybolabilir.

---

### 3. Archive Reporting Sonsuz Retry Hiç Max Limit Yok

**Dosya:** `apps/financial-service/src/gib/archive-reporting.service.ts:167-191`

**Sorun:** ON CONFLICT (tenant_id, report_date) DO UPDATE, `retry_count` artırıyor, ama MAX retry check YOK. Başarısız rapor her gün sonsuz tekrarlanabilir, asla başarılı veya kalıcı başarısız olarak işaretlenmez.

**Kod Düzeltmesi:**
```typescript
// apps/financial-service/src/gib/archive-reporting.service.ts:159-191
const invoiceIds = await ds
  .query(...)
  .then((r: { id: string }[]) => r.map((row) => row.id));

const MAX_ARCHIVE_RETRIES = 5; // ← Max retry sabiti ekle
const shouldMarkFailed = !isSuccess && (retry_count_from_db ?? 0) >= MAX_ARCHIVE_RETRIES;

await ds.query(
  `INSERT INTO e_archive_reports
     (tenant_id, report_date, invoice_count, invoice_ids, status,
      gib_response, gib_reference_number, retry_count, last_error, sent_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, NOW())
   ON CONFLICT (tenant_id, report_date) DO UPDATE
     SET invoice_count      = EXCLUDED.invoice_count,
         invoice_ids        = EXCLUDED.invoice_ids,
         status             = ${shouldMarkFailed ? "'PERMANENTLY_FAILED'" : 'EXCLUDED.status'},
         gib_response       = EXCLUDED.gib_response,
         gib_reference_number = EXCLUDED.gib_reference_number,
         retry_count        = CASE
                                WHEN e_archive_reports.retry_count >= $9 THEN $9
                                ELSE e_archive_reports.retry_count + 1
                              END,
         last_error         = EXCLUDED.last_error,
         sent_at            = EXCLUDED.sent_at`,
  [tenantId, today, entries.length, invoiceIds, isSuccess ? 'SUCCESS' : 'FAILED',
   JSON.stringify({ gibDurumKodu, paketId }), paketId ?? null, lastError ?? null, MAX_ARCHIVE_RETRIES],
);
```

**Etki:** CRITICAL — Audit raporlaması sessizce sonsuz başarısız olabilir, tenant/admin uyarı almaz.

---

### 4. Inconsistent Audit Logging Error Handling

**Dosya:** `apps/financial-service/src/gib/archive-reporting.service.ts:202-212`

**Sorun:** Audit logging `.catch()` ile sarılmamış (gib-envelope.service.ts:168'de var ama burada yok). Audit başarısız olursa, tüm tenant raporu başarısız olur:
- gib-envelope.service satır 168: `await this.auditService.log(...).catch((err) => this.logger.warn(...))`
- archive-reporting.service satır 202: `await this.audit.log(...)` (catch YOK)

**Kod Düzeltmesi:**
```typescript
// apps/financial-service/src/gib/archive-reporting.service.ts:202-212
await this.audit.log({
  tenantId,
  action: GibAuditAction.ARCHIVE_REPORT_SENT,
  details: {
    reportDate: today.toISOString().slice(0, 10),
    invoiceCount: entries.length,
    success: isSuccess,
    paketId,
    gibDurumKodu,
  },
}).catch((err) => this.logger.warn(`Audit log yazılamadı: ${err}`)); // ← catch ekle
```

**Etki:** CRITICAL — Audit logging başarısızlığı rapor başarısızlığına neden olur.

---

## 🟠 HIGH FINDINGS

### 5. Unknown GIB Status Code Silent Fallback

**Dosya:** `apps/financial-service/src/gib/gib-envelope.service.ts:133-135`

**Sorun:** GIB unmapped bir status code döndürürse:
```typescript
const statusAction = statusCode ? GIB_STATUS_ACTIONS[statusCode] : undefined;
const envelopeStatus = statusAction?.status ?? (result.success ? 'PROCESSING' : 'FAILED');
```
Eğer statusCode=9999 (unknown) ve result.success=false ise, zarf status='FAILED' olur bilinmeyen kodu loglamadan. Bu, entegrasyon sorunlarını gizler.

**Kod Düzeltmesi:**
```typescript
const statusAction = statusCode ? GIB_STATUS_ACTIONS[statusCode] : undefined;

if (statusCode && !statusAction) {
  this.logger.warn(
    `[${p.tenantId}] Bilinmeyen GİB durum kodu alındı: ${statusCode} — ` +
    `zarfı FAILED olarak işaretliyorum`
  );
}

const envelopeStatus = statusAction?.status ?? (result.success ? 'PROCESSING' : 'FAILED');
```

**Etki:** HIGH — Entegrasyon bugs'ları (yeni GİB status kodları) sessizdir.

---

### 6. Missing getBatchStatus durumKodu=200 Documentation

**Dosya:** `apps/financial-service/src/gib/archive-reporting.service.ts:150`

**Sorun:** Kod `if (gibDurumKodu !== 0 && gibDurumKodu !== 200)` kontrol ediyor ama:
- durumKodu=0 başarı olarak belgelenmiş (implicit)
- durumKodu=200 HIÇBIR YERDE belgelenmiş DEĞİL
- GIB_STATUS_ACTIONS enum (gib-envelope.service.ts satır 19-40) 200 içermiyor
- Eğer 200, BatchStatus için başarı anlamına geliyorsa ancak EnvelopeStatus için değilse, bu protocol tutarsızlığıdır

**Kod Düzeltmesi:** Enum ekle:
```typescript
// apps/financial-service/src/gib/archive-reporting.service.ts (dosya başı)
enum GIB_BATCH_STATUS_CODE {
  SUCCESS = 0,
  PENDING = 200, // ← GIB dokümantasyonuna göre belgelenecek
}

// Satır 150
if (gibDurumKodu !== GIB_BATCH_STATUS_CODE.SUCCESS && gibDurumKodu !== GIB_BATCH_STATUS_CODE.PENDING) {
  lastError = statusResult.durumAciklama;
}
```

**Etki:** HIGH — Bakım yaramazlığı, magic number.

---

### 7. hr-events Consumer Missing Tenant Context Cleanup on Error

**Dosya:** `apps/financial-service/src/events/hr-events.consumer.ts:68-100`

**Sorun:** `runWithTenantContext()` handler'ı sarar (satır 79-88), ama eğer handler AsyncLocalStorage.enterWith() SONRASI fırlatırsa, yüksek concurrency senaryolarında context cleanup olmayabilir ve bir RabbitMQ nack oluşabilir. Bu, message handlers arasında tenant context sızıntısına neden olabilir.

**Kod Düzeltmesi:**
```typescript
// apps/financial-service/src/events/hr-events.consumer.ts:71-100
try {
  const event = JSON.parse(msg.content.toString()) as HrPayrollFinalizedEvent;

  if (!event.tenantId || !event.payrolls?.length) {
    this.channel.ack(msg);
    return;
  }

  // ✅ AsyncLocalStorage'ı correctly kullan try/finally ile
  await runWithTenantContext(
    { tenantId: event.tenantId, userId: event.approvedBy, sessionId: `hr-event-${Date.now()}`, userRoles: ['admin'], tier: 'business' },
    () => this.onPayrollFinalized(event),
  );

  this.channel.ack(msg);
} catch (err) {
  // ... existing error handling ...
  // Note: runWithTenantContext internally handles cleanup'ı, ama TenantContextMiddleware source'unu verify et
}
```

**Etki:** HIGH — Concurrent senaryolarda tenant context cross-contamination ihtimali.

---

## 🟡 MEDIUM FINDINGS

### 8. GIB Envelope Status 'PROCESSING' Never Updates Invoices

**Dosya:** `apps/financial-service/src/gib/gib-envelope.service.ts:261-284`

**Sorun:** `envelopeStatus === 'PROCESSING'` olduğunda, invoice status update YOK. Bu doğru davranış (polling bekliyor), ama:
- Satır 276: `if (!invoiceStatus) return;` sessizce çıkış yapıyor
- PROCESSING'in intentional olduğu için log yok
- Polling çalışmayı başarısız olursa, customer hiçbir zaman invoice'ın stuck olduğunu bilmez

**Kod Düzeltmesi:**
```typescript
private async updateLinkedInvoiceStatus(
  dataSource: import('typeorm').DataSource,
  envelopeId: string,
  tenantId: string,
  envelopeStatus: 'PROCESSING' | 'SUCCESS' | 'FAILED',
): Promise<void> {
  let invoiceStatus: string | null = null;

  if (envelopeStatus === 'SUCCESS') {
    invoiceStatus = 'ACCEPTED_GIB';
  } else if (envelopeStatus === 'FAILED') {
    invoiceStatus = 'DRAFT';
  } else if (envelopeStatus === 'PROCESSING') {
    // ✅ Explicitly log PROCESSING intent (no update, awaiting polling)
    this.logger.debug(`Zarf PROCESSING durumda — polling sırasında güncellenecek: ${envelopeId}`);
    return;
  }

  if (!invoiceStatus) return;
  // ... rest of method
}
```

**Etki:** MEDIUM — Operational visibility sorunu.

---

### 9. Journal Entry Balance Tolerance 0.01 TL May Not Catch Rounding Errors

**Dosya:** `apps/financial-service/src/events/hr-events.consumer.ts:146-154`

**Sorun:** 0.01 TL (1 kuruş) tolerans çoğu bordro için işe yarıyor, ancak >1000 çalışan ve multi-currency dönüştürmeleriyle rounding errors 1 kuruşu aşabilir. Kod sessizce başarısız olur:
```typescript
const diff = Math.abs(totalGiderTl - totalAlacak);
if (diff > 0.01) {
  this.logger.error(`Bordro yevmiye dengesi bozuk: ...`);
  return; // ← Silent failure, no DLQ, invoice PENDING_GIB'de takılı
}
```

**Kod Düzeltmesi:**
```typescript
const diff = Math.abs(totalGiderTl - totalAlacak);
const MAX_ROUNDING_ERROR_TOLERANCE = 0.10; // 10 kuruş güvenlik için

if (diff > MAX_ROUNDING_ERROR_TOLERANCE) {
  this.logger.error(
    `[${p.tenantId}] Bordro yevmiye dengesi aşırı bozuk: borç=${totalGiderTl} ` +
    `alacak=${totalAlacak} fark=${diff} TL — bordro verileri kontrol edilsin`
  );
  // ✅ Silent return yerine throw et DLQ'ye yönlendirmek için
  throw new Error(`Bordro dengesi bozuk (${diff} TL)`);
}
```

**Etki:** MEDIUM — Silent data corruption riski.

---

### 10. No Transaction Isolation for gib_envelopes.zipAndHash Update

**Dosya:** `apps/financial-service/src/gib/gib-envelope.service.ts:100-110`

**Sorun:** İki ayrı query:
1. INSERT gib_envelopes (satır 93-98)
2. UPDATE with ZIP hash (satır 106-110)

Aralarında, process çöker ise, PENDING zarf NULL zip_md5_hash ile var. Retry'da, zarf zaten var ama incomplete.

**Kod Düzeltmesi:**
```typescript
// Transaction'a sarla veya INSERT + UPDATE'i tek query'da birleştir
const [envelopeRow] = await dataSource.query(
  `INSERT INTO gib_envelopes
     (id, tenant_id, type, direction, sender_alias, receiver_alias, document_ids,
      zip_md5_hash, zip_sha256_hash, zip_filename, status, created_at, updated_at)
   VALUES ($1, $2, 'SENDERENVELOPE', 'OUT', $3, $4, $5, $6, $7, $8, 'PENDING', NOW(), NOW())
   RETURNING id`,
  [envelopeId, tenantId, senderAlias, params.receiverAlias, `{${params.documentId}}`,
   md5Hash, sha256Hash, params.filename],
);
```

**Etki:** MEDIUM — Incomplete envelope records mümkün.

---

## 🟢 LOW FINDINGS

### 11. Inconsistent Error Message Truncation

**Dosya:** `apps/financial-service/src/gib/gib-envelope.service.ts:128` vs `archive-reporting.service.ts:154`

- gib-envelope: `.substring(0, 5000)` (SOAP response)
- archive-reporting: `.slice(0, 500)` (error message)

**Kod Düzeltmesi:** 500 chars'a standardize et:
```typescript
// gib-envelope.service.ts:147
result.rawResponse ? result.rawResponse.substring(0, 500) : null,
```

**Etki:** LOW — Cosmetic.

---

### 12. Missing i18n Key for Bordro Yevmiye Success Log

**Dosya:** `apps/financial-service/src/events/hr-events.consumer.ts:221-224`

**Sorun:** Logger inline Türkçe string kullanıyor i18n key yerine (error logs i18n keys kullanıyor — inconsistent).

**Kod Düzeltmesi:**
```typescript
this.logger.log(
  `[${p.tenantId}] ${this.i18n.t('hr.payroll.journal_entry_created')}`,
  { period, employeeCount: p.employeeCount, expense: totalGiderTl }
);
```

**Etki:** LOW — Log çevirisi.

---

## 📊 Summary Tablosu

| ID | Kategori | Severity | Dosya | Sorun |
|----|----------|----------|-------|-------|
| 1 | Events | 🔴 CRITICAL | hr-events.consumer | x-retry-count requeue'da artmıyor |
| 2 | GIB | 🔴 CRITICAL | archive-reporting | sendDocumentFile try/catch'e sarılmamış |
| 3 | GIB | 🔴 CRITICAL | archive-reporting | Max retry limit yok |
| 4 | GIB | 🔴 CRITICAL | archive-reporting | Audit logging .catch() ile sarılmamış |
| 5 | GIB | 🟠 HIGH | gib-envelope | Unknown status codes sessiz fallback |
| 6 | GIB | 🟠 HIGH | archive-reporting | durumKodu=200 belgelenmiş değil |
| 7 | Events | 🟠 HIGH | hr-events.consumer | Tenant context cleanup eksik |
| 8 | GIB | 🟡 MEDIUM | gib-envelope | PROCESSING status log yok |
| 9 | Events | 🟡 MEDIUM | hr-events.consumer | Journal balance tolerance başarısız olabilir |
| 10 | GIB | 🟡 MEDIUM | gib-envelope | Hash update transaction isolation yok |
| 11 | GIB | 🟢 LOW | gib-envelope/archive-reporting | Inconsistent error truncation |
| 12 | Events | 🟢 LOW | hr-events.consumer | Missing i18n log key |

**Toplam: 12 bulgusu (4 CRITICAL, 3 HIGH, 2 MEDIUM, 3 LOW)**

---

## 🎯 Önerilen Action Priority

### 1️⃣ FIX IMMEDIATELY (4 CRITICAL)
Sonraki production deploy'dan önce düzelt:
- ✅ #1: x-retry-count increment
- ✅ #2: sendDocumentFile try/catch
- ✅ #3: Archive retry max limit
- ✅ #4: Audit logging .catch()

### 2️⃣ FIX THIS SPRINT (3 HIGH)
- ✅ #5: Unknown status code logging
- ✅ #6: durumKodu=200 dokumentasyon
- ✅ #7: Tenant context cleanup

### 3️⃣ FIX NEXT SPRINT (3 MEDIUM + 3 LOW)
- ⏳ #8-#12: Operational improvements

---

## 📝 Deployment Checklist

- [ ] CRITICAL fixes code review
- [ ] CRITICAL fixes unit tests (%100 coverage)
- [ ] CRITICAL fixes integration tests (RabbitMQ, GIB SOAP mock)
- [ ] CRITICAL fixes e2e tests (production-like scenarios)
- [ ] Load test (10k mesaj/saat simülasyonu)
- [ ] Staging deployment & validation
- [ ] Production deployment
- [ ] Post-deploy monitoring (error rates, latency)
- [ ] Customer notification (if any data affected)

---

## 📞 Notes

**Oluşturan:** Claude Code
**Audit Kategorileri:**
1. Frontend ↔ Backend API Contracts
2. Microservice Events/Outbox/Saga Patterns
3. TypeORM & Migration Integrity
4. GIB Integration Completeness
5. RBAC & Security Enforcement

**Sonraki Adım:** User approval'ı bekliyor → implementation


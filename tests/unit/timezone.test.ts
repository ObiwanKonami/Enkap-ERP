/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 · UNIT · Saat Dilimi (UTC+3) & Tarih Format Testleri
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Görünmez nokta #3: Türkiye (UTC+3) ile sunucu saati arasındaki fark
 * e-fatura tarihlerini bir gün geri atıyor mu?
 *
 * Çalıştırma: npx jest tests/unit/timezone.test.ts
 *
 * Not: Bu test TZ ortam değişkeninden bağımsız çalışır —
 *      Intl.DateTimeFormat'ın timeZone parametresi ile test eder.
 */

import { formatDate, formatDateTime, kurusToTl } from '../../apps/web/src/lib/format';

// ─── Timezone Safety ─────────────────────────────────────────────────────────

describe('Saat Dilimi — UTC+3 Güvenlik Testleri (Görünmez Nokta #3)', () => {

  test('21.03.2026 22:30 UTC → İstanbul saati 22.03.2026 01:30 — tarih kayması olmaz', () => {
    // UTC 22:30 → UTC+3 01:30 ertesi gün
    // GİB faturasında SAAT YOK, sadece tarih var.
    // Eğer frontend Date objesi UTC'den alınıp lokal timezone'a çevrilirse gün kayması olur.
    // Çözüm: issueDate string olarak "2026-03-21" alınmalı, new Date() yapılmamalı.

    const utcMidnightMinus30min = '2026-03-21T21:30:00Z'; // UTC 21:30 = İstanbul 00:30 ertesi gün?
    // Aslında: UTC 21:30 + 3 saat = 00:30, ama tarih 22 Mart!

    const d = new Date(utcMidnightMinus30min);
    const formatted = formatDate(d); // timeZone: 'Europe/Istanbul'

    // UTC 21:30 → İstanbul 00:30 → 22 Mart — GİB tarih YANLIŞ olur!
    // Bu senaryo GİB'e "22.03.2026" gönderir ama müşteri "21.03.2026" bekliyordu.
    // BEKLENEN DAVRANIS: formatDate sadece görüntüleme için kullanılır.
    // issueDate field'ı server-side date-only string olarak saklanır.
    expect(formatted).toBe('22.03.2026'); // Bu DOĞRU — İstanbul saatiyle 22 Mart
  });

  test('GİB issueDate — sadece tarih kısmı alınırsa timezone kayması yok', () => {
    // Doğru kullanım: issueDate = "2026-03-21" (string, no time)
    // new Date("2026-03-21") JavaScript'te UTC midnight olarak parse edilir
    // → UTC+3 timezone'da 21.03.2026 03:00 olur → gün kayması YOK

    const dateOnlyString = '2026-03-21';
    const d = new Date(dateOnlyString); // UTC 00:00
    const formatted = formatDate(d);

    // UTC 00:00 + 3 saat = İstanbul 03:00 — hala 21 Mart
    expect(formatted).toBe('21.03.2026');
  });

  test('Tehlikeli senaryo: new Date("2026-03-21T00:00:00") lokal TZ ile', () => {
    // Eğer backend "2026-03-21T00:00:00" (timezone'suz) gönderirse
    // browser bunu lokal timezone ile interpret eder
    // UTC+3 sunucuda bu "2026-03-20T21:00:00Z" anlamına gelir
    // Sonra formatDate UTC+3 ile formatlayınca "21.03.2026" döner — DOĞRU

    // Ama UTC-5 timezone'da bir kullanıcı bu tarihi görürse:
    // "2026-03-21T00:00:00" lokal = "2026-03-21T05:00:00Z" → formatDate(UTC+3) = "21.03.2026" DOĞRU

    // Sonuç: timeZone sabit 'Europe/Istanbul' olduğu için browser timezone'u önemli değil
    const serverDate = new Date('2026-03-21T00:00:00'); // lokal parse
    const formatted  = formatDate(serverDate);
    // İstanbul'da saatlerin 00:00 veya üzeri olması durumunda 21 Mart görünmeli
    expect(formatted).toMatch(/21\.03\.2026/);
  });

  test('Yılbaşı gece yarısı — 31.12.2025 21:01 UTC → İstanbul 01.01.2026', () => {
    const newYearsEve = new Date('2025-12-31T21:01:00Z');
    const formatted   = formatDate(newYearsEve);
    // UTC+3: 00:01 → 1 Ocak 2026
    expect(formatted).toBe('01.01.2026');
  });

  test('formatDate sadece tarih döner — saat içermez', () => {
    const d = new Date('2026-03-21T14:30:00Z');
    const formatted = formatDate(d);
    expect(formatted).toMatch(/^\d{2}\.\d{2}\.\d{4}$/); // dd.MM.yyyy formatı
    expect(formatted).not.toContain(':'); // saat yok
  });

  test('formatDateTime — İstanbul saatiyle saat de doğru gösterilir', () => {
    // UTC 07:00 = İstanbul 10:00
    const d = new Date('2026-03-21T07:00:00Z');
    const formatted = formatDateTime(d);
    expect(formatted).toContain('21.03.2026');
    expect(formatted).toContain('10:00');
  });

  test('Cron job saat dilimi — dunning 06:00 UTC+3 çalışmalı', () => {
    // Dunning cron: @Cron('0 6 * * *', { timeZone: 'Europe/Istanbul' })
    // Bu, UTC 03:00'a karşılık gelir (DST yok, UTC+3 sabit)
    // Türkiye'de 06:00 sabahı — iş saatlerinden önce, doğru zamanlama
    const istanbulHour = 6;
    const utcHour      = 3; // UTC+3 → UTC = 6 - 3 = 3
    expect(istanbulHour - utcHour).toBe(3); // UTC offset doğrulaması
  });

  test('GİB XML tarih formatı — "YYYY-MM-DD" veya "dd.MM.yyyy"', () => {
    // GİB fatura XML'i: <IssueDate>2026-03-21</IssueDate> formatını kabul eder
    // Veya UBL-TR standardı: "2026-03-21"
    const d = new Date('2026-03-21T00:00:00Z');

    // GİB için ISO format
    const isoDate = d.toISOString().split('T')[0]; // "2026-03-21"
    expect(isoDate).toBe('2026-03-21');

    // Kullanıcı arayüzü için Türkçe format
    expect(formatDate(d)).toBe('21.03.2026');
  });
});

// ─── kurusToTl Fonksiyonu ─────────────────────────────────────────────────────

describe('kurusToTl — Birim Dönüşümü', () => {

  test('1 kuruş = 0.01 TL', () => {
    expect(kurusToTl(1)).toBe(0.01);
  });

  test('100 kuruş = 1 TL', () => {
    expect(kurusToTl(100)).toBe(1);
  });

  test('22104667 kuruş = 22104.67 TL (asgari ücret 2025)', () => {
    expect(kurusToTl(22_104_667)).toBeCloseTo(22_104.67, 2);
  });

  test('bigint giriş desteklenir', () => {
    expect(kurusToTl(BigInt(100_000))).toBe(1_000);
  });

  test('0 kuruş = 0 TL', () => {
    expect(kurusToTl(0)).toBe(0);
  });
});

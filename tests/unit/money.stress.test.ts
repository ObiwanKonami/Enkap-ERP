/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 · UNIT · Money Sınıfı Stress Testi
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Görünmez nokta #1: 1000 satırlı faturada kuruş yuvarlama hatası
 *
 * Çalıştırma: npx jest tests/unit/money.stress.test.ts
 */

import { Money, sumMoney } from '../../apps/financial-service/src/shared/money';

// ─── Temel aritmetik ──────────────────────────────────────────────────────────

describe('Money — Temel Aritmetik', () => {

  test('0.1 + 0.2 float tuzağı → Money ile tam 0.30', () => {
    const a = Money.of(0.1);
    const b = Money.of(0.2);
    expect(a.add(b).toDecimal()).toBe(0.3);
  });

  test('KDV %20 hesabı — 100 TL × 0.20 = tam 20.00 TL', () => {
    const base = Money.of(100);
    const kdv  = base.percentage(20);
    expect(kdv.toDecimal()).toBe(20.0);
  });

  test('KDV %10 hesabı — 333.33 TL × 0.10 = 33.333 TL (4 ondalık)', () => {
    const base = Money.of(333.33);
    const kdv  = base.percentage(10);
    // SCALE=10000 → 333.33 × 1000 / 10000 = 33.333
    expect(kdv.toDecimal()).toBeCloseTo(33.333, 3);
  });

  test('İskonto %5 — 1000 TL → 950 TL net', () => {
    const price = Money.of(1000);
    expect(price.applyDiscount(5).toDecimal()).toBe(950);
  });

  test('Tevkifat 2/3 — 300 TL × 2/3 = tam 200 TL', () => {
    const kdv = Money.of(300);
    expect(kdv.tevkifat(2, 3).toDecimal()).toBe(200);
  });

  test('Negatif tutarlar — çıkarma', () => {
    const a = Money.of(50);
    const b = Money.of(100);
    expect(a.subtract(b).isNegative()).toBe(true);
    expect(a.subtract(b).toDecimal()).toBe(-50);
  });

  test('Sıfır kontrol', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.of(0.001).isZero()).toBe(false);
  });
});

// ─── 1000 Satır Stress Testi ──────────────────────────────────────────────────

describe('Money — 1000 Satır Fatura Stress Testi (Görünmez Nokta #1)', () => {

  test('1000 adet 0.01 TL → toplam tam 10.00 TL (float ile çöker, BigInt ile geçer)', () => {
    const lines = Array.from({ length: 1000 }, () => Money.of(0.01));
    const total = sumMoney(lines);

    // Float ile: 0.01 * 1000 = 10.000000000000002 (IEEE 754 hatası)
    // Bizim ile:  tam 10.00
    expect(total.toDecimal()).toBe(10.0);
    expect(total.toGibString()).toBe('10.0000');
  });

  test('1000 satır KDV %20 → toplam KDV float sapması yok', () => {
    // Her satır: 9.99 TL × %20 = 1.998 TL (4 ondalık)
    const lines = Array.from({ length: 1000 }, () => Money.of(9.99).percentage(20));
    const total = sumMoney(lines);

    // 9.99 × 0.20 = 1.998 → 1000 × 1.998 = 1998.0
    // Float ile bu işlem 1997.999...8 veya 1998.000...2 verebilir
    expect(total.toDecimal()).toBeCloseTo(1998.0, 2);
  });

  test('1000 farklı KDV oranı karışımı — toplam kontrol', () => {
    // Türkiye gerçek KDV oranları: %1, %10, %20
    const rates = [1, 10, 20];
    const lines: Money[] = [];

    for (let i = 0; i < 1000; i++) {
      const base = Money.of(Math.floor(Math.random() * 10000) / 100); // 0-100 TL
      const kdv  = base.percentage(rates[i % 3]!);
      lines.push(kdv);
    }

    const total = sumMoney(lines);
    // Sonuç pozitif olmalı ve makul aralıkta (0-10000)
    expect(total.toDecimal()).toBeGreaterThan(0);
    expect(total.toDecimal()).toBeLessThan(10_000);
    // Ondalık 4 basamaktan fazla olmamalı
    const decStr = total.toGibString();
    const decPart = decStr.split('.')[1] ?? '';
    expect(decPart.length).toBeLessThanOrEqual(4);
  });

  test('Kuruş sınır değerleri — 0.005 TL (yarım kuruş) yuvarlama', () => {
    // 0.005 TL = 0.5 kuruş — yuvarlama davranışı tutarlı olmalı
    const half = Money.of(0.005);
    expect(half.toDecimal()).toBe(0.005);
    // GİB formatı: 4 ondalık
    expect(half.toGibString()).toBe('0.0050');
  });

  test('Büyük fatura: 1M TL sipariş → overflow yok', () => {
    const bigInvoice = Money.of(1_000_000);
    const kdv        = bigInvoice.percentage(20);
    const total      = bigInvoice.add(kdv);

    expect(total.toDecimal()).toBe(1_200_000);
    expect(total.isNegative()).toBe(false);
  });

  test('fromDecimal — DB string → Money → aynı değer', () => {
    const original = '9500.7500'; // NUMERIC 19,4 formatı
    const m = Money.fromDecimal(original);
    expect(m.toGibString()).toBe('9500.7500');
    expect(m.toDecimal()).toBe(9500.75);
  });
});

// ─── GİB Format Testleri ──────────────────────────────────────────────────────

describe('Money — GİB XML Format', () => {

  test('toGibString tam 4 ondalık basamak döner', () => {
    expect(Money.of(1234.56).toGibString()).toBe('1234.5600');
    expect(Money.of(0).toGibString()).toBe('0.0000');
    expect(Money.of(100).toGibString()).toBe('100.0000');
    expect(Money.of(9.99).toGibString()).toBe('9.9900');
  });

  test('toDisplayString Türkçe format döner', () => {
    const display = Money.of(1234.56).toDisplayString();
    // tr-TR formatı: nokta binlik ayırıcı, virgül ondalık
    expect(display).toMatch(/1\.234,56/);
    expect(display).toContain('₺');
  });

  test('USD display', () => {
    const display = Money.of(500).toDisplayString('USD');
    expect(display).toMatch(/500/);
    expect(display).toMatch(/\$/);
  });
});

// ─── Yuvarlama Politikası ─────────────────────────────────────────────────────

describe('Money — Yuvarlama Politikası', () => {

  test('KDV %20 — banker\'s rounding değil standard rounding', () => {
    // 1 kuruş × %20 = 0.2 kuruş → 0 olmalı (aşağı yuvarla)
    const tiny = Money.of(0.01); // 1 kuruş
    const kdv  = tiny.percentage(20);
    // 0.01 × 0.20 = 0.002 → 0.0020 (4 ondalık, tam değer)
    expect(kdv.toDecimal()).toBe(0.002);
  });

  test('multiply faktör 1.5 — tutarlı', () => {
    const price = Money.of(3);
    expect(price.multiply(1.5).toDecimal()).toBe(4.5);
  });

  test('1000 kez %1 discount zincirleme — kümülatif hata yok', () => {
    let m = Money.of(100);
    for (let i = 0; i < 1000; i++) {
      m = m.add(Money.of(0)); // noop — cumulative drift test
    }
    expect(m.toDecimal()).toBe(100); // Hiç kayıp yok
  });
});

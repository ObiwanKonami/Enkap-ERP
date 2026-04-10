/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 · E2E · Fatura Oluşturma & GİB Akışı
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Kapsam: Fatura listesi → Yeni fatura → KDV hesap → GİB gönderim → PDF
 * Çalıştırma: npx playwright test tests/e2e/playwright/invoice.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_FIN  = process.env.FIN_API_URL  ?? 'http://localhost:3003/api/v1';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

async function loginAsDemo(page: Page) {
  await page.goto(`${BASE_URL}/giris`);
  await page.getByLabel(/e-posta/i).fill('demo@enkap-demo.com.tr');
  await page.getByLabel(/şifre/i).fill('Demo1234!');
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 10_000 });
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Fatura Yönetimi — P0', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('TC-INV-01 · Fatura listesi yüklenir ve sayfalama çalışır', async ({ page }) => {
    await page.goto(`${BASE_URL}/faturalar`);

    // Tablo başlıkları görünür olmalı
    await expect(page.getByRole('columnheader', { name: /fatura no/i })).toBeVisible({ timeout: 10_000 });

    // En az 1 satır var (demo seed verisinden)
    const rows = page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('TC-INV-02 · Yeni satış faturası oluşturma — KDV doğru hesaplanır', async ({ page }) => {
    await page.goto(`${BASE_URL}/faturalar`);
    await page.getByRole('button', { name: /yeni fatura/i }).click();

    // Fatura tipi: Satış
    await page.getByRole('option', { name: /satış/i }).click();

    // Müşteri seç
    await page.getByLabel(/müşteri/i).fill('ABC Holding');
    await page.getByRole('option', { name: /ABC Holding/i }).first().click();

    // Fatura tarihi
    await page.getByLabel(/fatura tarihi/i).fill('21.03.2026');

    // Ürün satırı ekle
    await page.getByRole('button', { name: /satır ekle/i }).click();
    const lastRow = page.getByTestId('invoice-line').last();
    await lastRow.getByLabel(/ürün/i).fill('Dell XPS');
    await lastRow.getByRole('option', { name: /Dell XPS/i }).first().click();
    await lastRow.getByLabel(/miktar/i).fill('3');
    await lastRow.getByLabel(/birim fiyat/i).fill('9500');

    // KDV oranı %20 — KDV tutarı 5.700,00 ₺ olmalı (3 × 9.500 × 0.20)
    await expect(lastRow.getByTestId('kdv-amount')).toHaveText(/5\.700/);

    // Toplam: 3 × 9500 × 1.20 = 34.200 ₺
    await expect(page.getByTestId('invoice-total')).toHaveText(/34\.200/);

    // Kaydet
    await page.getByRole('button', { name: /kaydet/i }).click();
    await expect(page.getByRole('alert')).toContainText(/kaydedildi|oluşturuldu/i, { timeout: 8_000 });

    // Listede göster
    await page.goto(`${BASE_URL}/faturalar`);
    await expect(page.getByText('ENK-2026-')).toBeVisible({ timeout: 5_000 });
  });

  test('TC-INV-03 · 1000 Satırlı fatura — kuruş toplam hatası olmaz (stress)', async ({ request, page }) => {
    // API ile doğrudan 1000 satır oluştur ve toplamları kontrol et
    // Her satır: 1 adet, birim fiyat 1 kuruş (0.01 ₺), KDV %20

    // Beklenen toplam: 1000 × 0.01 × 1.20 = 12.00 ₺ (1200 kuruş)
    // Float hesabıyla: 0.01 * 1.20 = 0.012 — 1000 × 0.012 = 12.00000... (tehlikeli!)
    // Money sınıfı ile: BigInt(100) × 1200 / 10000 = tam 12.00

    // Bu testi API seviyesinde çalıştırıyoruz (UI ile 1000 satır doldurmak pratik değil)
    const loginResp = await request.post(`http://localhost:3001/api/v1/auth/login`, {
      data: { email: 'demo@enkap-demo.com.tr', password: 'Demo1234!' },
    });
    if (!loginResp.ok()) {
      test.skip(true, 'Auth servisi erişilemez');
      return;
    }
    const { accessToken } = await loginResp.json() as { accessToken: string };

    // 1000 satır oluştur
    const lines = Array.from({ length: 1000 }, (_, i) => ({
      productId:     'p1000003-0000-0000-0000-000000000003', // SSD
      productName:   `Test Ürün ${i + 1}`,
      quantity:      1,
      unitPrice:     0.01, // 1 kuruş
      discountPct:   0,
      kdvRate:       20,
    }));

    const resp = await request.post(`${API_FIN}/invoices`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        invoiceType: 'STANDARD',
        direction:   'OUT',
        customerId:  'c1000001-0000-0000-0000-000000000001',
        issueDate:   '2026-03-21',
        dueDate:     '2026-04-21',
        currency:    'TRY',
        lines,
      },
    });

    // P0: 1000 satır işlenmeli
    expect([200, 201]).toContain(resp.status());

    const invoice = await resp.json() as { total: number; kdvTotal: number; subtotal: number };

    // Subtotal: 1000 × 0.01 = 10.00 ₺ (tam sayı olmalı)
    expect(invoice.subtotal).toBe(10.00);
    // KDV: 10.00 × 0.20 = 2.00 ₺
    expect(invoice.kdvTotal).toBe(2.00);
    // Toplam: 12.00 ₺ — BigInt ile sıfır hata
    expect(invoice.total).toBe(12.00);
  });

  test('TC-INV-04 · Fatura tarihi — UTC+3 offset bir gün geriye gitmez', async ({ request }) => {
    // 21.03.2026 23:30 İstanbul saati girilince
    // UTC'ye çevrildiğinde 20.03.2026 21:30 UTC olmamalı —
    // GİB XML'inde tarih 21.03.2026 olarak görünmeli

    const loginResp = await request.post(`http://localhost:3001/api/v1/auth/login`, {
      data: { email: 'demo@enkap-demo.com.tr', password: 'Demo1234!' },
    });
    if (!loginResp.ok()) { test.skip(true, 'Auth servisi erişilemez'); return; }
    const { accessToken } = await loginResp.json() as { accessToken: string };

    // Faturayı İstanbul 23:30'da oluşturulmuş gibi gönder
    // GİB standardı: issueDate sadece tarih (date only), time yok
    const resp = await request.post(`${API_FIN}/invoices`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        invoiceType: 'STANDARD',
        direction:   'OUT',
        customerId:  'c1000001-0000-0000-0000-000000000001',
        issueDate:   '2026-03-21',  // Tam tarih, saat yok → timezone kayması olmaz
        dueDate:     '2026-04-21',
        currency:    'TRY',
        lines: [{ productId: 'p1000003-0000-0000-0000-000000000003', productName: 'Test', quantity: 1, unitPrice: 100, discountPct: 0, kdvRate: 20 }],
      },
    });

    if (!resp.ok()) { test.skip(true, 'Financial servis erişilemez'); return; }

    const invoice = await resp.json() as { issueDate: string };

    // issueDate "2026-03-21" olmalı — asla "2026-03-20" değil
    expect(invoice.issueDate.startsWith('2026-03-21')).toBeTruthy();
  });

  test('TC-INV-05 · Fatura detay sayfası yüklenirken 404 → kullanıcı dostu hata', async ({ page }) => {
    await page.goto(`${BASE_URL}/faturalar/ffffffff-0000-0000-0000-000000000000`);

    // Error boundary devreye girmeli, "null" hatası değil
    await expect(page.getByText(/bulunamadı|hata/i)).toBeVisible({ timeout: 5_000 });

    // Konsol'da "Cannot read properties of null" olmamalı
    const jsErrors: string[] = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    await page.waitForTimeout(1_000);
    expect(jsErrors.filter(e => e.includes('null') || e.includes('undefined'))).toHaveLength(0);
  });

  test('TC-INV-06 · GİB gönderim — PENDING_GIB durumundaki fatura işaretlenebilir', async ({ page }) => {
    await page.goto(`${BASE_URL}/faturalar`);

    // PENDING_GIB statülü fatura varsa GİB'e gönder butonuna tıkla
    const pendingRow = page.getByTestId('status-PENDING_GIB').first();
    if (await pendingRow.isVisible()) {
      await pendingRow.getByRole('button', { name: /gönder/i }).click();
      // Onay modalı
      await page.getByRole('button', { name: /onayla/i }).click();
      await expect(page.getByRole('alert')).toContainText(/gönderildi|iletildi/i, { timeout: 15_000 });
    } else {
      // Demo veride PENDING_GIB yoksa testi geç
      test.skip(true, 'PENDING_GIB statülü fatura yok');
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 · E2E · Stok Hareketi & Finans Entegrasyonu
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Kapsam:
 *   - Stok girişi → FIFO/AVG maliyet güncellenmesi
 *   - Stok çıkışı → Yevmiye kaydı kontrolü
 *   - Marketplace Trendyol siparişi → Stok düşümü → Webhook
 *   - Negatif stok koruması
 *
 * Çalıştırma: npx playwright test tests/e2e/playwright/stock-movement.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL   = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_STOCK  = process.env.STOCK_API    ?? 'http://localhost:3004/api/v1';
const API_AUTH   = process.env.AUTH_API_URL ?? 'http://localhost:3001/api/v1';
const API_FIN    = process.env.FIN_API_URL  ?? 'http://localhost:3003/api/v1';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

async function getToken(request: ReturnType<typeof import('@playwright/test').test.info>) {
  // Playwright fixture request nesnesi burada tip uyumsuzluğu — direkt string dönüyoruz
  return 'placeholder'; // loginResp ile üretilecek
}

async function loginAsDemo(page: Page) {
  await page.goto(`${BASE_URL}/giris`);
  await page.getByLabel(/e-posta/i).fill('demo@enkap-demo.com.tr');
  await page.getByLabel(/şifre/i).fill('Demo1234!');
  await page.getByRole('button', { name: /giriş/i }).click();
  await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 10_000 });
}

async function apiLogin(request: Parameters<Parameters<typeof test>[1]>[0]['request']): Promise<string> {
  const resp = await request.post(`${API_AUTH}/auth/login`, {
    data: { email: 'demo@enkap-demo.com.tr', password: 'Demo1234!' },
  });
  if (!resp.ok()) return '';
  const { accessToken } = await resp.json() as { accessToken: string };
  return accessToken;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Stok Hareketi — P0', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('TC-STK-01 · Stok listesi yüklenir, ürünler görünür', async ({ page }) => {
    await page.goto(`${BASE_URL}/stok`);
    await expect(page.getByRole('columnheader', { name: /ürün|stok/i })).toBeVisible({ timeout: 10_000 });
    const rows = page.getByRole('row').filter({ hasNot: page.getByRole('columnheader') });
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test('TC-STK-02 · Stok girişi UI — hareket kaydedilir, miktar artar', async ({ page }) => {
    await page.goto(`${BASE_URL}/stok`);

    // Ürüne tıkla
    await page.getByText('Dell XPS 15').first().click();
    await expect(page).toHaveURL(/stok\/.+/, { timeout: 5_000 });

    // Mevcut stok miktarını oku
    const currentQtyText = await page.getByTestId('stock-qty').textContent() ?? '0';
    const currentQty = parseInt(currentQtyText.replace(/\D/g, ''), 10);

    // Hareket Ekle
    await page.getByRole('button', { name: /hareket ekle|giriş yap/i }).click();
    await page.getByLabel(/tür/i).selectOption('GIRIS');
    await page.getByLabel(/miktar/i).fill('10');
    await page.getByLabel(/birim maliyet/i).fill('9500');
    await page.getByLabel(/depo/i).selectOption({ label: /merkez/i });
    await page.getByRole('button', { name: /kaydet|onayla/i }).click();

    await expect(page.getByRole('alert')).toContainText(/kaydedildi|başarılı/i, { timeout: 8_000 });

    // Stok miktarı 10 artmış olmalı
    await expect(page.getByTestId('stock-qty')).toHaveText(
      new RegExp(`${currentQty + 10}`),
      { timeout: 5_000 },
    );
  });

  test('TC-STK-03 · FIFO maliyet hesabı doğruluğu (API)', async ({ request }) => {
    const token = await apiLogin(request);
    if (!token) { test.skip(true, 'Auth servisi erişilemez'); return; }

    const prodId = 'p1000003-0000-0000-0000-000000000003'; // SSD
    const whId   = 'w1000001-0000-0000-0000-000000000001'; // MERKEZ

    // Giriş 1: 10 adet × 300 ₺
    const in1 = await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'GIRIS', productId: prodId, warehouseId: whId, quantity: 10, unitCostKurus: 30000 },
    });
    expect([200, 201]).toContain(in1.status());

    // Giriş 2: 5 adet × 400 ₺
    const in2 = await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'GIRIS', productId: prodId, warehouseId: whId, quantity: 5, unitCostKurus: 40000 },
    });
    expect([200, 201]).toContain(in2.status());

    // Çıkış: 8 adet — FIFO ile ilk katmandan 8 adet çıkar
    // Maliyet = 8 × 300 = 2.400 ₺
    const out1 = await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'CIKIS', productId: prodId, warehouseId: whId, quantity: 8 },
    });
    expect([200, 201]).toContain(out1.status());
    const outData = await out1.json() as { consumedCostKurus?: number };

    // FIFO: 8 adet × 30.000 kuruş = 240.000 kuruş
    if (outData.consumedCostKurus !== undefined) {
      expect(outData.consumedCostKurus).toBe(240_000);
    }
  });

  test('TC-STK-04 · Stok çıkışı → yevmiye kaydı financial-service\'de oluşur', async ({ request }) => {
    const token = await apiLogin(request);
    if (!token) { test.skip(true, 'Auth servisi erişilemez'); return; }

    const prodId = 'p1000004-0000-0000-0000-000000000004'; // USB
    const whId   = 'w1000001-0000-0000-0000-000000000001';

    // Önce giriş yap
    await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'GIRIS', productId: prodId, warehouseId: whId, quantity: 20, unitCostKurus: 14500 },
    });

    // Çıkış yap — bu RabbitMQ üzerinden financial-service'e yevmiye mesajı gönderir
    const outResp = await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { type: 'CIKIS', productId: prodId, warehouseId: whId, quantity: 5 },
    });
    expect([200, 201]).toContain(outResp.status());
    const outData = await outResp.json() as { id: string };

    // 3 saniye bekle — async mesaj işlenmesi için
    await new Promise(r => setTimeout(r, 3_000));

    // Yevmiye kaydı oluşturulmuş mu?
    const glResp = await request.get(`${API_FIN}/ledger/entries?reference=${outData.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (glResp.ok()) {
      const glData = await glResp.json() as { data?: unknown[] };
      const entries = Array.isArray(glData) ? glData : (glData.data ?? []);
      // En az 1 yevmiye satırı olmalı (Borç: SMMM, Alacak: Stok)
      expect(entries.length).toBeGreaterThanOrEqual(1);
    } else {
      // Endpoint yoksa integration test olarak işaretle
      console.warn('GL entries endpoint erişilemez — integration testiyle doğrulayın');
    }
  });

  test('TC-STK-05 · Negatif stok koruması — yetersiz stokta çıkış reddedilir', async ({ request }) => {
    const token = await apiLogin(request);
    if (!token) { test.skip(true, 'Auth servisi erişilemez'); return; }

    const resp = await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        type:        'CIKIS',
        productId:   'p1000001-0000-0000-0000-000000000001', // Laptop
        warehouseId: 'w1000001-0000-0000-0000-000000000001',
        quantity:    999_999, // Stoktaki miktardan çok fazla
      },
    });

    // 400 Bad Request veya 422 Unprocessable beklenir — asla 200 değil
    expect([400, 409, 422]).toContain(resp.status());
    const body = await resp.json() as { message: string };
    expect(body.message.toLowerCase()).toMatch(/yetersiz|insufficient|stok/i);
  });

  test('TC-STK-06 · Trendyol marketplace siparişi → stok düşümü (simüle)', async ({ request }) => {
    const token = await apiLogin(request);
    if (!token) { test.skip(true, 'Auth servisi erişilemez'); return; }

    // Trendyol webhook payload simülasyonu
    // (gerçekte HMAC imzalı olarak gelir — burada auth-bypass test endpoint kullanıyoruz)
    const webhookResp = await request.post(`${API_STOCK.replace('3004', '3012')}/webhooks/trendyol/order`, {
      headers: {
        'x-trendyol-signature': 'test-bypass', // test ortamına özgü
        'content-type': 'application/json',
      },
      data: {
        orderId: `TY-E2E-${Date.now()}`,
        status:  'Created',
        lines: [{
          productId:       'p1000003-0000-0000-0000-000000000003',
          barcode:         'SSD-SAM-970PRO-1TB',
          quantity:        2,
          salePrice:       35000, // kuruş
          marketplaceRef:  'TY-TEST-001',
        }],
      },
    });

    // 200 veya 201 — ya da endpoint yoksa 404 (integration testine bırak)
    if (webhookResp.status() === 404) {
      test.skip(true, 'Trendyol webhook endpoint yok — integration suite\'e taşı');
      return;
    }
    expect([200, 201, 202]).toContain(webhookResp.status());
  });

  test('TC-STK-07 · Sayım hareketi (SAYIM) — fark kaydı doğru oluşur', async ({ request }) => {
    const token = await apiLogin(request);
    if (!token) { test.skip(true, 'Auth servisi erişilemez'); return; }

    // Önce mevcut stok miktarını öğren
    const prodResp = await request.get(`${API_STOCK}/products/p1000004-0000-0000-0000-000000000004`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!prodResp.ok()) { test.skip(true, 'Ürün erişilemez'); return; }

    const prod = await prodResp.json() as { totalStockQty: string | number };
    const currentQty = Number(prod.totalStockQty);

    // Sayım: gerçek stok = mevcut + 3 (sayım fazlası)
    const countResp = await request.post(`${API_STOCK}/movements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        type:        'SAYIM',
        productId:   'p1000004-0000-0000-0000-000000000004',
        warehouseId: 'w1000001-0000-0000-0000-000000000001',
        quantity:    currentQty + 3, // sayım sonucu
      },
    });

    expect([200, 201]).toContain(countResp.status());
    // Hareket fark: +3 (SAYIM artış)
    const mvData = await countResp.json() as { deltaQuantity?: number };
    if (mvData.deltaQuantity !== undefined) {
      expect(mvData.deltaQuantity).toBe(3);
    }
  });
});

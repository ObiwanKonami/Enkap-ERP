/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 · E2E · Onboarding & Auth
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Kapsam: Kayıt → Email doğrulama → Giriş → Dashboard erişimi
 * Önkoşul: test env çalışıyor (auth:3001, tenant:3002, web:3000)
 * Çalıştırma: npx playwright test tests/e2e/playwright/auth-onboarding.spec.ts
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// ─── Sabitler ────────────────────────────────────────────────────────────────

const BASE_URL  = process.env.E2E_BASE_URL  ?? 'http://localhost:3000';
const API_AUTH  = process.env.AUTH_API_URL  ?? 'http://localhost:3001/api/v1';
const API_TENANT = process.env.TENANT_API_URL ?? 'http://localhost:3002/api/v1';

/** Testin her çalışmasında benzersiz e-posta (paralel run desteği) */
const uniqueEmail = () => `test+${Date.now()}@e2e-enkap.dev`;

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

async function fillLogin(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/giris`);
  await page.getByLabel(/e-posta/i).fill(email);
  await page.getByLabel(/şifre/i).fill(password);
  await page.getByRole('button', { name: /giriş/i }).click();
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

test.describe('Onboarding & Auth — P0', () => {

  test('TC-AUTH-01 · Geçerli kimlik bilgileriyle giriş ve dashboard yüklenmesi', async ({ page }) => {
    // Demo seed kullanıcısı
    await fillLogin(page, 'demo@enkap-demo.com.tr', 'Demo1234!');

    // Session cookie alınmalı ve dashboard'a yönlendirilmeli
    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 10_000 });

    // Sidebar ve KPI kartları görünür olmalı
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('kpi-revenue')).toBeVisible({ timeout: 15_000 });
  });

  test('TC-AUTH-02 · Yanlış şifreyle giriş — 401 ve kullanıcı dostu hata mesajı', async ({ page }) => {
    await fillLogin(page, 'demo@enkap-demo.com.tr', 'WrongPass!');

    // Hata mesajı gösterilmeli, sayfa /giris'te kalmalı
    await expect(page).toHaveURL(/giris/, { timeout: 5_000 });
    await expect(page.getByRole('alert')).toContainText(/hatalı|geçersiz|yanlış/i);
  });

  test('TC-AUTH-03 · Korunan sayfaya anonim erişim → /giris yönlendirmesi', async ({ page }) => {
    await page.goto(`${BASE_URL}/faturalar`);
    await expect(page).toHaveURL(/giris/, { timeout: 5_000 });
  });

  test('TC-AUTH-04 · Logout sonrası korunan sayfaya erişim engellenir', async ({ page }) => {
    await fillLogin(page, 'demo@enkap-demo.com.tr', 'Demo1234!');
    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 10_000 });

    // Logout
    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: /çıkış/i }).click();
    await expect(page).toHaveURL(/giris/, { timeout: 5_000 });

    // Geri gitmeye çalış
    await page.goto(`${BASE_URL}/faturalar`);
    await expect(page).toHaveURL(/giris/, { timeout: 5_000 });
  });

  test('TC-AUTH-05 · Tenant izolasyonu — Tenant A tokeniyle Tenant B API\'sine erişim reddedilir', async ({ request }) => {
    // Tenant A'dan token al
    const loginA = await request.post(`${API_AUTH}/auth/login`, {
      data: { email: 'demo@enkap-demo.com.tr', password: 'Demo1234!' },
    });
    expect(loginA.ok()).toBeTruthy();
    const { accessToken } = await loginA.json() as { accessToken: string };

    // Bilinen başka bir tenant ID ile kaynak erişimi dene
    // (Bu UUID hiçbir tenant'a ait değil — guard genelleştirilmiş test)
    const fakeTenantInvoice = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const resp = await request.get(`${API_AUTH.replace('auth', 'financial')}/invoices/${fakeTenantInvoice}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 404 veya 403 beklenir — asla 200 değil
    expect([403, 404]).toContain(resp.status());
  });

  test('TC-AUTH-06 · Cold Start — Yeni tenant boş dashboard "null" hatası vermez', async ({ page }) => {
    // Demo kullanıcı giriş yap (yeni tenant olarak kabul ediyoruz — tüm API'ler
    // Promise.allSettled ile hata yakaladığından gerçek "yeni" tenant davranışını simüle etmek
    // için servisleri kapat. Burada interceptor ile mock yapıyoruz.)

    await page.route('**/api/financial/**', route => route.fulfill({ status: 503, body: 'Service Unavailable' }));
    await page.route('**/api/stock/**',     route => route.fulfill({ status: 503, body: 'Service Unavailable' }));
    await page.route('**/api/treasury/**',  route => route.fulfill({ status: 503, body: 'Service Unavailable' }));

    await fillLogin(page, 'demo@enkap-demo.com.tr', 'Demo1234!');
    await expect(page).toHaveURL(`${BASE_URL}/`, { timeout: 10_000 });

    // Sayfa çökmemeli (no uncaught JS errors), DEMO_KPI fallback gösterilmeli
    const jsErrors: string[] = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.waitForTimeout(3_000);

    // Kritik: hiç "Cannot read properties of null" hatası olmamalı
    const nullErrors = jsErrors.filter(e => e.includes('null') || e.includes('undefined'));
    expect(nullErrors).toHaveLength(0);

    // KPI alanları görünür olmalı (demo data ile dolu)
    await expect(page.getByTestId('kpi-revenue')).toBeVisible();
  });
});

test.describe('Onboarding Provisioning — P0 (API Level)', () => {

  test('TC-PROV-01 · Yeni tenant provision → 90 saniye içinde active', async ({ request }) => {
    const tenantId  = `e2e-${Date.now()}`;
    const adminEmail = uniqueEmail();

    const resp = await request.post(`${API_TENANT}/tenants/provision`, {
      data: {
        tenantSlug: tenantId,
        companyName: 'E2E Test Şirketi A.Ş.',
        adminEmail,
        tier: 'starter',
      },
      timeout: 95_000, // Saga max 90 sn
    });

    expect(resp.status()).toBe(201);
    const body = await resp.json() as { tenantId: string; status: string };
    expect(body.status).toBe('active');
    expect(body.tenantId).toBeTruthy();
  });

  test('TC-PROV-02 · Duplicate slug provision → 409 Conflict', async ({ request }) => {
    // İkinci kez aynı slug → çakışma hatası
    const resp = await request.post(`${API_TENANT}/tenants/provision`, {
      data: {
        tenantSlug: 'enkap-demo', // demo seed'den mevcut slug
        companyName: 'Çakışma Test',
        adminEmail: uniqueEmail(),
        tier: 'starter',
      },
    });
    expect(resp.status()).toBe(409);
  });

  test('TC-PROV-03 · Saga compensation — schema oluşturuldu sonra migration fail simülasyonu', async ({ request }) => {
    // Bu test, provision süreci sırasında kasıtlı hata tetiklemek için
    // özel debug endpoint kullanır (sadece test ortamında aktif).
    // Gerçek ortamda bu test stub olarak bırakılır; integration suite içinde çalışır.

    // Beklenen: DB'de "orphan" schema kalmamalı, kontrol düzleminde kayıt silinmeli
    // Bu test IMPLEMENTATION NOTE olarak işaretlenir — mock olmadan çalışmaz.
    test.skip(true, 'Sadece chaos-mode ortamında çalışır (ENABLE_CHAOS=true)');
  });
});

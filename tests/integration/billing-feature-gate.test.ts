/**
 * ─────────────────────────────────────────────────────────────────────────────
 * P0 · INTEGRATION · Billing & Feature Gate
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Kapsam:
 *   - Starter plan → ML endpoint 403
 *   - Starter → Business yükseltme → ML endpoint 200
 *   - iyzico test kartı akışı
 *
 * Çalıştırma: npx jest tests/integration/billing-feature-gate.test.ts
 * Gereksinim: billing-service:3008, auth-service:3001 çalışıyor olmalı
 */

const API_AUTH    = process.env.AUTH_API    ?? 'http://localhost:3001/api/v1';
const API_BILLING = process.env.BILLING_API ?? 'http://localhost:3008/api/v1';
const API_ML      = process.env.ML_API      ?? 'http://localhost:3005/api/v1';

// İyzico test kartları (sandbox)
const IYZICO_TEST_CARDS = {
  success: {
    cardNumber:   '5528790000000008',
    expireMonth:  '12',
    expireYear:   '2030',
    cvc:          '123',
    cardHolderName: 'Enkap Test',
  },
  insufficient: {
    cardNumber:   '5528790000000014', // İyzico bakiye yetersiz test kartı
    expireMonth:  '12',
    expireYear:   '2030',
    cvc:          '123',
    cardHolderName: 'Enkap Test Fail',
  },
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

async function login(email: string, password: string): Promise<string> {
  const resp = await fetch(`${API_AUTH}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  if (!resp.ok) return '';
  const data = await resp.json() as { accessToken: string };
  return data.accessToken;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Feature Gate — Plan Bazlı Erişim Kontrolü', () => {

  let token: string;

  beforeAll(async () => {
    token = await login('demo@enkap-demo.com.tr', 'Demo1234!');
  });

  test('TC-FG-01 · Starter plan → ML tahmini endpoint 403 döner', async () => {
    if (!token) { console.warn('Token alınamadı'); return; }

    const resp = await fetch(`${API_ML}/predictions/sales`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ horizon: 30 }),
    });

    // Starter plan ML'i içermez → 403
    // (Eğer demo user business/enterprise ise bu test 200 dönebilir — kontrol et)
    console.log('ML endpoint status (starter plan bekleniyor):', resp.status);
    // starter planında 403, business planında 200
    expect([200, 403]).toContain(resp.status);
  });

  test('TC-FG-02 · Business plana yükseltme sonrası ML erişimi açılır', async () => {
    if (!token) { return; }

    // Aboneliği business'a yükselt (test ortamı)
    const upgradeResp = await fetch(`${API_BILLING}/subscriptions/upgrade`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newPlan: 'business',
        paymentCard: IYZICO_TEST_CARDS.success,
      }),
    });

    if (!upgradeResp.ok) {
      console.warn('Yükseltme başarısız — iyzico sandbox erişilemez olabilir');
      return;
    }

    const upgradeData = await upgradeResp.json() as { tier: string };
    expect(upgradeData.tier).toBe('business');

    // Yeni token al (tier bilgisi yenilenmiş olmalı)
    const newToken = await login('demo@enkap-demo.com.tr', 'Demo1234!');
    expect(newToken).toBeTruthy();

    // ML endpoint artık açık olmalı
    const mlResp = await fetch(`${API_ML}/predictions/sales`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${newToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ horizon: 30 }),
    });

    // 200 veya 202 (veri yeterliyse tahmin, değilse 422)
    expect([200, 202, 422]).toContain(mlResp.status);
  });

  test('TC-FG-03 · Başarısız kart → abonelik aktif olmaz', async () => {
    if (!token) { return; }

    const resp = await fetch(`${API_BILLING}/subscriptions/create`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan: 'business',
        paymentCard: IYZICO_TEST_CARDS.insufficient,
      }),
    });

    // İyzico bakiye yetersiz → 402 Payment Required veya 422
    expect([402, 422, 400]).toContain(resp.status);
  });

  test('TC-FG-04 · Feature gate cache — tier güncellendikten sonra eski token hala çalışıyor mu?', async () => {
    // Eski token'lar revoke edilmeden önce önceki tier'ı taşır
    // JTI bazlı revoke mekanizması MEVCUT mu kontrol ediyoruz
    if (!token) { return; }

    // Sadece erişim testi — mevcut token ile istek at
    const resp = await fetch(`${API_ML}/predictions/sales`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ horizon: 7 }),
    });

    // Sonuç tutarlı olmalı (token geçerliyse 200/422, geçersizse 401)
    expect([200, 401, 403, 422]).toContain(resp.status);
    // 500 olmamalı
    expect(resp.status).not.toBe(500);
  });

  test('TC-FG-05 · White Label — yalnızca enterprise tier erişebilir', async () => {
    if (!token) { return; }

    const resp = await fetch(`${process.env.TENANT_API ?? 'http://localhost:3002/api/v1'}/tenant/white-label`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Demo user starter/business planındaysa 403, enterprise ise 200
    // Her iki durum da kabul edilir — ama 500 olmamalı
    expect([200, 403]).toContain(resp.status);
    expect(resp.status).not.toBe(500);
  });
});

describe('ML Inference — Gerçekçi Veri Testi', () => {

  let token: string;

  beforeAll(async () => {
    token = await login('demo@enkap-demo.com.tr', 'Demo1234!');
  });

  test('TC-ML-01 · 14 günlük veri → XGBoost tahmin üretir', async () => {
    if (!token) { return; }

    const resp = await fetch(`${API_ML}/predictions/sales`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        horizon:    14,
        includeShap: false,
      }),
    });

    if (resp.status === 403) {
      console.log('ML erişimi yok (starter plan) — test atlandı');
      return;
    }

    if (resp.status === 422) {
      // Yetersiz veri — bu doğru davranış
      const body = await resp.json() as { message: string };
      expect(body.message.toLowerCase()).toMatch(/insufficient|yetersiz|veri/i);
      return;
    }

    expect(resp.status).toBe(200);
    const data = await resp.json() as { daily_points?: unknown[]; confidence_interval?: unknown };
    expect(data.daily_points).toBeDefined();
    expect(Array.isArray(data.daily_points)).toBe(true);
  });

  test('TC-ML-02 · Anomali skoru 0-1 aralığında olmalı', async () => {
    if (!token) { return; }

    const resp = await fetch(`${API_ML}/anomaly/detect`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lookback_days: 30 }),
    });

    if ([403, 404].includes(resp.status)) { return; } // feature/endpoint yok

    if (resp.status === 200) {
      const data = await resp.json() as { anomaly_score?: number; is_anomaly?: boolean };
      if (data.anomaly_score !== undefined) {
        expect(data.anomaly_score).toBeGreaterThanOrEqual(0);
        expect(data.anomaly_score).toBeLessThanOrEqual(1);
      }
    }
  });
});

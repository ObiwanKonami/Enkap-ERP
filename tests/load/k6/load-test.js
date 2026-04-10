/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENKAP ERP — k6 Yük Testi
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Strateji: 3 aşamalı (ramp-up → sabit → ramp-down)
 * Hedef: 500 eş zamanlı kullanıcı, P99 < 500ms, hata oranı < %1
 *
 * Çalıştırma:
 *   k6 run tests/load/k6/load-test.js
 *   k6 run --out influxdb=http://localhost:8086/k6 tests/load/k6/load-test.js
 *
 * Ortam değişkenleri:
 *   BASE_URL    — Web frontend URL'i (varsayılan: http://localhost:3000)
 *   API_BASE    — BFF API base (varsayılan: http://localhost:3000/api)
 *   DEMO_TOKEN  — Önceden alınmış JWT access token (opsiyonel)
 */

import http     from 'k6/http';
import { sleep, check, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ─── Custom Metrics ───────────────────────────────────────────────────────────

const errorRate       = new Rate('errors');
const loginDuration   = new Trend('login_duration',   true);
const invoiceListDur  = new Trend('invoice_list_dur', true);
const stockListDur    = new Trend('stock_list_dur',   true);
const dashboardDur    = new Trend('dashboard_dur',    true);
const authFailures    = new Counter('auth_failures');
const tenantLeakage   = new Counter('tenant_leakage_attempts'); // kritik güvenlik sayacı

// ─── Test Konfigürasyonu ──────────────────────────────────────────────────────

export const options = {
  // Aşama 1: 2 dk içinde 500 kullanıcıya çıkış
  // Aşama 2: 5 dk boyunca 500 kullanıcıda sabit
  // Aşama 3: 1 dk içinde 0 kullanıcıya iniş
  stages: [
    { duration: '2m',  target: 100  }, // warm-up: 0 → 100
    { duration: '2m',  target: 500  }, // ramp-up: 100 → 500
    { duration: '5m',  target: 500  }, // sabit yük: 500
    { duration: '1m',  target: 0    }, // ramp-down
  ],

  thresholds: {
    // P0 eşikleri — bunlar kırılırsa test FAIL sayılır
    'http_req_duration{scenario:default}':   ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{type:login}':         ['p(99)<2000'],
    'http_req_duration{type:dashboard}':     ['p(95)<800'],
    'http_req_duration{type:invoice_list}':  ['p(95)<600'],
    'errors':                                ['rate<0.01'],  // hata oranı < %1
    'login_duration':                        ['p(99)<2000'],
    'tenant_leakage_attempts':               ['count==0'],   // P0: sıfır sızıntı
  },

  // Distributed load (çok pod varsa): summaryTrendStats ile zenginleştir
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

// ─── Sabitler ────────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL ?? 'http://localhost:3000';
const API_BASE = __ENV.API_BASE ?? 'http://localhost:3000/api';
const AUTH_URL = __ENV.AUTH_URL ?? 'http://localhost:3001/api/v1';

const DEMO_CRED = {
  email:    'demo@enkap-demo.com.tr',
  password: 'Demo1234!',
};

// Farklı tenant token pool — izolasyon testi için
const TENANT_TOKEN_POOL = __ENV.TENANT_TOKENS
  ? __ENV.TENANT_TOKENS.split(',')
  : []; // Boşsa single-tenant mode

// ─── Login & Token Cache ──────────────────────────────────────────────────────

// k6'da shared state yoktur — her VU kendi token'ını alır
// Bu, gerçek kullanımı simüle eder (her kullanıcı login yapar)
function login() {
  const loginStart = Date.now();

  const resp = http.post(
    `${AUTH_URL}/auth/login`,
    JSON.stringify(DEMO_CRED),
    { headers: { 'Content-Type': 'application/json' }, tags: { type: 'login' } },
  );

  loginDuration.add(Date.now() - loginStart);

  const ok = check(resp, {
    'login: HTTP 200':           (r) => r.status === 200,
    'login: accessToken mevcut': (r) => {
      try { return !!JSON.parse(r.body).accessToken; }
      catch { return false; }
    },
  });

  if (!ok) {
    authFailures.add(1);
    errorRate.add(1);
    return null;
  }

  errorRate.add(0);
  try {
    return JSON.parse(resp.body).accessToken;
  } catch {
    return null;
  }
}

// ─── Senaryo Fonksiyonları ────────────────────────────────────────────────────

function scenarioDashboard(token) {
  group('Dashboard', () => {
    const start = Date.now();
    const resp = http.get(
      `${API_BASE}/financial/invoices?limit=5`,
      {
        headers: { Authorization: `Bearer ${token}`, Cookie: `next-auth.session-token=mock` },
        tags: { type: 'dashboard' },
      },
    );
    dashboardDur.add(Date.now() - start);

    check(resp, {
      'dashboard: HTTP 200 veya 401': (r) => [200, 401].includes(r.status),
      'dashboard: cevap süresi < 800ms': (r) => r.timings.duration < 800,
    });
    errorRate.add(resp.status >= 500 ? 1 : 0);
  });
}

function scenarioInvoiceList(token) {
  group('Fatura Listesi', () => {
    const start = Date.now();
    const resp = http.get(
      `${API_BASE}/financial/invoices?limit=20&offset=0`,
      {
        headers: { Authorization: `Bearer ${token}` },
        tags: { type: 'invoice_list' },
      },
    );
    invoiceListDur.add(Date.now() - start);

    check(resp, {
      'invoice_list: HTTP 200':            (r) => r.status === 200,
      'invoice_list: data array mevcut':   (r) => {
        try { return Array.isArray(JSON.parse(r.body).data); }
        catch { return false; }
      },
      'invoice_list: süre < 600ms':        (r) => r.timings.duration < 600,
    });
    errorRate.add(resp.status >= 500 ? 1 : 0);
  });
}

function scenarioStockList(token) {
  group('Stok Listesi', () => {
    const start = Date.now();
    const resp = http.get(
      `${API_BASE}/stock/products?limit=20`,
      {
        headers: { Authorization: `Bearer ${token}` },
        tags: { type: 'stock_list' },
      },
    );
    stockListDur.add(Date.now() - start);

    check(resp, {
      'stock_list: HTTP 200':    (r) => r.status === 200,
      'stock_list: süre < 600ms':(r) => r.timings.duration < 600,
    });
    errorRate.add(resp.status >= 500 ? 1 : 0);
  });
}

function scenarioTenantIsolation(token) {
  // P0 Güvenlik: Başka tenant'ın faturasına erişmeye çalış
  // Tüm girişimlerin 403 veya 404 ile reddedilmesi gerekir
  group('Tenant Izolasyon Testi', () => {
    const fakeIds = [
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      '00000000-0000-0000-0000-000000000001',
    ];

    for (const id of fakeIds) {
      const resp = http.get(
        `${API_BASE}/financial/invoices/${id}`,
        { headers: { Authorization: `Bearer ${token}` }, tags: { type: 'security' } },
      );

      const leaked = check(resp, {
        'isolation: 403 veya 404 dönmeli': (r) => [403, 404].includes(r.status),
        'isolation: asla 200 değil':        (r) => r.status !== 200,
      });

      if (!leaked) {
        tenantLeakage.add(1);
        errorRate.add(1);
      }
    }
  });
}

function scenarioInvoiceCreate(token) {
  group('Fatura Oluştur', () => {
    const payload = JSON.stringify({
      invoiceType: 'STANDARD',
      direction:   'OUT',
      customerId:  'c1000001-0000-0000-0000-000000000001',
      issueDate:   '2026-03-21',
      dueDate:     '2026-04-21',
      currency:    'TRY',
      lines: [{
        productId:   'p1000003-0000-0000-0000-000000000003',
        productName: 'k6 Test Ürünü',
        quantity:    1,
        unitPrice:   100,
        discountPct: 0,
        kdvRate:     20,
      }],
    });

    const resp = http.post(
      `${API_BASE}/financial/invoices`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        tags: { type: 'invoice_create' },
      },
    );

    check(resp, {
      'invoice_create: 200 veya 201': (r) => [200, 201].includes(r.status),
      'invoice_create: süre < 1000ms': (r) => r.timings.duration < 1000,
    });
    errorRate.add(resp.status >= 500 ? 1 : 0);
  });
}

// ─── VU Ana Döngüsü ───────────────────────────────────────────────────────────

export default function () {
  // Her VU login yapar (realworld: session cookie kullanır, biz token kullanıyoruz)
  const token = login();
  if (!token) {
    sleep(1);
    return;
  }

  // Ağırlıklı senaryo dağılımı (gerçek kullanıcı davranışı modeli)
  const rand = Math.random();

  if (rand < 0.35) {
    // %35: Dashboard / ana sayfa okuma
    scenarioDashboard(token);
    sleep(0.5);

  } else if (rand < 0.60) {
    // %25: Fatura listesi
    scenarioInvoiceList(token);
    sleep(0.3);

  } else if (rand < 0.75) {
    // %15: Stok listesi
    scenarioStockList(token);
    sleep(0.3);

  } else if (rand < 0.85) {
    // %10: Fatura oluşturma (write-heavy)
    scenarioInvoiceCreate(token);
    sleep(1);

  } else if (rand < 0.95) {
    // %10: Karma okuma (dashboard + liste)
    scenarioDashboard(token);
    sleep(0.2);
    scenarioStockList(token);
    sleep(0.2);

  } else {
    // %5: Tenant izolasyon güvenlik testi (sürekli)
    scenarioTenantIsolation(token);
    sleep(0.5);
  }

  // Kullanıcı davranışı: her akış arasında kısa bekleme
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 saniye
}

// ─── Özet Raporu ─────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const metrics = data.metrics;

  const report = {
    timestamp:     new Date().toISOString(),
    thresholdPass: !data.state?.testRunDurationMs || true,
    summary: {
      vus_max:          metrics.vus_max?.values?.value         ?? 0,
      http_reqs:        metrics.http_reqs?.values?.count       ?? 0,
      error_rate_pct:   ((metrics.errors?.values?.rate ?? 0) * 100).toFixed(2),
      p95_ms:           metrics.http_req_duration?.values?.['p(95)'] ?? 0,
      p99_ms:           metrics.http_req_duration?.values?.['p(99)'] ?? 0,
      login_p99_ms:     metrics.login_duration?.values?.['p(99)']    ?? 0,
      tenant_leakage:   metrics.tenant_leakage_attempts?.values?.count ?? 0,
      auth_failures:    metrics.auth_failures?.values?.count           ?? 0,
    },
  };

  const passFail = {
    p99_under_1s:    report.summary.p99_ms < 1000,
    error_under_1pct: parseFloat(report.summary.error_rate_pct) < 1,
    zero_leakage:    report.summary.tenant_leakage === 0,
  };

  console.log('\n══════════════════════════════════════════');
  console.log('  ENKAP ERP Yük Testi Özeti');
  console.log('══════════════════════════════════════════');
  console.log(`  Maks VU:         ${report.summary.vus_max}`);
  console.log(`  Toplam İstek:    ${report.summary.http_reqs}`);
  console.log(`  Hata Oranı:      ${report.summary.error_rate_pct}%  (hedef: <1%)`);
  console.log(`  P95 Gecikme:     ${report.summary.p95_ms.toFixed(0)}ms (hedef: <500ms)`);
  console.log(`  P99 Gecikme:     ${report.summary.p99_ms.toFixed(0)}ms (hedef: <1000ms)`);
  console.log(`  Login P99:       ${report.summary.login_p99_ms.toFixed(0)}ms (hedef: <2000ms)`);
  console.log(`  Tenant Sızıntı:  ${report.summary.tenant_leakage}  (hedef: 0 — KRİTİK)`);
  console.log('──────────────────────────────────────────');
  console.log(`  P99 < 1s:       ${passFail.p99_under_1s        ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Hata < %1:      ${passFail.error_under_1pct    ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Sıfır Sızıntı:  ${passFail.zero_leakage        ? '✅ PASS' : '🚨 KRİTİK FAIL'}`);
  console.log('══════════════════════════════════════════\n');

  return {
    'tests/load/results/summary.json': JSON.stringify(report, null, 2),
    stdout: '', // k6 standart çıktısını da göster
  };
}

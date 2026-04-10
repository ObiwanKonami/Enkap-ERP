import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries:   process.env.CI ? 2 : 0,
  workers:   process.env.CI ? 4 : 2,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../../reports/playwright', open: 'never' }],
    ['json', { outputFile: '../../reports/playwright/results.json' }],
  ],
  use: {
    baseURL:          process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace:            'on-first-retry',
    screenshot:       'only-on-failure',
    video:            'retain-on-failure',
    actionTimeout:    10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      // Mobil testleri sadece kritik akışlarda çalıştır
      testMatch: ['**/auth-onboarding.spec.ts'],
    },
  ],
  // Web server'ı otomatik başlat (local dev için)
  webServer: process.env.CI ? undefined : {
    command:              'pnpm --filter @enkap/web dev',
    url:                  'http://localhost:3000',
    reuseExistingServer: true,
    timeout:             60_000,
  },
});

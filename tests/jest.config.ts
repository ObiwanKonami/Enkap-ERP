import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  testMatch: [
    'tests/unit/**/*.test.ts',
    'tests/integration/**/*.test.ts',
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        // Minimal config — test ortamı için
        target:              'ES2022',
        module:              'commonjs',
        strict:              true,
        esModuleInterop:     true,
        experimentalDecorators: true,
        emitDecoratorMetadata:  true,
        skipLibCheck:        true,
      },
    }],
  },
  testEnvironment: 'node',
  verbose:         true,
  // Unit testlerde DB yoktur — timeout kısa
  testTimeout:     10_000,
  // Integration testlerde servisler ayağa kalkıyor
  projects: [
    {
      displayName: 'unit',
      testMatch:   ['<rootDir>/tests/unit/**/*.test.ts'],
      testTimeout: 10_000,
    },
    {
      displayName: 'integration',
      testMatch:   ['<rootDir>/tests/integration/**/*.test.ts'],
      testTimeout: 30_000, // servis çağrıları için daha uzun
    },
  ],
  collectCoverageFrom: [
    'apps/*/src/shared/money.ts',
    'apps/web/src/lib/format.ts',
  ],
  coverageThresholds: {
    global: {
      branches:   80,
      functions:  90,
      lines:      90,
      statements: 90,
    },
  },
};

export default config;

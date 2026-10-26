import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.HUB_E2E_BASE_URL ?? 'http://127.0.0.1:3101'

export default defineConfig({
  testDir: '../',
  testMatch: ['hub-access/*.spec.ts', 'reportes-offline/*.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/hub-access/.results/results.json' }]],
  outputDir: 'e2e/hub-access/.results/artifacts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: ['hub-access/*.spec.ts', 'reportes-offline/*.spec.ts'],
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'mobile-chromium',
      testMatch: 'hub-access/*.spec.ts',
      use: { ...devices['iPhone 13'], browserName: 'chromium', channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'node serve.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})

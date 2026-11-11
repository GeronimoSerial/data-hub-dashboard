import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.T8_E2E_BASE_URL ?? 'http://127.0.0.1:3118'

export default defineConfig({
  testDir: '.',
  testMatch: 'cuadernillos.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '.results/artifacts',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'node serve.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
